/**
 * Locks the aggregation logic of loadAdminAnalytics — the read-only admin
 * dashboard. The page itself is ADMIN_USER_ID-gated; this tests the math:
 *   - users: total / whitelisted / onboarded / stuck / pending / rejected
 *   - runs: today's status breakdown + per-user latest (dedup, newest wins)
 *   - feedback: totals, by-type, top blocked companies
 *   - emails resolved from auth.admin.listUsers, with user_id fallback
 *   - a failing section degrades to empty instead of throwing
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Table -> canned rows. Each `from(table).select(...)` resolves to { data }.
let tables: Record<string, unknown[]>;
let failTable: string | null = null;
let listUsersResult: { data: { users: { id: string; email: string }[] } } | Error;

function makeQuery(table: string) {
  const result =
    failTable === table
      ? Promise.reject(new Error("boom"))
      : Promise.resolve({ data: tables[table] ?? [] });
  // Chainable: select() and order() both return the thenable.
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      result.then(res, rej),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => makeQuery(table),
    auth: {
      admin: {
        listUsers: async () => {
          if (listUsersResult instanceof Error) throw listUsersResult;
          return listUsersResult;
        },
      },
    },
  }),
}));

import { loadAdminAnalytics } from "@/app/admin/_lib/analytics";

const TODAY = new Date().toISOString();
// llm_usage_daily.day is the JERUSALEM budget day (what the worker writes and
// the loader now filters "today" against) — compute it the same way so this
// test is stable even when UTC and Jerusalem are on different calendar dates.
const TODAY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const OLD = "2020-01-01T00:00:00Z";
// Older worker builds stamped `day` as the UTC date of the Jerusalem-midnight
// instant — always the day BEFORE the local calendar date. The loader accepts
// that legacy value as "today" so pre-fix rows still surface. Compute it the
// same way: today (Jerusalem) minus one day.
const TODAY_LEGACY_DAY = (() => {
  const d = new Date(`${TODAY_DAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

beforeEach(() => {
  failTable = null;
  listUsersResult = {
    data: { users: [{ id: "u1", email: "ada@x.co" }, { id: "u2", email: "bob@x.co" }] },
  };
  tables = {
    profiles: [
      { user_id: "u1", cv_text: "my cv", is_whitelisted: true, created_at: OLD },
      { user_id: "u2", cv_text: "", is_whitelisted: true, created_at: OLD }, // stuck: whitelisted, no cv
      { user_id: "u3", cv_text: "cv", is_whitelisted: false, created_at: OLD }, // not whitelisted
    ],
    search_queries: [
      { user_id: "u1", is_active: true },
      { user_id: "u3", is_active: true },
    ],
    preferences: [
      { user_id: "u1", is_active: true },
      { user_id: "u2", is_active: false }, // u2 is paused
    ],
    access_requests: [
      { email: "ada@x.co", first_name: "Ada", last_name: "L", status: "approved", created_at: OLD },
      { email: "new@x.co", first_name: "New", last_name: "P", status: "pending", created_at: TODAY },
      { email: "no@x.co", first_name: "No", last_name: "P", status: "rejected", created_at: OLD },
    ],
    runs: [
      { user_id: "u1", status: "success", started_at: TODAY, approved: 5, scraped: 100, error: null },
      { user_id: "u1", status: "failed", started_at: OLD, approved: 0, scraped: 0, error: "old" },
      { user_id: "u2", status: "failed", started_at: TODAY, approved: 0, scraped: 50, error: "smtp 535" },
    ],
    feedback: [
      { feedback_type: "applied", company: "Acme", submitted_at: TODAY },
      { feedback_type: "block_company", company: "SpamCo", submitted_at: TODAY },
      { feedback_type: "block_company", company: "SpamCo", submitted_at: OLD },
      { feedback_type: "not_relevant", company: "Beta", submitted_at: OLD },
    ],
    llm_usage_daily: [
      // u1 today: 10 Cerebras calls, 1 failed, 2000 tokens, peak 4/min.
      {
        user_id: "u1",
        provider: "Cerebras",
        model: "gpt-oss-120b",
        day: TODAY_DAY,
        requests: 10,
        requests_failed: 1,
        tokens: 2000,
        peak_rpm: 4,
      },
      // u2 today: 5 Cerebras calls (same model → aggregates with u1 per model).
      {
        user_id: "u2",
        provider: "Cerebras",
        model: "gpt-oss-120b",
        day: TODAY_DAY,
        requests: 5,
        requests_failed: 0,
        tokens: 500,
        peak_rpm: 2,
      },
      // u1 an old day: should appear in all-time but NOT today.
      {
        user_id: "u1",
        provider: "Groq",
        model: "llama-3.3-70b-versatile",
        day: "2020-01-01",
        requests: 7,
        requests_failed: 0,
        tokens: 0,
        peak_rpm: 1,
      },
      // Legacy off-by-one: a row written by an OLD worker build with the
      // previous-day stamp must still count as "today".
      {
        user_id: "u1",
        provider: "Gemini",
        model: "gemini-3.1-flash-lite",
        day: TODAY_LEGACY_DAY,
        requests: 3,
        requests_failed: 0,
        tokens: 900,
        peak_rpm: 1,
      },
    ],
  };
});

describe("loadAdminAnalytics — users", () => {
  it("counts total, whitelisted, onboarded, stuck, and request statuses", async () => {
    const a = await loadAdminAnalytics();
    expect(a.users.total).toBe(3);
    expect(a.users.whitelisted).toBe(2); // u1, u2
    expect(a.users.onboarded).toBe(2); // u1 and u3 both have cv + active search
    expect(a.users.stuck).toBe(1); // u2: whitelisted but no cv -> can't be scored
    expect(a.users.pendingRequests).toBe(1);
    expect(a.users.rejectedRequests).toBe(1);
  });

  it("surfaces recent signups newest-first", async () => {
    const a = await loadAdminAnalytics();
    expect(a.users.recentSignups[0].email).toBe("new@x.co"); // TODAY is newest
  });
});

describe("loadAdminAnalytics — runs", () => {
  it("breaks down today's runs and sums approved/scraped for today only", async () => {
    const a = await loadAdminAnalytics();
    expect(a.runs.today.total).toBe(2); // two runs started today
    expect(a.runs.today.success).toBe(1);
    expect(a.runs.today.failed).toBe(1);
    expect(a.runs.jobsApprovedToday).toBe(5);
    expect(a.runs.scrapedToday).toBe(150);
  });

  it("keeps only the latest run per user and resolves the email", async () => {
    const a = await loadAdminAnalytics();
    const u1 = a.runs.perUserLatest.find((r) => r.email === "ada@x.co");
    expect(u1?.status).toBe("success"); // newest of u1's two runs
    expect(a.runs.perUserLatest.filter((r) => r.email === "ada@x.co")).toHaveLength(1);
  });

  it("attaches per-user action state (userId, isActive, isWhitelisted)", async () => {
    const a = await loadAdminAnalytics();
    const u1 = a.runs.perUserLatest.find((r) => r.userId === "u1");
    const u2 = a.runs.perUserLatest.find((r) => r.userId === "u2");
    // u1: whitelisted profile + active prefs.
    expect(u1?.isWhitelisted).toBe(true);
    expect(u1?.isActive).toBe(true);
    // u2: whitelisted but paused (is_active=false in preferences).
    expect(u2?.isWhitelisted).toBe(true);
    expect(u2?.isActive).toBe(false);
  });
});

describe("loadAdminAnalytics — feedback", () => {
  it("totals, today count, by-type, and top blocked companies", async () => {
    const a = await loadAdminAnalytics();
    expect(a.feedback.total).toBe(4);
    expect(a.feedback.today).toBe(2);
    expect(a.feedback.byType["block_company"]).toBe(2);
    expect(a.feedback.topBlockedCompanies[0]).toEqual({ company: "SpamCo", count: 2 });
  });
});

describe("loadAdminAnalytics — LLM usage", () => {
  it("aggregates today's usage per model across users", async () => {
    const a = await loadAdminAnalytics();
    const cerebrasToday = a.llm.today.byModel.find((m) => m.model === "gpt-oss-120b");
    // u1 (10) + u2 (5) = 15 requests today; failures 1; tokens 2500; peak = max(4,2)=4.
    expect(cerebrasToday?.requests).toBe(15);
    expect(cerebrasToday?.requestsFailed).toBe(1);
    expect(cerebrasToday?.tokens).toBe(2500);
    expect(cerebrasToday?.peakRpm).toBe(4);
    // The old Groq row is NOT in today's range.
    expect(a.llm.today.byModel.find((m) => m.model.includes("llama"))).toBeUndefined();
  });

  it("breaks usage down per user and resolves emails", async () => {
    const a = await loadAdminAnalytics();
    const u1 = a.llm.today.byUser.find((u) => u.email === "ada@x.co");
    expect(u1?.requests).toBe(10);
  });

  it("all-time includes old rows that today excludes", async () => {
    const a = await loadAdminAnalytics();
    expect(a.llm.all.byModel.find((m) => m.model.includes("llama"))?.requests).toBe(7);
  });

  it("counts legacy previous-day-stamped rows as today", async () => {
    // The Gemini row stamped with the off-by-one (previous) day must still show
    // in Today, not just week/all-time.
    const a = await loadAdminAnalytics();
    const gem = a.llm.today.byModel.find((m) => m.model === "gemini-3.1-flash-lite");
    expect(gem?.requests).toBe(3);
  });
});

describe("loadAdminAnalytics — resilience", () => {
  it("falls back to user_id when listUsers fails", async () => {
    listUsersResult = new Error("no admin api");
    const a = await loadAdminAnalytics();
    expect(a.runs.perUserLatest.some((r) => r.email === "u1")).toBe(true);
  });

  it("degrades a failing section to empty instead of throwing", async () => {
    failTable = "feedback";
    const a = await loadAdminAnalytics();
    expect(a.feedback.total).toBe(0); // feedback section empty
    expect(a.users.total).toBe(3); // other sections still populated
  });
});
