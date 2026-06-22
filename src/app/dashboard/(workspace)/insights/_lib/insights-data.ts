import { createClient } from "@/lib/supabase/server";

/**
 * Per-user "your job search" insights — the user-facing analog of the admin
 * analytics, scoped to the signed-in user (RLS enforces it; we also filter by
 * user_id for clarity). All read-only, derived from data we already store:
 * runs, job_results, feedback.
 */

export interface DayPoint {
  day: string; // YYYY-MM-DD (Jerusalem)
  runs: number;
  surfaced: number; // job_results created that day
}

export interface CompanyCount {
  company: string;
  count: number;
}

export interface MatchBucket {
  label: string; // e.g. "80–100"
  count: number;
}

export interface InsightsData {
  windowDays: number;
  totals: {
    runs: number;
    surfaced: number; // total job_results in window
    applied: number; // feedback_type = applied (all-time)
    avgMatch: number | null; // mean match_percentage over AI-evaluated jobs in window
  };
  daily: DayPoint[]; // dense, oldest → newest
  topCompanies: CompanyCount[];
  matchBuckets: MatchBucket[];
  hasAnyRun: boolean;
}

const WINDOW_DAYS = 30;
const TZ = "Asia/Jerusalem";
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const jeruDay = (at: string | Date): string =>
  fmt.format(typeof at === "string" ? new Date(at) : at);

function axis(): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    out.push(jeruDay(new Date(now - i * 86_400_000)));
  }
  return out;
}

const EMPTY: InsightsData = {
  windowDays: WINDOW_DAYS,
  totals: { runs: 0, surfaced: 0, applied: 0, avgMatch: null },
  daily: [],
  topCompanies: [],
  matchBuckets: [],
  hasAnyRun: false,
};

type RunRow = { started_at: string; status: string };
type JobRow = {
  company: string | null;
  match_percentage: number | null;
  ai_evaluated: boolean | null;
  created_at: string;
};
type FeedbackRow = { feedback_type: string };

export async function loadInsights(userId: string): Promise<InsightsData> {
  const supabase = await createClient();
  const days = axis();
  const inWindow = new Set(days);

  const [runsRes, jobsRes, feedbackRes] = await Promise.allSettled([
    supabase
      .from("runs")
      .select("started_at, status")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(2000)
      .returns<RunRow[]>(),
    supabase
      .from("job_results")
      .select("company, match_percentage, ai_evaluated, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10000)
      .returns<JobRow[]>(),
    supabase
      .from("feedback")
      .select("feedback_type")
      .eq("user_id", userId)
      .returns<FeedbackRow[]>(),
  ]);

  const runs = runsRes.status === "fulfilled" ? (runsRes.value.data ?? []) : [];
  const jobs = jobsRes.status === "fulfilled" ? (jobsRes.value.data ?? []) : [];
  const feedback = feedbackRes.status === "fulfilled" ? (feedbackRes.value.data ?? []) : [];

  const out: InsightsData = structuredClone(EMPTY);
  out.hasAnyRun = runs.length > 0;

  // Dense daily series (zero-filled), keyed by Jerusalem date.
  const runsByDay = new Map(days.map((d) => [d, 0]));
  const surfacedByDay = new Map(days.map((d) => [d, 0]));

  for (const r of runs) {
    const d = jeruDay(r.started_at);
    if (inWindow.has(d)) runsByDay.set(d, (runsByDay.get(d) ?? 0) + 1);
  }

  const companyCounts = new Map<string, number>();
  const buckets = [0, 0, 0, 0, 0]; // <20, 20-39, 40-59, 60-79, 80-100
  let matchSum = 0;
  let matchN = 0;

  for (const j of jobs) {
    const d = jeruDay(j.created_at);
    if (!inWindow.has(d)) continue;
    surfacedByDay.set(d, (surfacedByDay.get(d) ?? 0) + 1);
    out.totals.surfaced += 1;
    if (j.company) {
      const c = j.company.trim();
      if (c) companyCounts.set(c, (companyCounts.get(c) ?? 0) + 1);
    }
    if (j.ai_evaluated && j.match_percentage != null) {
      const m = Math.max(0, Math.min(100, j.match_percentage));
      matchSum += m;
      matchN += 1;
      const idx = m >= 80 ? 4 : m >= 60 ? 3 : m >= 40 ? 2 : m >= 20 ? 1 : 0;
      buckets[idx] += 1;
    }
  }

  out.totals.runs = days.reduce((n, d) => n + (runsByDay.get(d) ?? 0), 0);
  out.totals.applied = feedback.filter((f) => f.feedback_type === "applied").length;
  out.totals.avgMatch = matchN > 0 ? Math.round(matchSum / matchN) : null;

  out.daily = days.map((d) => ({
    day: d,
    runs: runsByDay.get(d) ?? 0,
    surfaced: surfacedByDay.get(d) ?? 0,
  }));

  out.topCompanies = [...companyCounts.entries()]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const bucketLabels = ["<20", "20–39", "40–59", "60–79", "80–100"];
  out.matchBuckets = buckets.map((count, i) => ({ label: bucketLabels[i], count }));

  return out;
}
