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

  const [profileRes, prefsRes, searchesRes, lastRunRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("cv_text, cv_uploaded_at")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("preferences")
      .select("notification_email, frequency_hours, is_active, next_run_at")
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
  ]);

  const profile = profileRes.data;
  const prefs = prefsRes.data;
  const cvText = profile?.cv_text ?? "";
  const hasCv = cvText.length > 0;
  const hasPrefs = Boolean(prefs?.notification_email);
  const activeSearches = searchesRes.count ?? 0;
  const isActive = prefs?.is_active ?? false;
  const ready = hasCv && hasPrefs && activeSearches > 0 && isActive;

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
    lastRun: (lastRunRes.data as LastRun | null) ?? null,
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
