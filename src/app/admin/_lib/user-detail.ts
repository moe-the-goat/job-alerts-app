import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Per-user drill-down data for /admin/users/[id]. Service-role reads across one
 * user — this module must only ever be imported by the ADMIN_USER_ID-gated admin
 * routes. Like loadAdminAnalytics, every section degrades on its own: one failing
 * query returns an empty slice rather than blanking the page.
 */

export interface UserSearch {
  id: number;
  term: string;
  location: string;
  isRemote: boolean;
  isActive: boolean;
}

export interface UserRun {
  id: number;
  status: string;
  trigger: string;
  startedAt: string;
  endedAt: string | null;
  scraped: number;
  filtered: number;
  aiEvaluated: number;
  approved: number;
  lowerRanked: number;
  error: string | null;
  emailStatus: string | null;
  emailError: string | null;
}

export interface UserJobResult {
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  origin: string | null;
  aiEvaluated: boolean;
  matchPercentage: number | null;
  verdict: string | null;
  suspicious: boolean;
}

export interface UserFeedbackItem {
  jobUrl: string;
  title: string | null;
  company: string | null;
  type: string;
  note: string | null;
  submittedAt: string;
}

export interface UserUsageItem {
  model: string;
  provider: string;
  requests: number;
  tokens: number;
}

export interface UserDetail {
  found: boolean;
  userId: string;
  email: string;
  name: string;
  isWhitelisted: boolean;
  isActive: boolean;
  createdAt: string | null;
  // Scheduling / pipeline settings from preferences.
  schedule: {
    frequencyHours: number | null;
    nextRunAt: string | null;
    notificationEmail: string | null;
    aiEvalTopN: number | null;
  };
  cv: { present: boolean; chars: number; preview: string };
  searches: UserSearch[];
  runs: UserRun[]; // newest first, capped
  latestResults: UserJobResult[]; // rows from the most recent run, AI-evaluated first
  feedback: UserFeedbackItem[]; // newest first, capped
  usage: UserUsageItem[]; // all-time per model, biggest first
  counts: { runs: number; feedback: number };
}

const RUN_LIMIT = 30;
const FEEDBACK_LIMIT = 30;
const CV_PREVIEW_CHARS = 1200;

function emptyDetail(userId: string): UserDetail {
  return {
    found: false,
    userId,
    email: userId,
    name: "—",
    isWhitelisted: false,
    isActive: false,
    createdAt: null,
    schedule: { frequencyHours: null, nextRunAt: null, notificationEmail: null, aiEvalTopN: null },
    cv: { present: false, chars: 0, preview: "" },
    searches: [],
    runs: [],
    latestResults: [],
    feedback: [],
    usage: [],
    counts: { runs: 0, feedback: 0 },
  };
}

