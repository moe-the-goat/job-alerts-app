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

// Build a `from("runs")` chain that resolves maybeSingle() to the given status.
function wireLastRunStatus(status: string | null) {
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
                    : { data: { status } },
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
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

  it("dispatches the workflow with the manual + per-user inputs on success", async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    wireLastRunStatus("success");
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
    wireLastRunStatus(null);
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
