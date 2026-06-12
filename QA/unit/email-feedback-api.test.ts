/**
 * Locks the POST /api/email-feedback contract (task W2):
 *   - 400 on malformed JSON / short token / bad id / type outside the email enum
 *   - RPC in-band errors map to honest statuses:
 *       invalid_token → 401, expired → 410, job_not_found → 404
 *   - 200 + {ok, id, duplicate} passthrough on success
 *   - 502 when the RPC returns an unrecognizable shape
 * The route is session-less by design — the token IS the authorization,
 * validated inside the SECURITY DEFINER RPC (migration 0012).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcMock }),
}));

import { POST } from "@/app/api/email-feedback/route";

const TOKEN = "a".repeat(43); // realistic token_urlsafe(32) length

function postJson(body: unknown) {
  return new Request("https://x.test/api/email-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => rpcMock.mockReset());

describe("POST /api/email-feedback", () => {
  it("400 on invalid JSON body", async () => {
    const res = await POST(
      new Request("https://x.test/api/email-feedback", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("400 when the token is too short to be real", async () => {
    const res = await POST(
      postJson({ token: "short", job_result_id: 1, feedback_type: "applied" }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("400 on a non-integer job_result_id", async () => {
    const res = await POST(
      postJson({ token: TOKEN, job_result_id: "abc", feedback_type: "applied" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on feedback types the email page doesn't offer", async () => {
    // wrong_location/other are valid app-side but NOT via the email page.
    const res = await POST(
      postJson({ token: TOKEN, job_result_id: 1, feedback_type: "wrong_location" }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_token", 401],
    ["expired", 410],
    ["job_not_found", 404],
    ["invalid_type", 400],
  ])("maps RPC error %s to HTTP %d", async (rpcError, status) => {
    rpcMock.mockResolvedValue({ data: { ok: false, error: rpcError }, error: null });
    const res = await POST(
      postJson({ token: TOKEN, job_result_id: 7, feedback_type: "applied" }),
    );
    expect(res.status).toBe(status);
  });

  it("200 with id + duplicate flag on success, calling the RPC with the exact args", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, id: 99, duplicate: false },
      error: null,
    });
    const res = await POST(
      postJson({ token: TOKEN, job_result_id: 7, feedback_type: "block_company" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 99, duplicate: false });
    expect(rpcMock).toHaveBeenCalledWith("submit_email_feedback", {
      p_token: TOKEN,
      p_job_result_id: 7,
      p_feedback_type: "block_company",
      p_note: null,
    });
  });

  it("forwards a trimmed note to the RPC", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, id: 5, duplicate: false },
      error: null,
    });
    const res = await POST(
      postJson({
        token: TOKEN,
        job_result_id: 7,
        feedback_type: "not_relevant",
        note: "  too senior  ",
      }),
    );
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("submit_email_feedback", {
      p_token: TOKEN,
      p_job_result_id: 7,
      p_feedback_type: "not_relevant",
      p_note: "too senior",
    });
  });

  it("collapses a blank note to null", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, id: 6, duplicate: false },
      error: null,
    });
    await POST(
      postJson({
        token: TOKEN,
        job_result_id: 7,
        feedback_type: "applied",
        note: "   ",
      }),
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "submit_email_feedback",
      expect.objectContaining({ p_note: null }),
    );
  });

  it("400 on a note past the length cap, without calling the RPC", async () => {
    const res = await POST(
      postJson({
        token: TOKEN,
        job_result_id: 7,
        feedback_type: "applied",
        note: "x".repeat(501),
      }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("400 on a non-string note", async () => {
    const res = await POST(
      postJson({
        token: TOKEN,
        job_result_id: 7,
        feedback_type: "applied",
        note: 42,
      }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("treats a duplicate tap as success (idempotent contract)", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, id: 12, duplicate: true },
      error: null,
    });
    const res = await POST(
      postJson({ token: TOKEN, job_result_id: 7, feedback_type: "applied" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, duplicate: true });
  });

  it("500 when the RPC itself errors, 502 when it returns garbage", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    let res = await POST(
      postJson({ token: TOKEN, job_result_id: 7, feedback_type: "applied" }),
    );
    expect(res.status).toBe(500);

    rpcMock.mockResolvedValue({ data: { weird: true }, error: null });
    res = await POST(
      postJson({ token: TOKEN, job_result_id: 7, feedback_type: "applied" }),
    );
    expect(res.status).toBe(502);
  });
});
