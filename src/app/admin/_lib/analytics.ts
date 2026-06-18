import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Read-only admin analytics, aggregated from the data the system already
 * stores (profiles, runs, feedback, access_requests). Service-role client, so
 * it reads across every user — this module must only ever be imported by the
 * ADMIN_USER_ID-gated /admin route.
 *
 * Every section degrades on its own: one failing query returns an empty/zero
 * section rather than blanking the whole page. The page is more useful half-up
 * than fully-down.
 */

export interface UserStats {
  total: number;
  whitelisted: number;
  pendingRequests: number;
  rejectedRequests: number;
  onboarded: number; // has cv_text AND at least one active search
  stuck: number; // whitelisted but not onboarded (signed up, can't be scored yet)
  recentSignups: { email: string; name: string; status: string; createdAt: string }[];
}

export interface RunStats {
  today: { total: number; success: number; failed: number; running: number; skipped: number };
  jobsApprovedToday: number;
  scrapedToday: number;
  perUserLatest: {
    userId: string;
    email: string;
    status: string;
    startedAt: string;
    approved: number;
    error: string | null;
    isActive: boolean;
    isWhitelisted: boolean;
  }[];
}

export interface FeedbackStats {
  total: number;
  today: number;
  byType: Record<string, number>;
  topBlockedCompanies: { company: string; count: number }[];
}

// LLM usage rolled up per model over a time range, plus a per-user breakdown.
export interface LlmModelUsage {
  model: string;
  provider: string;
  requests: number;
  requestsFailed: number;
  tokens: number;
  peakRpm: number; // max peak across the range (today is the meaningful one)
}
export interface LlmUserUsage {
  email: string;
  model: string;
  requests: number;
  tokens: number;
}
export interface LlmUsageRange {
  byModel: LlmModelUsage[];
  byUser: LlmUserUsage[];
}
export interface LlmUsageStats {
  today: LlmUsageRange;
  week: LlmUsageRange;
  all: LlmUsageRange;
}

export interface AdminAnalytics {
  users: UserStats;
  runs: RunStats;
  feedback: FeedbackStats;
  llm: LlmUsageStats;
  generatedAt: string;
}

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

const EMPTY: AdminAnalytics = {
  users: {
    total: 0,
    whitelisted: 0,
    pendingRequests: 0,
    rejectedRequests: 0,
    onboarded: 0,
    stuck: 0,
    recentSignups: [],
  },
  runs: {
    today: { total: 0, success: 0, failed: 0, running: 0, skipped: 0 },
    jobsApprovedToday: 0,
    scrapedToday: 0,
    perUserLatest: [],
  },
  feedback: { total: 0, today: 0, byType: {}, topBlockedCompanies: [] },
  llm: {
    today: { byModel: [], byUser: [] },
    week: { byModel: [], byUser: [] },
    all: { byModel: [], byUser: [] },
  },
  generatedAt: new Date().toISOString(),
};

type ProfileRow = {
  user_id: string;
  cv_text: string | null;
  is_whitelisted: boolean;
  created_at: string;
};
type SearchRow = { user_id: string; is_active: boolean | null };
type RequestRow = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  created_at: string;
};
type RunRow = {
  user_id: string;
  status: string;
  started_at: string;
  approved: number | null;
  scraped: number | null;
  error: string | null;
};
type FeedbackRow = { feedback_type: string; company: string | null; submitted_at: string };

