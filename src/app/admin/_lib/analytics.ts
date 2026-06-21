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

// One row per real account — the full roster (not just users with a run today),
// so the admin has a directory into the per-user drill-downs.
export interface UserDirectoryEntry {
  userId: string;
  email: string;
  isActive: boolean;
  isWhitelisted: boolean;
  onboarded: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdAt: string | null;
}

export interface UserStats {
  total: number;
  whitelisted: number;
  pendingRequests: number;
  rejectedRequests: number;
  onboarded: number; // has cv_text AND at least one active search
  stuck: number; // whitelisted but not onboarded (signed up, can't be scored yet)
  recentSignups: { email: string; name: string; status: string; createdAt: string }[];
  directory: UserDirectoryEntry[]; // all accounts, newest signup first
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

// Operational health — the "what needs attention right now" rollup. Every list
// is empty when healthy, so the UI can render a calm page and only surface red
// when something is actually wrong.
export interface HealthStats {
  // Runs stuck in 'running' with no ended_at, started over STALL_MINUTES ago —
  // the worker almost certainly died mid-run.
  stalled: { userId: string; email: string; startedAt: string; runId: number }[];
  // Failed runs grouped by a normalized error signature, most common first.
  errorGroups: { signature: string; count: number; sample: string }[];
  // Onboarded + active users whose most recent run delivered zero approved jobs
  // — the pipeline "succeeded" but gave them nothing.
  zeroResultUsers: { userId: string; email: string; startedAt: string }[];
  // Whitelisted + active users overdue for a run (next_run_at well in the past)
  // or who have never had a run at all.
  overdueUsers: { userId: string; email: string; reason: "overdue" | "never"; since: string | null }[];
  // Runs that completed but whose EMAIL failed to send (Tier D) — the user got
  // nothing even though the run "succeeded". Grouped by error signature.
  emailFailures: { userId: string; email: string; startedAt: string; error: string | null }[];
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

// Trends — daily time series so the dashboard can show "how things are going"
// over time, not just a today snapshot. Every series is a dense run of days
// (no gaps — missing days are zero-filled) ending today, in the Jerusalem
// calendar frame the rest of the app uses. The UI slices the tail (7/14/30d).
export interface RunsDay {
  day: string; // YYYY-MM-DD (Jerusalem)
  total: number;
  success: number;
  failed: number;
}
export interface SignupsDay {
  day: string;
  requests: number;
  approved: number;
}
export interface FeedbackDay {
  day: string;
  applied: number;
  notRelevant: number;
  blocked: number;
  other: number;
}
export interface LlmDay {
  day: string;
  requests: number;
  tokens: number;
}
// The pipeline funnel, summed over the selected window — where jobs drop off.
export interface FunnelStats {
  scraped: number;
  filtered: number;
  aiEvaluated: number;
  approved: number;
  lowerRanked: number;
}
export interface TrendStats {
  days: string[]; // the dense day axis, oldest → newest (length = TREND_DAYS)
  runs: RunsDay[];
  signups: SignupsDay[];
  feedback: FeedbackDay[];
  llm: LlmDay[];
  // Funnel + run-trigger mix over the FULL trend window (UI re-slices runs/etc.
  // by tail length but these two read the whole window — simplest useful view).
  funnel: FunnelStats;
  runMix: { scheduled: number; manual: number };
}

export interface AdminAnalytics {
  health: HealthStats;
  users: UserStats;
  runs: RunStats;
  feedback: FeedbackStats;
  llm: LlmUsageStats;
  trends: TrendStats;
  generatedAt: string;
}

// A run is "stalled" if it's been claiming to run for longer than this. The
// pipeline takes ~35-40 min, so 90 minutes is comfortably past a healthy run
// without false-positiving on a slow-but-live one.
const STALL_MINUTES = 90;
// A user is "overdue" once their scheduled next_run_at is more than this far in
// the past — past the normal catch-up window, so it signals a real gap.
const OVERDUE_HOURS = 6;

// How many days of history the trend series span. The UI slices the tail
// (7/14/30) of this, so 30 is the longest view we offer.
const TREND_DAYS = 30;

const JERUSALEM_TZ = "Asia/Jerusalem";
const jeruDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: JERUSALEM_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Jerusalem calendar date (YYYY-MM-DD) for an instant — matches how the
 *  worker stamps llm_usage_daily and how the LLM "today" filter is computed, so
 *  every "day" in the dashboard lines up. */
function jeruDay(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return jeruDateFmt.format(d);
}

/** A dense list of the last TREND_DAYS Jerusalem dates, oldest → newest. */
function trendAxis(): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    out.push(jeruDay(new Date(now - i * 86_400_000)));
  }
  return out;
}

