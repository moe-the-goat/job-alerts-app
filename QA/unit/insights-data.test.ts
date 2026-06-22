/**
 * Locks loadInsights — the per-user "your job search" aggregation. Verifies the
 * window math (Jerusalem day), totals, top companies, match-score buckets, and
 * that "applied" counts feedback. Uses a chainable query stub matching the calls
 * the loader makes (select/eq/order/limit/returns).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let tables: Record<string, unknown[]>;

function makeQuery(table: string) {
  const result = Promise.resolve({ data: tables[table] ?? [] });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    returns: () => result,
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      result.then(res, rej),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (t: string) => makeQuery(t) }),
}));

import { loadInsights } from "@/app/dashboard/(workspace)/insights/_lib/insights-data";

const TODAY = new Date().toISOString();
const OLD = "2020-01-01T00:00:00Z"; // outside the 30-day window

beforeEach(() => {
  tables = {
    runs: [
      { started_at: TODAY, status: "success" },
      { started_at: TODAY, status: "failed" },
      { started_at: OLD, status: "success" }, // outside window → excluded
    ],
    job_results: [
      { company: "Acme", match_percentage: 90, ai_evaluated: true, created_at: TODAY },
      { company: "Acme", match_percentage: 70, ai_evaluated: true, created_at: TODAY },
      { company: "Beta", match_percentage: 30, ai_evaluated: true, created_at: TODAY },
      { company: "Beta", match_percentage: null, ai_evaluated: false, created_at: TODAY },
      { company: "Old", match_percentage: 88, ai_evaluated: true, created_at: OLD }, // excluded
    ],
    feedback: [
      { feedback_type: "applied" },
      { feedback_type: "applied" },
      { feedback_type: "not_relevant" },
    ],
  };
});

describe("loadInsights", () => {
  it("counts runs and surfaced jobs within the window only", async () => {
    const a = await loadInsights("u1");
    expect(a.hasAnyRun).toBe(true);
    expect(a.totals.runs).toBe(2); // 2 today; the 2020 run is out of window
    expect(a.totals.surfaced).toBe(4); // 4 today; the 2020 job excluded
  });

  it("averages match only over AI-evaluated in-window jobs", async () => {
    const a = await loadInsights("u1");
    // (90 + 70 + 30) / 3 = 63.33 → 63. The null-match and out-of-window rows skip.
    expect(a.totals.avgMatch).toBe(63);
  });

  it("counts applied feedback (all-time)", async () => {
    const a = await loadInsights("u1");
    expect(a.totals.applied).toBe(2);
  });

  it("ranks top companies by in-window surfaced count", async () => {
    const a = await loadInsights("u1");
    expect(a.topCompanies[0]).toEqual({ company: "Acme", count: 2 });
    expect(a.topCompanies.find((c) => c.company === "Old")).toBeUndefined();
  });

  it("buckets match scores", async () => {
    const a = await loadInsights("u1");
    const top = a.matchBuckets.find((b) => b.label === "80–100");
    const mid = a.matchBuckets.find((b) => b.label === "60–79");
    const low = a.matchBuckets.find((b) => b.label === "20–39");
    expect(top?.count).toBe(1); // 90
    expect(mid?.count).toBe(1); // 70
    expect(low?.count).toBe(1); // 30
  });

  it("daily series is dense (30 days) and ends today", async () => {
    const a = await loadInsights("u1");
    expect(a.daily).toHaveLength(30);
    const todayJeru = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(a.daily[a.daily.length - 1].day).toBe(todayJeru);
  });
});
