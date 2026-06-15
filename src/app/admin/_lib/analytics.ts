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
    email: string;
    status: string;
    startedAt: string;
    approved: number;
    error: string | null;
  }[];
}

export interface FeedbackStats {
  total: number;
  today: number;
  byType: Record<string, number>;
  topBlockedCompanies: { company: string; count: number }[];
}

export interface AdminAnalytics {
  users: UserStats;
  runs: RunStats;
  feedback: FeedbackStats;
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

  const [profilesRes, searchesRes, requestsRes, runsRes, feedbackRes] =
    await Promise.allSettled([
      admin.from("profiles").select("user_id, cv_text, is_whitelisted, created_at"),
      admin.from("search_queries").select("user_id, is_active"),
      admin.from("access_requests").select("email, first_name, last_name, status, created_at"),
      admin
        .from("runs")
        .select("user_id, status, started_at, approved, scraped, error")
        .order("started_at", { ascending: false }),
      admin.from("feedback").select("feedback_type, company, submitted_at"),
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
      email: label(r.user_id),
      status: r.status,
      startedAt: r.started_at,
      approved: r.approved ?? 0,
      error: r.error,
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

  return out;
}
