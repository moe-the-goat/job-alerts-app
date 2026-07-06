/**
 * Locks the manual-run + reschedule server actions:
 *   * triggerManualRunAction — auth + missing-token + budget-exhausted +
 *     in-flight guards, and the exact GitHub workflow_dispatch payload;
 *   * rescheduleRunAction — future/30-day validation and the scoped write.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: fromMock,
  }),
}));

import { triggerManualRunAction, rescheduleRunAction } from "@/app/actions/run";

const USER = "user-xyz";

beforeEach(() => {
  getUserMock.mockReset();
  rpcMock.mockReset();
  fromMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GH_DISPATCH_TOKEN = "ghp_test_token";
  getUserMock.mockResolvedValue({ data: { user: { id: USER } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GH_DISPATCH_TOKEN;
});

// Wire both tables the action touches:
//  - runs: the latest-run read (maybeSingle → {status, started_at})
//  - preferences: the pending-dispatch read (.select().eq().maybeSingle() →
//    {last_manual_dispatch_at}), the atomic dispatch-claim conditional update
//    (.update().eq().or().select().maybeSingle()) + the release update().eq()
// `claimWon` controls whether the claim returns a row (true) or zero rows
// (false = another dispatch already claimed it). `dispatchedAt` is the stored
// last_manual_dispatch_at; `startedAt` the latest run's started_at.
function wireSupabase(
  status: string | null,
  {
    claimWon = true,
    dispatchedAt = null as string | null,
    startedAt = "2026-01-01T00:00:00Z",
  } = {},
) {
  fromMock.mockImplementation((table: string) => {
    if (table === "runs") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () =>
                  status === null
                    ? { data: null }
                    : { data: { status, started_at: startedAt } },
              }),
            }),
          }),
        }),
      };
    }
    if (table === "preferences") {
      return {
        // pending-dispatch read: .select().eq().maybeSingle()
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { last_manual_dispatch_at: dispatchedAt },
              error: null,
            }),
          }),
        }),
        update: () => ({
          // claim path: .eq().or().select().maybeSingle()
          eq: () => ({
            or: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: claimWon ? { user_id: USER } : null,
                  error: null,
                }),
              }),
            }),
            // release path: .update().eq() resolves directly
            then: (res: (v: unknown) => unknown) => res({ error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// Back-compat alias for the runs-only tests.
function wireLastRunStatus(status: string | null) {
  wireSupabase(status);
}

describe("triggerManualRunAction", () => {
  it("rejects when the session is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await triggerManualRunAction();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/session/i);
  });

  it("rejects when the dispatch token isn't configured", async () => {
    delete process.env.GH_DISPATCH_TOKEN;
    const res = await triggerManualRunAction();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when the daily budget is exhausted (no dispatch)", async () => {
    rpcMock.mockResolvedValue({ data: 2, error: null });
    const res = await triggerManualRunAction();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/all 2/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when a run is already in flight (no dispatch)", async () => {
    rpcMock.mockResolvedValue({ data: 0, error: null });
    wireLastRunStatus("running");
    const res = await triggerManualRunAction();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/in progress/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects while a dispatched run is still warming up (no runs row yet)", async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    // Dispatched 5 min ago (user's own press OR an admin forced run — both
    // stamp last_manual_dispatch_at); the worker hasn't inserted its runs row
    // yet, so the latest run predates the dispatch.
    wireSupabase("success", {
      dispatchedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      startedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    });
    const res = await triggerManualRunAction();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already starting/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a new dispatch once the previous one landed as a runs row", async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    // Dispatched 30 min ago and its run landed (started AFTER the dispatch)
    // and finished — the pending guard must not block forever.
    wireSupabase("success", {
      dispatchedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await triggerManualRunAction();
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a double-press: when the atomic claim is lost, no dispatch fires", async () => {
    rpcMock.mockResolvedValue({ data: 0, error: null });
    // No run in flight yet (the race window), but the claim update returns zero
    // rows because a near-simultaneous press already claimed the slot.
    wireSupabase("success", { claimWon: false });
    const res = await triggerManualRunAction();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/just started|few minutes/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches the workflow with the manual + per-user inputs on success", async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    wireSupabase("success", { claimWon: true });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const res = await triggerManualRunAction();
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/minutes/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/repos/moe-the-goat/Automated-AI-Job-Intelligence-System/actions/workflows/multi_user.yml/dispatches",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer ghp_test_token");
    const body = JSON.parse(init.body);
    expect(body.ref).toBe("main");
    expect(body.inputs).toMatchObject({
      dry_run: "false",
      user_id: USER,
      skip_due_check: "true",
      manual: "true",
    });
  });

  it("surfaces a friendly error when GitHub returns non-204", async () => {
    rpcMock.mockResolvedValue({ data: 0, error: null });
    wireSupabase(null, { claimWon: true });
    fetchMock.mockResolvedValue(new Response("nope", { status: 422 }));
    const res = await triggerManualRunAction();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/couldn't be started|try again/i);
  });
});

describe("rescheduleRunAction", () => {
  function wireUpdateOk() {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });
    return { update, eq };
  }

  it("rejects an empty datetime", async () => {
    const fd = new FormData();
    const res = await rescheduleRunAction(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/date and time/i);
  });

  it("rejects a time in the past", async () => {
    const fd = new FormData();
    fd.set("next_run_at", new Date(Date.now() - 3600_000).toISOString());
    const res = await rescheduleRunAction(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/future/i);
  });

  it("rejects a time more than 30 days out", async () => {
    const fd = new FormData();
    fd.set("next_run_at", new Date(Date.now() + 40 * 86400_000).toISOString());
    const res = await rescheduleRunAction(fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/30 days/i);
  });

  it("writes next_run_at scoped to the user on a valid future time", async () => {
    const { update, eq } = wireUpdateOk();
    const iso = new Date(Date.now() + 3 * 3600_000).toISOString();
    const fd = new FormData();
    fd.set("next_run_at", iso);
    const res = await rescheduleRunAction(fd);
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ next_run_at: iso });
    expect(eq).toHaveBeenCalledWith("user_id", USER);
  });
});
