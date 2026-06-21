/**
 * loadUserDetail — the /admin/users/[id] drill-down loader. Verifies it stitches
 * one user's profile/CV, schedule, searches, run history, latest-run results,
 * feedback, and LLM usage from the service-role client, and degrades a failing
 * section to empty instead of throwing.
 *
 * The mock models the query surface this loader actually uses: eq / order /
 * limit / maybeSingle, plus auth.admin.getUserById.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let tables: Record<string, unknown[]>;
let failTable: string | null;
let getUserResult: { data: { user: unknown } } | Error;

// A chainable query that records eq() filters and resolves to filtered rows.
function makeQuery(table: string) {
  const eqs: [string, unknown][] = [];
  const orders: { col: string; asc: boolean }[] = [];
  let limit = Infinity;

  const resolve = () => {
    if (failTable === table) return Promise.reject(new Error("boom"));
    let rows = (tables[table] ?? []).filter((r) =>
      eqs.every(([c, v]) => (r as Record<string, unknown>)[c] === v),
    );
    for (const o of [...orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[o.col] as number | string;
        const bv = (b as Record<string, unknown>)[o.col] as number | string;
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return o.asc ? cmp : -cmp;
      });
    }
    if (limit !== Infinity) rows = rows.slice(0, limit);
    return Promise.resolve({ data: rows });
  };

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (c: string, v: unknown) => {
      eqs.push([c, v]);
      return chain;
    },
    order: (c: string, opts?: { ascending?: boolean }) => {
      orders.push({ col: c, asc: opts?.ascending !== false });
      return chain;
    },
    limit: (n: number) => {
      limit = n;
      return chain;
    },
    maybeSingle: async () => {
      const r = await resolve();
      return { data: (r.data as unknown[])[0] ?? null };
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      resolve().then(res, rej),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => makeQuery(table),
    auth: {
      admin: {
        getUserById: async () => {
          if (getUserResult instanceof Error) throw getUserResult;
          return getUserResult;
        },
      },
    },
  }),
}));

import { loadUserDetail } from "@/app/admin/_lib/user-detail";

const U = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  failTable = null;
  getUserResult = {
    data: {
      user: {
        id: U,
        email: "ada@x.co",
        created_at: "2026-01-01T00:00:00Z",
        user_metadata: { first_name: "Ada", last_name: "L" },
      },
    },
  };
  tables = {
    profiles: [{ user_id: U, cv_text: "  My CV text here  ", is_whitelisted: true, created_at: "2026-01-01T00:00:00Z" }],
    preferences: [
      { user_id: U, is_active: true, frequency_hours: 24, next_run_at: "2026-06-19T06:00:00Z", notification_email: "ada@x.co", ai_eval_top_n: 30 },
    ],
    search_queries: [
      { id: 2, user_id: U, search_term: "backend", location: "Remote", is_remote: true, is_active: true },
      { id: 1, user_id: U, search_term: "frontend", location: "Berlin", is_remote: false, is_active: false },
    ],
    runs: [
      { id: 10, user_id: U, status: "success", run_trigger: "scheduled", started_at: "2026-06-18T06:00:00Z", ended_at: "2026-06-18T06:30:00Z", scraped: 100, filtered: 40, ai_evaluated: 20, approved: 5, lower_ranked: 8, error: null, email_status: "sent", email_error: null },
      { id: 9, user_id: U, status: "failed", run_trigger: "manual", started_at: "2026-06-17T06:00:00Z", ended_at: "2026-06-17T06:10:00Z", scraped: 0, filtered: 0, ai_evaluated: 0, approved: 0, lower_ranked: 0, error: "smtp 535", email_status: "none", email_error: null },
    ],
    job_results: [
      { run_id: 10, user_id: U, title: "Backend Eng", company: "Acme", location: "Remote", job_url: "u1", origin: "global", ai_evaluated: true, ai_verdict: "great", match_percentage: 88, suspicious: false },
      { run_id: 10, user_id: U, title: "Filler", company: "Beta", location: "", job_url: "u2", origin: "global", ai_evaluated: false, ai_verdict: null, match_percentage: null, suspicious: false },
      { run_id: 9, user_id: U, title: "Old job", company: "Old", location: "", job_url: "u0", origin: null, ai_evaluated: true, ai_verdict: "x", match_percentage: 50, suspicious: false },
    ],
    feedback: [
      { user_id: U, job_url: "u1", title: "Backend Eng", company: "Acme", feedback_type: "applied", note: "nice", submitted_at: "2026-06-18T10:00:00Z" },
    ],
    llm_usage_daily: [
      { user_id: U, provider: "Cerebras", model: "gpt-oss-120b", requests: 10, tokens: 2000 },
      { user_id: U, provider: "Cerebras", model: "gpt-oss-120b", requests: 5, tokens: 500 },
      { user_id: U, provider: "Gemini", model: "gemini-3.1-flash-lite", requests: 3, tokens: 900 },
    ],
  };
});

describe("loadUserDetail", () => {
  it("resolves identity, status, and schedule", async () => {
    const d = await loadUserDetail(U);
    expect(d.found).toBe(true);
    expect(d.email).toBe("ada@x.co");
    expect(d.name).toBe("Ada L");
    expect(d.isWhitelisted).toBe(true);
    expect(d.isActive).toBe(true);
    expect(d.schedule.frequencyHours).toBe(24);
    expect(d.schedule.aiEvalTopN).toBe(30);
  });

  it("trims and previews the CV", async () => {
    const d = await loadUserDetail(U);
    expect(d.cv.present).toBe(true);
    expect(d.cv.preview.startsWith("My CV text")).toBe(true);
    expect(d.cv.chars).toBe("My CV text here".length);
  });

  it("lists searches and run history newest-first", async () => {
    const d = await loadUserDetail(U);
    expect(d.searches).toHaveLength(2);
    expect(d.counts.runs).toBe(2);
    expect(d.runs[0].id).toBe(10); // newest started_at first
    expect(d.runs[0].trigger).toBe("scheduled");
    expect(d.runs[0].emailStatus).toBe("sent"); // delivery outcome surfaced
  });

  it("shows only the latest run's results, AI-evaluated first", async () => {
    const d = await loadUserDetail(U);
    // Only run 10's rows (u1, u2); the old run's u0 is excluded.
    expect(d.latestResults.map((r) => r.jobUrl).sort()).toEqual(["u1", "u2"]);
    expect(d.latestResults[0].aiEvaluated).toBe(true); // AI-evaluated sorts first
  });

  it("lists feedback and rolls up LLM usage per model", async () => {
    const d = await loadUserDetail(U);
    expect(d.counts.feedback).toBe(1);
    expect(d.feedback[0].type).toBe("applied");
    const cerebras = d.usage.find((u) => u.model === "gpt-oss-120b");
    expect(cerebras?.requests).toBe(15); // 10 + 5
    expect(cerebras?.tokens).toBe(2500);
  });

  it("degrades a failing section to empty instead of throwing", async () => {
    failTable = "feedback";
    const d = await loadUserDetail(U);
    expect(d.feedback).toEqual([]);
    expect(d.found).toBe(true); // other sections still load
    expect(d.searches).toHaveLength(2);
  });

  it("returns not-found for an unknown user", async () => {
    tables.profiles = [];
    tables.preferences = [];
    getUserResult = { data: { user: null } };
    const d = await loadUserDetail("99999999-9999-9999-9999-999999999999");
    expect(d.found).toBe(false);
  });
});