export async function loadAdminAnalytics(): Promise<AdminAnalytics> {
  const admin = createAdminClient();
  const todayStart = startOfTodayUtc();

  // Email lives in auth.users, not profiles — fetch a user_id -> email map.
  const emailById = new Map<string, string>();
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.id && u.email) emailById.set(u.id, u.email);
    }
  } catch {
    // No emails — sections fall back to showing the user_id instead.
  }

  const [profilesRes, searchesRes, requestsRes, runsRes, feedbackRes, prefsRes, llmRes] =
    await Promise.allSettled([
      admin.from("profiles").select("user_id, cv_text, is_whitelisted, created_at"),
      admin.from("search_queries").select("user_id, is_active"),
      admin.from("access_requests").select("email, first_name, last_name, status, created_at"),
      admin
        .from("runs")
        .select("user_id, status, started_at, approved, scraped, error")
        .order("started_at", { ascending: false }),
      admin.from("feedback").select("feedback_type, company, submitted_at"),
      admin.from("preferences").select("user_id, is_active"),
      admin
        .from("llm_usage_daily")
        .select("user_id, provider, model, day, requests, requests_failed, tokens, peak_rpm"),
    ]);

  const out: AdminAnalytics = structuredClone(EMPTY);
  out.generatedAt = new Date().toISOString();

  const label = (userId: string) => emailById.get(userId) ?? userId;

  // ---- Users ----------------------------------------------------------------
  const profiles =
    profilesRes.status === "fulfilled" ? ((profilesRes.value.data as ProfileRow[]) ?? []) : [];
  const searches =
    searchesRes.status === "fulfilled" ? ((searchesRes.value.data as SearchRow[]) ?? []) : [];
  const requests =
    requestsRes.status === "fulfilled" ? ((requestsRes.value.data as RequestRow[]) ?? []) : [];

  const usersWithActiveSearch = new Set(
    searches.filter((s) => s.is_active !== false).map((s) => s.user_id),
  );
  out.users.total = profiles.length;
  out.users.whitelisted = profiles.filter((p) => p.is_whitelisted).length;
  for (const p of profiles) {
    const onboarded = !!(p.cv_text && p.cv_text.trim()) && usersWithActiveSearch.has(p.user_id);
    if (onboarded) out.users.onboarded += 1;
    else if (p.is_whitelisted) out.users.stuck += 1;
  }
  out.users.pendingRequests = requests.filter((r) => r.status === "pending").length;
  out.users.rejectedRequests = requests.filter((r) => r.status === "rejected").length;
  out.users.recentSignups = [...requests]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map((r) => ({
      email: r.email,
      name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—",
      status: r.status,
      createdAt: r.created_at,
    }));

  // Per-user state lookups for the action buttons (whitelist from profiles,
  // is_active from preferences). Default to true when a row is missing so a
  // user without a preferences row still shows a sane state.
  const whitelistById = new Map(profiles.map((p) => [p.user_id, !!p.is_whitelisted]));
  const prefs =
    prefsRes.status === "fulfilled"
      ? ((prefsRes.value.data as { user_id: string; is_active: boolean | null }[]) ?? [])
      : [];
  const activeById = new Map(prefs.map((p) => [p.user_id, p.is_active !== false]));

  // ---- Runs -----------------------------------------------------------------
  const runs = runsRes.status === "fulfilled" ? ((runsRes.value.data as RunRow[]) ?? []) : [];
  const runsToday = runs.filter((r) => r.started_at >= todayStart);
  out.runs.today.total = runsToday.length;
  for (const r of runsToday) {
    if (r.status === "success") out.runs.today.success += 1;
    else if (r.status === "failed") out.runs.today.failed += 1;
    else if (r.status === "running") out.runs.today.running += 1;
    else if (r.status === "skipped") out.runs.today.skipped += 1;
    out.runs.jobsApprovedToday += r.approved ?? 0;
    out.runs.scrapedToday += r.scraped ?? 0;
  }
  // Latest run per user (runs already sorted desc by started_at).
  const seen = new Set<string>();
  for (const r of runs) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    out.runs.perUserLatest.push({
      userId: r.user_id,
      email: label(r.user_id),
      status: r.status,
      startedAt: r.started_at,
      approved: r.approved ?? 0,
      error: r.error,
      isActive: activeById.get(r.user_id) ?? true,
      isWhitelisted: whitelistById.get(r.user_id) ?? false,
    });
  }

  // ---- Feedback -------------------------------------------------------------
  const feedback =
    feedbackRes.status === "fulfilled" ? ((feedbackRes.value.data as FeedbackRow[]) ?? []) : [];
  out.feedback.total = feedback.length;
  const blockedCounts = new Map<string, number>();
  for (const f of feedback) {
    if (f.submitted_at >= todayStart) out.feedback.today += 1;
    out.feedback.byType[f.feedback_type] = (out.feedback.byType[f.feedback_type] ?? 0) + 1;
    if (f.feedback_type === "block_company" && f.company) {
      blockedCounts.set(f.company, (blockedCounts.get(f.company) ?? 0) + 1);
    }
  }
  out.feedback.topBlockedCompanies = [...blockedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([company, count]) => ({ company, count }));

  // ---- LLM usage ------------------------------------------------------------
  const llmRows =
    llmRes.status === "fulfilled" ? ((llmRes.value.data as LlmUsageRow[]) ?? []) : [];
  out.llm = aggregateLlmUsage(llmRows, label);

  return out;
}

