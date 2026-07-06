import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface LastRun {
  id: number;
  status: "running" | "success" | "failed" | "skipped";
  started_at: string;
  ended_at: string | null;
  scraped: number;
  filtered: number;
  ai_evaluated: number;
  approved: number;
  lower_ranked: number;
}

export interface DashboardState {
  user: User;
  hasCv: boolean;
  cvChars: number;
  cvUploadedAt: string | null;
  hasPrefs: boolean;
  notificationEmail: string | null;
  frequencyHours: number | null;
  isActive: boolean;
  nextRunAt: string | null;
  activeSearches: number;
  ready: boolean;
  lastRun: LastRun | null;
  // Manual-run budget (migration 0014). runsUsedToday is the count since
  // local-midnight Asia/Jerusalem via the runs_used_today RPC; maxRunsPerDay
  // mirrors the worker's MAX_RUNS_PER_DAY so the UI and worker agree.
  runsUsedToday: number;
  maxRunsPerDay: number;
  // A dispatched run that hasn't produced its runs row yet (the worker only
  // inserts it after boot + the shared local scrape, ~10-15 min). Non-null ⇒
  // show a "run starting" state and block new dispatches. Set by both the
  // user's Run-now and the admin's forced run.
  pendingDispatchAt: string | null;
}

// Keep in lockstep with multi_user_runner.MAX_RUNS_PER_DAY. If you change one,
// change the other — the worker is the enforcer; this is only for display.
export const MAX_RUNS_PER_DAY = 2;

// How long a dispatch stays "pending" while we wait for its runs row. Runs
// take ~35-40 min total and the row lands ~10-15 min in; past this window we
// assume the workflow died and stop blocking/showing the starting state.
export const PENDING_DISPATCH_WINDOW_MS = 45 * 60 * 1000;

/**
 * Whether a manual dispatch is still "warming up": dispatched recently and its
 * runs row hasn't appeared yet (rows started at/after the dispatch instant
 * count as landed). Pure so both the loader and the Run-now guard share it.
 */
export function resolvePendingDispatch(
  dispatchedAt: string | null | undefined,
  lastRunStartedAt: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!dispatchedAt) return null;
  const t = new Date(dispatchedAt).getTime();
  if (!Number.isFinite(t)) return null;
  if (now - t >= PENDING_DISPATCH_WINDOW_MS || t > now + 60_000) return null;
  if (lastRunStartedAt) {
    const started = new Date(lastRunStartedAt).getTime();
    if (Number.isFinite(started) && started >= t) return null; // it landed
  }
  return dispatchedAt;
}

/**
 * Single source of truth for the dashboard's read state. Wrapped in
 * `React.cache` so layout + pages share one query batch per request.
 * Redirects to /login when no session exists — callers can assume
 * `user` is present.
 */
export const loadDashboardState = cache(async (): Promise<DashboardState> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, prefsRes, searchesRes, lastRunRes, runsUsedRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("cv_text, cv_uploaded_at")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("preferences")
      .select(
        "notification_email, frequency_hours, is_active, next_run_at, last_manual_dispatch_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("search_queries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("runs")
      .select(
        "id, status, started_at, ended_at, scraped, filtered, ai_evaluated, approved, lower_ranked",
      )
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Daily-budget usage. If the RPC isn't available yet (migration 0014 not
    // applied) this errors out — we coalesce to 0 so the dashboard still
    // renders; the worker still enforces the real cap regardless.
    supabase.rpc("runs_used_today", { p_user_id: user.id }),
  ]);

  const profile = profileRes.data;
  const prefs = prefsRes.data;
  const cvText = profile?.cv_text ?? "";
  const hasCv = cvText.length > 0;
  const hasPrefs = Boolean(prefs?.notification_email);
  const activeSearches = searchesRes.count ?? 0;
  const isActive = prefs?.is_active ?? false;
  const ready = hasCv && hasPrefs && activeSearches > 0 && isActive;
  const lastRun = (lastRunRes.data as LastRun | null) ?? null;

  return {
    user,
    hasCv,
    cvChars: cvText.length,
    cvUploadedAt: profile?.cv_uploaded_at ?? null,
    hasPrefs,
    notificationEmail: prefs?.notification_email ?? null,
    frequencyHours: prefs?.frequency_hours ?? null,
    isActive,
    nextRunAt: prefs?.next_run_at ?? null,
    activeSearches,
    ready,
    lastRun,
    runsUsedToday:
      typeof runsUsedRes.data === "number" && runsUsedRes.data >= 0
        ? runsUsedRes.data
        : 0,
    maxRunsPerDay: MAX_RUNS_PER_DAY,
    pendingDispatchAt: resolvePendingDispatch(
      prefs?.last_manual_dispatch_at ?? null,
      lastRun?.started_at ?? null,
    ),
  };
});

/**
 * Require the user to have completed onboarding. Used by the
 * (workspace) layout so the two tab routes can't be reached
 * mid-onboarding — visiting them when not ready bounces to /dashboard,
 * which renders the onboarding strip.
 */
export async function requireReady(): Promise<DashboardState> {
  const state = await loadDashboardState();
  if (!state.ready) redirect("/dashboard");
  return state;
}