export async function loadUserDetail(userId: string): Promise<UserDetail> {
  const admin = createAdminClient();
  const out = emptyDetail(userId);

  // Resolve email + name from auth.users (profiles has no email column).
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const u = data?.user;
    if (u) {
      out.email = u.email ?? userId;
      const first = (u.user_metadata?.first_name as string | undefined) ?? "";
      const last = (u.user_metadata?.last_name as string | undefined) ?? "";
      out.name = `${first} ${last}`.trim() || "—";
      out.createdAt = u.created_at ?? null;
    }
  } catch {
    // No auth lookup — fall back to the id as the display label.
  }

  const [profileRes, prefsRes, searchesRes, runsRes, feedbackRes, usageRes] =
    await Promise.allSettled([
      admin
        .from("profiles")
        .select("user_id, cv_text, is_whitelisted, created_at")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("preferences")
        .select("is_active, frequency_hours, next_run_at, notification_email, ai_eval_top_n")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("search_queries")
        .select("id, search_term, location, is_remote, is_active")
        .eq("user_id", userId)
        .order("id", { ascending: true }),
      admin
        .from("runs")
        .select(
          "id, status, run_trigger, started_at, ended_at, scraped, filtered, ai_evaluated, approved, lower_ranked, error, email_status, email_error",
        )
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(RUN_LIMIT),
      admin
        .from("feedback")
        .select("job_url, title, company, feedback_type, note, submitted_at")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false })
        .limit(FEEDBACK_LIMIT),
      admin
        .from("llm_usage_daily")
        .select("provider, model, requests, tokens")
        .eq("user_id", userId),
    ]);

  // Profile + CV.
  if (profileRes.status === "fulfilled") {
    const p = profileRes.value.data as
      | { cv_text: string | null; is_whitelisted: boolean; created_at: string }
      | null;
    if (p) {
      out.found = true;
      out.isWhitelisted = !!p.is_whitelisted;
      out.createdAt = out.createdAt ?? p.created_at ?? null;
      const cv = (p.cv_text ?? "").trim();
      out.cv = {
        present: cv.length > 0,
        chars: cv.length,
        preview: cv.slice(0, CV_PREVIEW_CHARS),
      };
    }
  }

  // Preferences / schedule.
  if (prefsRes.status === "fulfilled") {
    const pref = prefsRes.value.data as
      | {
          is_active: boolean | null;
          frequency_hours: number | null;
          next_run_at: string | null;
          notification_email: string | null;
          ai_eval_top_n: number | null;
        }
      | null;
    if (pref) {
      out.found = true;
      out.isActive = pref.is_active !== false;
      out.schedule = {
        frequencyHours: pref.frequency_hours ?? null,
        nextRunAt: pref.next_run_at ?? null,
        notificationEmail: pref.notification_email ?? null,
        aiEvalTopN: pref.ai_eval_top_n ?? null,
      };
    }
  }

  // Searches.
  if (searchesRes.status === "fulfilled") {
    const rows = (searchesRes.value.data as
      | {
          id: number;
          search_term: string;
          location: string;
          is_remote: boolean | null;
          is_active: boolean | null;
        }[]
      | null) ?? [];
    out.searches = rows.map((s) => ({
      id: s.id,
      term: s.search_term,
      location: s.location,
      isRemote: s.is_remote !== false,
      isActive: s.is_active !== false,
    }));
  }

  // Run history.
  let latestRunId: number | null = null;
  if (runsRes.status === "fulfilled") {
    const rows = (runsRes.value.data as RunDbRow[] | null) ?? [];
    out.runs = rows.map(mapRun);
    out.counts.runs = rows.length;
    latestRunId = rows[0]?.id ?? null;
  }

  // Latest run's surfaced results (AI-evaluated first, then by match %).
  if (latestRunId !== null) {
    try {
      const { data } = await admin
        .from("job_results")
        .select(
          "title, company, location, job_url, origin, ai_evaluated, ai_verdict, match_percentage, suspicious",
        )
        .eq("run_id", latestRunId)
        .order("ai_evaluated", { ascending: false })
        .order("match_percentage", { ascending: false, nullsFirst: false })
        .limit(50);
      out.latestResults = ((data as JobResultDbRow[] | null) ?? []).map((j) => ({
        title: j.title ?? "—",
        company: j.company ?? "—",
        location: j.location ?? "",
        jobUrl: j.job_url ?? "",
        origin: j.origin ?? null,
        aiEvaluated: !!j.ai_evaluated,
        matchPercentage: j.match_percentage ?? null,
        verdict: j.ai_verdict ?? null,
        suspicious: !!j.suspicious,
      }));
    } catch {
      // Leave latestResults empty if the results query fails.
    }
  }

  // Feedback given.
  if (feedbackRes.status === "fulfilled") {
    const rows = (feedbackRes.value.data as FeedbackDbRow[] | null) ?? [];
    out.feedback = rows.map((f) => ({
      jobUrl: f.job_url,
      title: f.title ?? null,
      company: f.company ?? null,
      type: f.feedback_type,
      note: f.note ?? null,
      submittedAt: f.submitted_at,
    }));
    out.counts.feedback = rows.length;
  }

  // LLM usage (all-time, rolled up per model).
  if (usageRes.status === "fulfilled") {
    const rows = (usageRes.value.data as UsageDbRow[] | null) ?? [];
    const byModel = new Map<string, UserUsageItem>();
    for (const r of rows) {
      const m = byModel.get(r.model) ?? {
        model: r.model,
        provider: r.provider,
        requests: 0,
        tokens: 0,
      };
      m.requests += r.requests ?? 0;
      m.tokens += Number(r.tokens ?? 0);
      byModel.set(r.model, m);
    }
    out.usage = [...byModel.values()].sort((a, b) => b.requests - a.requests);
  }

  return out;
}

type RunDbRow = {
  id: number;
  status: string;
  run_trigger: string | null;
  started_at: string;
  ended_at: string | null;
  scraped: number | null;
  filtered: number | null;
  ai_evaluated: number | null;
  approved: number | null;
  lower_ranked: number | null;
  error: string | null;
  email_status: string | null;
  email_error: string | null;
};
type JobResultDbRow = {
  title: string | null;
  company: string | null;
  location: string | null;
  job_url: string | null;
  origin: string | null;
  ai_evaluated: boolean | null;
  ai_verdict: string | null;
  match_percentage: number | null;
  suspicious: boolean | null;
};
type FeedbackDbRow = {
  job_url: string;
  title: string | null;
  company: string | null;
  feedback_type: string;
  note: string | null;
  submitted_at: string;
};
type UsageDbRow = { provider: string; model: string; requests: number | null; tokens: number | null };

function mapRun(r: RunDbRow): UserRun {
  return {
    id: r.id,
    status: r.status,
    trigger: r.run_trigger ?? "scheduled",
    startedAt: r.started_at,
    endedAt: r.ended_at,
    scraped: r.scraped ?? 0,
    filtered: r.filtered ?? 0,
    aiEvaluated: r.ai_evaluated ?? 0,
    approved: r.approved ?? 0,
    lowerRanked: r.lower_ranked ?? 0,
    error: r.error,
    emailStatus: r.email_status ?? null,
    emailError: r.email_error ?? null,
  };
}