type LlmUsageRow = {
  user_id: string;
  provider: string;
  model: string;
  day: string; // YYYY-MM-DD
  requests: number | null;
  requests_failed: number | null;
  tokens: number | null;
  peak_rpm: number | null;
};

/** Roll daily usage rows into per-model + per-user totals for today / last 7
 *  days / all-time. `label` resolves a user_id to an email. */
function aggregateLlmUsage(
  rows: LlmUsageRow[],
  label: (userId: string) => string,
): LlmUsageStats {
  // The worker stamps `day` with the JERUSALEM calendar date (the local budget
  // day). "Today" must match that, or the Today view is empty whenever UTC and
  // Jerusalem are on different calendar dates. Derive the current Jerusalem date
  // as YYYY-MM-DD via en-CA (which formats as ISO).
  const tz = "Asia/Jerusalem";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = fmt.format(new Date());
  // Legacy off-by-one: older worker builds stamped `day` as the UTC date of the
  // Jerusalem-midnight instant, which is always the PREVIOUS calendar day. Accept
  // that value as "today" too so rows written before the worker fix still show.
  // Harmless once every row uses the correct date. (Drop after older rows age out.)
  const prevDay = new Date(`${todayStr}T12:00:00Z`);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const todayLegacyStr = prevDay.toISOString().slice(0, 10);
  // 7-day inclusive window: today minus 6 days, in the same Jerusalem frame.
  const weekAgoDate = new Date();
  weekAgoDate.setUTCDate(weekAgoDate.getUTCDate() - 6);
  const weekStr = fmt.format(weekAgoDate);

  function build(filter: (day: string) => boolean): LlmUsageRange {
    const byModel = new Map<string, LlmModelUsage>();
    const byUser = new Map<string, LlmUserUsage>();
    for (const r of rows) {
      // Normalize to the date portion in case PostgREST ever returns a fuller
      // timestamp than a bare YYYY-MM-DD for the `date` column.
      const day = String(r.day).slice(0, 10);
      if (!filter(day)) continue;
      const req = r.requests ?? 0;
      const fail = r.requests_failed ?? 0;
      const tok = Number(r.tokens ?? 0);
      const peak = r.peak_rpm ?? 0;

      const m = byModel.get(r.model) ?? {
        model: r.model,
        provider: r.provider,
        requests: 0,
        requestsFailed: 0,
        tokens: 0,
        peakRpm: 0,
      };
      m.requests += req;
      m.requestsFailed += fail;
      m.tokens += tok;
      m.peakRpm = Math.max(m.peakRpm, peak);
      byModel.set(r.model, m);

      const uKey = `${r.user_id}|${r.model}`;
      const u = byUser.get(uKey) ?? {
        email: label(r.user_id),
        model: r.model,
        requests: 0,
        tokens: 0,
      };
      u.requests += req;
      u.tokens += tok;
      byUser.set(uKey, u);
    }
    return {
      byModel: [...byModel.values()].sort((a, b) => b.requests - a.requests),
      byUser: [...byUser.values()].sort((a, b) => b.requests - a.requests),
    };
  }

  return {
    today: build((d) => d === todayStr || d === todayLegacyStr),
    week: build((d) => d >= weekStr),
    all: build(() => true),
  };
}
