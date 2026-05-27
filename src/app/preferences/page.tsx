import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PreferencesSection } from "./preferences-section";
import { SearchesSection } from "./searches-section";
import type { SearchRow } from "./types";

export const metadata: Metadata = {
  title: "Preferences",
};

export default async function PreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [prefsRes, searchesRes] = await Promise.all([
    supabase
      .from("preferences")
      .select(
        "notification_email, frequency_hours, is_active, next_run_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("search_queries")
      .select(
        "id, search_term, location, sites, job_type, is_remote, results_wanted, hours_old, country_indeed, is_active, updated_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  const prefs = prefsRes.data ?? {
    notification_email: user.email ?? "",
    frequency_hours: 24,
    is_active: true,
    next_run_at: null,
  };
  const searches: SearchRow[] = (searchesRes.data ?? []) as SearchRow[];

  return (
    <AppShell email={user.email}>
      <div className="animate-fade-in-up mb-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Preferences
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--text-secondary)]">
          How and when we deliver. What we look for. Change any of this any
          time — it takes effect on the next run.
        </p>
      </div>

      <div className="space-y-10">
        <PreferencesSection
          initialEmail={prefs.notification_email}
          initialFrequency={prefs.frequency_hours}
          initialActive={prefs.is_active}
          nextRunAt={prefs.next_run_at}
        />

        <SearchesSection initialSearches={searches} />
      </div>
    </AppShell>
  );
}