const EMPTY_TRENDS: TrendStats = {
  days: [],
  runs: [],
  signups: [],
  feedback: [],
  llm: [],
  funnel: { scraped: 0, filtered: 0, aiEvaluated: 0, approved: 0, lowerRanked: 0 },
  runMix: { scheduled: 0, manual: 0 },
};

const EMPTY: AdminAnalytics = {
  health: { stalled: [], errorGroups: [], zeroResultUsers: [], overdueUsers: [], emailFailures: [] },
  users: {
    total: 0,
    whitelisted: 0,
    pendingRequests: 0,
    rejectedRequests: 0,
    onboarded: 0,
    stuck: 0,
    recentSignups: [],
    directory: [],
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
  trends: EMPTY_TRENDS,
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
  id: number;
  user_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  scraped: number | null;
  filtered: number | null;
  ai_evaluated: number | null;
  approved: number | null;
  lower_ranked: number | null;
  error: string | null;
  run_trigger: string | null;
  email_status: string | null;
  email_error: string | null;
};
type PrefRow = { user_id: string; is_active: boolean | null; next_run_at: string | null };
type FeedbackRow = { feedback_type: string; company: string | null; submitted_at: string };

export async function loadAdminAnalytics(): Promise<AdminAnalytics> {
  const admin = createAdminClient();
  // "Today" is the JERUSALEM calendar day — the same boundary the worker uses
  // for the daily run budget and the LLM-usage day stamp. Using UTC here made
  // "Runs today" disagree with the worker's budget by the 2-3h Jerusalem→UTC gap.
  const todayJeru = jeruDay(new Date());

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

  // PostgREST caps a query at ~1000 rows by default and TRUNCATES silently —
  // which would make the high-volume event tables (runs / feedback / llm usage)
  // under-count as data grows. Set an explicit ceiling well above any realistic
  // near-term volume so the dashboard stays accurate. (At true scale these move
  // to date-bounded queries / server-side rollups — see the audit notes.)
  const ROW_CAP = 100_000;
  const [profilesRes, searchesRes, requestsRes, runsRes, feedbackRes, prefsRes, llmRes] =
    await Promise.allSettled([
      admin.from("profiles").select("user_id, cv_text, is_whitelisted, created_at").limit(ROW_CAP),
      admin.from("search_queries").select("user_id, is_active").limit(ROW_CAP),
      admin
        .from("access_requests")
        .select("email, first_name, last_name, status, created_at")
        .limit(ROW_CAP),
      admin
        .from("runs")
        .select(
          "id, user_id, status, started_at, ended_at, scraped, filtered, ai_evaluated, approved, lower_ranked, error, run_trigger, email_status, email_error",
        )
        .order("started_at", { ascending: false })
        .limit(ROW_CAP),
      admin.from("feedback").select("feedback_type, company, submitted_at").limit(ROW_CAP),
      admin.from("preferences").select("user_id, is_active, next_run_at").limit(ROW_CAP),
      admin
        .from("llm_usage_daily")
        .select("user_id, provider, model, day, requests, requests_failed, tokens, peak_rpm")
        .limit(ROW_CAP),
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
    prefsRes.status === "fulfilled" ? ((prefsRes.value.data as PrefRow[]) ?? []) : [];
  const activeById = new Map(prefs.map((p) => [p.user_id, p.is_active !== false]));
  const nextRunById = new Map(prefs.map((p) => [p.user_id, p.next_run_at]));

  // ---- Runs -----------------------------------------------------------------
  const runs = runsRes.status === "fulfilled" ? ((runsRes.value.data as RunRow[]) ?? []) : [];
  const runsToday = runs.filter((r) => jeruDay(r.started_at) === todayJeru);
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
  const latestRunByUser = new Map<string, RunRow>();
  for (const r of runs) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    latestRunByUser.set(r.user_id, r);
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

  // ---- User directory (every account, not just those with a run today) ------
  out.users.directory = profiles
    .map((p) => {
      const last = latestRunByUser.get(p.user_id);
      return {
        userId: p.user_id,
        email: label(p.user_id),
        isActive: activeById.get(p.user_id) ?? true,
        isWhitelisted: !!p.is_whitelisted,
        onboarded:
          !!(p.cv_text && p.cv_text.trim()) && usersWithActiveSearch.has(p.user_id),
        lastRunAt: last?.started_at ?? null,
        lastRunStatus: last?.status ?? null,
        createdAt: p.created_at ?? null,
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  // ---- Feedback -------------------------------------------------------------
  const feedback =
    feedbackRes.status === "fulfilled" ? ((feedbackRes.value.data as FeedbackRow[]) ?? []) : [];
  out.feedback.total = feedback.length;
  const blockedCounts = new Map<string, number>();
  for (const f of feedback) {
    if (jeruDay(f.submitted_at) === todayJeru) out.feedback.today += 1;
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

  // ---- Trends (daily series over the last TREND_DAYS days) ------------------
  out.trends = buildTrends(runs, requests, feedback, llmRows);

  // ---- Health (operational red flags) ---------------------------------------
  const now = Date.now();
  const stallCutoff = now - STALL_MINUTES * 60_000;
  const overdueCutoff = now - OVERDUE_HOURS * 3_600_000;

  // 1. Stalled runs — still "running" with no ended_at, started long ago.
  for (const r of runs) {
    if (r.status !== "running" || r.ended_at) continue;
    if (new Date(r.started_at).getTime() > stallCutoff) continue;
    out.health.stalled.push({
      runId: r.id,
      userId: r.user_id,
      email: label(r.user_id),
      startedAt: r.started_at,
    });
  }

  // 2. Failed runs grouped by a normalized error signature.
  const errorMap = new Map<string, { count: number; sample: string }>();
  for (const r of runs) {
    if (r.status !== "failed" || !r.error) continue;
    const sig = errorSignature(r.error);
    const e = errorMap.get(sig) ?? { count: 0, sample: r.error };
    e.count += 1;
    errorMap.set(sig, e);
  }
  out.health.errorGroups = [...errorMap.entries()]
    .map(([signature, { count, sample }]) => ({ signature, count, sample: sample.slice(0, 140) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // The set of onboarded + active users — the only ones we expect to deliver
  // results / be on schedule. (Reuse the onboarding test from the Users block.)
  const onboardedActive = new Set(
    profiles
      .filter(
        (p) =>
          !!(p.cv_text && p.cv_text.trim()) &&
          usersWithActiveSearch.has(p.user_id) &&
          (activeById.get(p.user_id) ?? true),
      )
      .map((p) => p.user_id),
  );

  // 3. Zero-result users — onboarded+active, last run succeeded with 0 approved.
  for (const userId of onboardedActive) {
    const last = latestRunByUser.get(userId);
    if (!last || last.status !== "success") continue;
    if ((last.approved ?? 0) > 0) continue;
    out.health.zeroResultUsers.push({
      userId,
      email: label(userId),
      startedAt: last.started_at,
    });
  }
  out.health.zeroResultUsers.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  // 4. Overdue users — onboarded+active, next_run_at well in the past, or no run
  //    ever. Both mean "should have run by now and hasn't".
  for (const userId of onboardedActive) {
    const last = latestRunByUser.get(userId);
    const nextRun = nextRunById.get(userId);
    if (!last) {
      out.health.overdueUsers.push({ userId, email: label(userId), reason: "never", since: null });
    } else if (nextRun && new Date(nextRun).getTime() < overdueCutoff) {
      out.health.overdueUsers.push({
        userId,
        email: label(userId),
        reason: "overdue",
        since: nextRun,
      });
    }
  }
  out.health.overdueUsers.sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));

  // 5. Email failures — runs whose email send failed (Tier D). The run row knows
  //    the outcome; surface today's failures so SMTP problems are visible (a run
  //    can be "success" while the user got no email). Keep the most recent.
  out.health.emailFailures = runs
    .filter((r) => r.email_status === "failed" && jeruDay(r.started_at) === todayJeru)
    .slice(0, 12)
    .map((r) => ({
      userId: r.user_id,
      email: label(r.user_id),
      startedAt: r.started_at,
      error: r.email_error,
    }));

  return out;
}

/** Collapse a raw error string to a stable signature so the same failure across
 *  users groups together. Matches the common, actionable cases first; otherwise
 *  falls back to the first few words. */
function errorSignature(error: string): string {
  const e = error.toLowerCase();
  if (/(smtp|535|password not accepted|authentication)/.test(e)) return "Email / SMTP auth";
  if (/(rate limit|429|too many requests)/.test(e)) return "Rate limited";
  if (/(quota|budget|exhausted)/.test(e)) return "Quota / budget";
  if (/(timeout|timed out)/.test(e)) return "Timeout";
  if (/(50[0-9]|service unavailable|overloaded|bad gateway)/.test(e)) return "Upstream 5xx";
  if (/(connection|econn|network|dns|resolve)/.test(e)) return "Network / connection";
  if (/(no cv|cv_text|missing cv|empty cv)/.test(e)) return "Missing CV";
  // Fallback: first ~6 words, so unknown errors still cluster by their opening.
  return error.trim().split(/\s+/).slice(0, 6).join(" ").slice(0, 60) || "Unknown error";
}

/** Build the daily trend series. Each series is dense over the TREND_DAYS axis
 *  (zero-filled gaps) so the UI can draw a continuous chart and slice the tail
 *  to 7/14/30 days without reasoning about missing dates. Days are keyed by the
 *  Jerusalem calendar date, matching the rest of the dashboard. */
function buildTrends(
  runs: RunRow[],
  requests: RequestRow[],
  feedback: FeedbackRow[],
  llmRows: LlmUsageRow[],
): TrendStats {
  const days = trendAxis();
  const inWindow = new Set(days);

  // Seed dense, zero-filled maps keyed by day.
  const runsByDay = new Map(days.map((d) => [d, { day: d, total: 0, success: 0, failed: 0 }]));
  const signupsByDay = new Map(days.map((d) => [d, { day: d, requests: 0, approved: 0 }]));
  const feedbackByDay = new Map(
    days.map((d) => [d, { day: d, applied: 0, notRelevant: 0, blocked: 0, other: 0 }]),
  );
  const llmByDay = new Map(days.map((d) => [d, { day: d, requests: 0, tokens: 0 }]));

  const funnel: FunnelStats = {
    scraped: 0,
    filtered: 0,
    aiEvaluated: 0,
    approved: 0,
    lowerRanked: 0,
  };
  const runMix = { scheduled: 0, manual: 0 };

  for (const r of runs) {
    const d = jeruDay(r.started_at);
    if (!inWindow.has(d)) continue;
    const bucket = runsByDay.get(d)!;
    bucket.total += 1;
    if (r.status === "success") bucket.success += 1;
    else if (r.status === "failed") bucket.failed += 1;
    // Funnel + trigger mix over the whole window (counts terminal runs' work).
    funnel.scraped += r.scraped ?? 0;
    funnel.filtered += r.filtered ?? 0;
    funnel.aiEvaluated += r.ai_evaluated ?? 0;
    funnel.approved += r.approved ?? 0;
    funnel.lowerRanked += r.lower_ranked ?? 0;
    if (r.run_trigger === "manual") runMix.manual += 1;
    else runMix.scheduled += 1; // null/unknown defaults to scheduled (the cron path)
  }

  for (const req of requests) {
    const d = jeruDay(req.created_at);
    if (!inWindow.has(d)) continue;
    const bucket = signupsByDay.get(d)!;
    bucket.requests += 1;
    if (req.status === "approved") bucket.approved += 1;
  }

  for (const f of feedback) {
    const d = jeruDay(f.submitted_at);
    if (!inWindow.has(d)) continue;
    const bucket = feedbackByDay.get(d)!;
    if (f.feedback_type === "applied") bucket.applied += 1;
    else if (f.feedback_type === "not_relevant") bucket.notRelevant += 1;
    else if (f.feedback_type === "block_company") bucket.blocked += 1;
    else bucket.other += 1;
  }

  for (const row of llmRows) {
    const d = String(row.day).slice(0, 10);
    if (!inWindow.has(d)) continue;
    const bucket = llmByDay.get(d)!;
    bucket.requests += row.requests ?? 0;
    bucket.tokens += Number(row.tokens ?? 0);
  }

  return {
    days,
    runs: days.map((d) => runsByDay.get(d)!),
    signups: days.map((d) => signupsByDay.get(d)!),
    feedback: days.map((d) => feedbackByDay.get(d)!),
    llm: days.map((d) => llmByDay.get(d)!),
    funnel,
    runMix,
  };
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
