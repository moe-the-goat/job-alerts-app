/**
 * tailorCvAction — auth, config, cache, daily cap, and the happy path.
 * The Supabase client and fetch are both mocked; the cache/cap/LLM ordering is
 * what's being locked (cache hit must not spend budget or call the LLM).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

import { tailorCvAction } from "@/app/actions/tailor";

// One chainable stub serves every query shape the action uses: builder methods
// return `this`; `maybeSingle` resolves a preset; awaiting the builder itself
// (the count query) resolves `awaited`; `insert` records rows.
function chain({ single = null, awaited = { count: 0, error: null } }: {
  single?: unknown;
  awaited?: unknown;
} = {}) {
  const o: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit"]) {
    o[m] = vi.fn().mockReturnValue(o);
  }
  o.maybeSingle = vi.fn().mockResolvedValue(single ?? { data: null, error: null });
  o.insert = vi.fn().mockResolvedValue({ error: null });
  o.then = (resolve: (v: unknown) => unknown) => Promise.resolve(awaited).then(resolve);
  return o;
}

const JOB_ROW = {
  data: {
    id: 7,
    title: "Backend Engineer",
    company: "Acme",
    description_excerpt: "Django + Postgres",
    ai_verdict: "MATCH: python",
  },
  error: null,
};
const PROFILE_ROW = { data: { cv_text: "MY REAL CV", github_summary: "" }, error: null };

function fd(mode: string, id: number | string = 7) {
  const f = new FormData();
  f.set("mode", mode);
  f.set("job_result_id", String(id));
  return f;
}

function wire({ cached = null, used = 0 }: { cached?: unknown; used?: number } = {}) {
  const tailorChain = chain({
    single: cached ? { data: cached, error: null } : { data: null, error: null },
    awaited: { count: used, error: null },
  });
  fromMock.mockImplementation((table: string) => {
    if (table === "job_results") return chain({ single: JOB_ROW });
    if (table === "profiles") return chain({ single: PROFILE_ROW });
    return tailorChain; // cv_tailor_results: cache read + count + insert
  });
  return tailorChain;
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-abc" } } });
  process.env.GROQ_TAILOR_API_KEY = "gk_test";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "TAILORED OUTPUT" } }] }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_TAILOR_API_KEY;
});

describe("tailorCvAction", () => {
  it("rejects an invalid mode or job id", async () => {
    expect((await tailorCvAction(undefined, fd("nonsense"))).ok).toBe(false);
    expect((await tailorCvAction(undefined, fd("suggestions", "abc"))).ok).toBe(false);
  });

  it("errors clearly when the server key isn't configured", async () => {
    delete process.env.GROQ_TAILOR_API_KEY;
    const res = await tailorCvAction(undefined, fd("suggestions"));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/configured/i);
  });

  it("rejects when the session is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await tailorCvAction(undefined, fd("suggestions"));
    expect(res.ok).toBe(false);
  });

  it("serves a cache hit without calling the LLM or spending budget", async () => {
    const t = wire({ cached: { content: "CACHED RESULT" } });
    const res = await tailorCvAction(undefined, fd("recreate"));
    expect(res.ok).toBe(true);
    expect(res.cached).toBe(true);
    expect(res.content).toBe("CACHED RESULT");
    expect(fetch).not.toHaveBeenCalled();
    expect(t.insert).not.toHaveBeenCalled();
  });

  it("enforces the daily recreate cap", async () => {
    wire({ used: 3 }); // MAX_RECREATES_PER_DAY
    const res = await tailorCvAction(undefined, fd("recreate"));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/used today's 3/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("happy path: calls the LLM, stores the result, reports remaining budget", async () => {
    const t = wire({ used: 1 });
    const res = await tailorCvAction(undefined, fd("recreate"));
    expect(res.ok).toBe(true);
    expect(res.content).toBe("TAILORED OUTPUT");
    expect(res.remaining).toBe(1); // cap 3 - used 1 - this one
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(t.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-abc",
        job_result_id: 7,
        mode: "recreate",
        content: "TAILORED OUTPUT",
      }),
    );
  });

  it("returns a friendly error when the LLM call fails", async () => {
    wire();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = await tailorCvAction(undefined, fd("suggestions"));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/busy/i);
  });
});
