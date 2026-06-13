/**
 * Locks the POST /api/feedback contract:
 *   - 401 when no session
 *   - 400 on payload that fails enum / int validation
 *   - 404 when the job_result_id doesn't belong to the user
 *   - UPSERT into feedback (one verdict per (user, job)) with the right shape
 *   - a note backfills but a bare re-tap keeps the existing note
 *   - SECONDARY: a "bookmarked" reaction also upserts into bookmarks
 *   - DEFENSE IN DEPTH: every lookup is scoped by user_id even though RLS would already enforce it
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

import { POST } from "@/app/api/feedback/route";

interface JobLookupCalls {
  select: ReturnType<typeof vi.fn>;
  eqId: ReturnType<typeof vi.fn>;
  eqUser: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}
interface FeedbackWriteCalls {
  // note-lookup chain: .select("note").eq().eq().maybeSingle()
  existingNote: ReturnType<typeof vi.fn>;
  // write chain: .upsert(row, opts).select("id").single()
  upsert: ReturnType<typeof vi.fn>;
  upsertSelect: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}
interface BookmarkUpsertCalls {
  upsert: ReturnType<typeof vi.fn>;
}

function buildSupabase({
  job,
  existingNote = null,
  insertedFeedbackId,
  insertError,
  bookmarkError,
}: {
  job: object | null;
  existingNote?: string | null;
  insertedFeedbackId?: number;
  insertError?: { message: string } | null;
  bookmarkError?: { message: string } | null;
} = { job: null }) {
  const jobLookup: JobLookupCalls = {
    maybeSingle: vi.fn().mockResolvedValue({ data: job, error: null }),
    eqUser: vi.fn(),
    eqId: vi.fn(),
    select: vi.fn(),
  };
  jobLookup.eqUser.mockReturnValue({ maybeSingle: jobLookup.maybeSingle });
  jobLookup.eqId.mockReturnValue({ eq: jobLookup.eqUser });
  jobLookup.select.mockReturnValue({ eq: jobLookup.eqId });

  const feedback: FeedbackWriteCalls = {
    existingNote: vi.fn().mockResolvedValue({
      data: existingNote === null ? null : { note: existingNote },
      error: null,
    }),
    single: vi.fn().mockResolvedValue({
      data: insertedFeedbackId ? { id: insertedFeedbackId } : null,
      error: insertError ?? null,
    }),
    upsertSelect: vi.fn(),
    upsert: vi.fn(),
  };
  feedback.upsertSelect.mockReturnValue({ single: feedback.single });
  feedback.upsert.mockReturnValue({ select: feedback.upsertSelect });
  // The route's note-merge read: .select("note").eq().eq().maybeSingle().
  const noteSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: feedback.existingNote }),
    }),
  });

  const bookmarkUpsert: BookmarkUpsertCalls = {
    upsert: vi.fn().mockResolvedValue({ error: bookmarkError ?? null }),
  };

  fromMock.mockImplementation((table: string) => {
    if (table === "job_results") return { select: jobLookup.select };
    if (table === "feedback")
      return { select: noteSelect, upsert: feedback.upsert };
    if (table === "bookmarks") return bookmarkUpsert;
    throw new Error(`Unexpected table: ${table}`);
  });

  return { jobLookup, feedback, bookmarkUpsert };
}

function postJson(body: unknown) {
  return new Request("https://x.test/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("POST /api/feedback", () => {
  it("401 when there is no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(postJson({ job_result_id: 1, feedback_type: "applied" }));
    expect(res.status).toBe(401);
  });

  it("400 on invalid JSON body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(
      new Request("https://x.test/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on missing job_result_id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(postJson({ feedback_type: "applied" }));
    expect(res.status).toBe(400);
  });

  it("400 on a feedback_type outside the enum", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(
      postJson({ job_result_id: 1, feedback_type: "love_it" }),
    );
    expect(res.status).toBe(400);
  });

  it("404 when the job isn't found OR isn't theirs", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    buildSupabase({ job: null });
    const res = await POST(
      postJson({ job_result_id: 99, feedback_type: "applied" }),
    );
    expect(res.status).toBe(404);
  });

  it("200 + UPSERT feedback when valid, scoped by user_id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { jobLookup, feedback } = buildSupabase({
      job: {
        id: 42,
        user_id: "u1",
        job_url: "https://x/y",
        title: "Senior Engineer",
        company: "Acme",
      },
      insertedFeedbackId: 7,
    });
    const res = await POST(
      postJson({ job_result_id: 42, feedback_type: "applied", note: "  hello  " }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; id: number };
    expect(json).toEqual({ ok: true, id: 7 });

    expect(jobLookup.eqId).toHaveBeenCalledWith("id", 42);
    expect(jobLookup.eqUser).toHaveBeenCalledWith("user_id", "u1");

    const [upsertedRow, opts] = feedback.upsert.mock.calls[0];
    expect(upsertedRow).toMatchObject({
      user_id: "u1",
      job_result_id: 42,
      job_url: "https://x/y",
      title: "Senior Engineer",
      company: "Acme",
      feedback_type: "applied",
      note: "hello",
    });
    // Conflict target is the one-verdict-per-job unique index.
    expect(opts).toEqual({ onConflict: "user_id,job_result_id" });
  });

  it("replaces the verdict on a re-tap and keeps the existing note when none is sent", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { feedback } = buildSupabase({
      job: {
        id: 42,
        user_id: "u1",
        job_url: "https://x/y",
        title: "Senior Engineer",
        company: "Acme",
      },
      existingNote: "loved it",
      insertedFeedbackId: 7,
    });
    // New reaction, no note in the payload — the prior note must survive.
    await POST(postJson({ job_result_id: 42, feedback_type: "not_relevant" }));
    const [upsertedRow] = feedback.upsert.mock.calls[0];
    expect(upsertedRow).toMatchObject({
      feedback_type: "not_relevant",
      note: "loved it",
    });
  });

  it("upserts a bookmark when feedback_type is 'bookmarked' (UX shortcut to Tab B)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { bookmarkUpsert } = buildSupabase({
      job: {
        id: 42,
        user_id: "u1",
        job_url: "https://x/y",
        title: "Senior Engineer",
        company: "Acme",
      },
      insertedFeedbackId: 7,
    });
    const res = await POST(
      postJson({ job_result_id: 42, feedback_type: "bookmarked" }),
    );
    expect(res.status).toBe(200);
    expect(bookmarkUpsert.upsert).toHaveBeenCalledWith(
      { user_id: "u1", job_result_id: 42, status: "saved" },
      { onConflict: "user_id,job_result_id", ignoreDuplicates: true },
    );
  });

  it("does NOT touch bookmarks for non-bookmarked feedback types", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { bookmarkUpsert } = buildSupabase({
      job: {
        id: 42,
        user_id: "u1",
        job_url: "https://x/y",
        title: "Senior",
        company: "Acme",
      },
      insertedFeedbackId: 7,
    });
    await POST(postJson({ job_result_id: 42, feedback_type: "not_relevant" }));
    expect(bookmarkUpsert.upsert).not.toHaveBeenCalled();
  });

  it("returns ok=true with a warning when the feedback lands but the bookmark fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    buildSupabase({
      job: {
        id: 42,
        user_id: "u1",
        job_url: "https://x/y",
        title: "Senior",
        company: "Acme",
      },
      insertedFeedbackId: 7,
      bookmarkError: { message: "bucket gone" },
    });
    const res = await POST(
      postJson({ job_result_id: 42, feedback_type: "bookmarked" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; warning?: string };
    expect(json.ok).toBe(true);
    expect(json.warning).toMatch(/bookmark/i);
  });
});
