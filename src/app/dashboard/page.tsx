import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Hammer,
  Inbox,
  KanbanSquare,
  Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, prefsRes, searchesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("cv_text, cv_uploaded_at")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("preferences")
      .select("notification_email, is_active, next_run_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("search_queries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  const profile = profileRes.data;
  const prefs = prefsRes.data;
  const activeSearches = searchesRes.count ?? 0;

  const hasCv = Boolean(profile?.cv_text && profile.cv_text.length > 0);
  const hasPrefs = Boolean(prefs?.notification_email);
  const ready = hasCv && hasPrefs && activeSearches > 0 && (prefs?.is_active ?? false);

  const step = !hasCv ? "cv" : !hasPrefs || activeSearches === 0 ? "prefs" : "ready";

  return (
    <AppShell email={user.email}>
      <div className="animate-fade-in-up max-w-2xl">
        <div
          className={[
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
            ready
              ? "border-[var(--success-400)]/30 bg-[var(--success-400)]/10 text-[var(--success-400)]"
              : "border-[var(--border-muted)] bg-[var(--bg-elevated)]/60 text-[var(--text-secondary)]",
          ].join(" ")}
        >
          {ready ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              All set
            </>
          ) : (
            <>
              <Hammer className="h-3 w-3 text-[var(--accent-400)]" />
              Coming soon
            </>
          )}
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Welcome,{" "}
          <span className="text-[var(--accent-400)]">
            {user.email?.split("@")[0]}
          </span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
          {ready
            ? `${activeSearches} active ${activeSearches === 1 ? "search is" : "searches are"} running against your CV. The morning email is on.`
            : "Your account is ready. The full dashboard — daily matches and your personal tracker — is being built next."}
        </p>
      </div>

      {/* Onboarding progress strip — visible until both CV + preferences are set */}
      {!ready && (
        <div
          className="animate-fade-in-up mt-10 space-y-3"
          style={{ animationDelay: "60ms" }}
        >
          <OnboardingStep
            index={1}
            title="Upload your CV"
            body="We score every job we find against this. Required."
            done={hasCv}
            active={step === "cv"}
            href="/onboarding/cv"
            ctaLabel={hasCv ? "Update" : "Upload CV"}
          />
          <OnboardingStep
            index={2}
            title="Set your preferences"
            body="Where to send the email, how often it runs, and what to search for."
            done={hasPrefs && activeSearches > 0}
            active={step === "prefs"}
            href="/preferences"
            ctaLabel={
              hasPrefs && activeSearches > 0
                ? "Edit"
                : hasPrefs
                  ? "Add a search"
                  : "Set preferences"
            }
          />
        </div>
      )}

      {ready && (
        <div
          className="animate-fade-in-up mt-10 grid gap-3 sm:grid-cols-2"
          style={{ animationDelay: "60ms" }}
        >
          <StatusTile
            icon={<FileText className="h-4 w-4" />}
            label="CV"
            value={`${profile?.cv_text?.length.toLocaleString()} chars`}
            hint={
              profile?.cv_uploaded_at
                ? `updated ${formatUpdated(profile.cv_uploaded_at)}`
                : null
            }
            href="/onboarding/cv"
          />
          <StatusTile
            icon={<Settings className="h-4 w-4" />}
            label="Searches"
            value={`${activeSearches} active`}
            hint={prefs?.notification_email ? `to ${prefs.notification_email}` : null}
            href="/preferences"
          />
        </div>
      )}

      <div
        className="animate-fade-in-up mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2"
        style={{ animationDelay: "120ms" }}
      >
        <UpcomingCard
          icon={<Inbox className="h-5 w-5" />}
          tab="Tab A"
          title="Feedback"
          body="Review today's AI-scored jobs and tell the model what worked. Your reactions tune future runs."
        />
        <UpcomingCard
          icon={<KanbanSquare className="h-5 w-5" />}
          tab="Tab B"
          title="Tracker"
          body="A private kanban for jobs you've bookmarked. Track them from saved through to offer."
        />
      </div>
    </AppShell>
  );
}

function formatUpdated(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function OnboardingStep({
  index,
  title,
  body,
  done,
  active,
  href,
  ctaLabel,
}: {
  index: number;
  title: string;
  body: string;
  done: boolean;
  active: boolean;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-4 rounded-xl border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between",
        done
          ? "border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40"
          : active
            ? "border-[var(--accent-500)]/30 bg-gradient-to-br from-[var(--accent-500)]/10 to-[var(--bg-elevated)]/60"
            : "border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            done
              ? "bg-[var(--success-400)]/10 text-[var(--success-400)] ring-[var(--success-400)]/30"
              : active
                ? "bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-[var(--accent-500)]/30"
                : "bg-[var(--bg-overlay)] text-[var(--text-tertiary)] ring-[var(--border-muted)]",
          ].join(" ")}
        >
          {done ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <span className="font-mono text-[12px] font-medium">{index}</span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-medium text-[var(--text-primary)]">
              {title}
            </div>
            {done && (
              <span className="rounded-md bg-[var(--success-400)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--success-400)]">
                Done
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
            {body}
          </p>
        </div>
      </div>
      <Link
        href={href}
        className={buttonStyles({
          variant: done ? "ghost" : active ? "primary" : "secondary",
          size: "md",
        })}
      >
        {ctaLabel}
        {!done && <ArrowRight className="h-4 w-4" />}
      </Link>
    </div>
  );
}

function StatusTile({
  icon,
  label,
  value,
  hint,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-4 transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]/70 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            {label}
          </div>
          <div className="truncate text-sm text-[var(--text-primary)]">
            <span className="font-medium">{value}</span>
            {hint && (
              <span className="text-[var(--text-tertiary)]"> · {hint}</span>
            )}
          </div>
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-secondary)]" />
    </Link>
  );
}

function UpcomingCard({
  icon,
  tab,
  title,
  body,
}: {
  icon: React.ReactNode;
  tab: string;
  title: string;
  body: string;
}) {
  return (
    <div className="relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
          {icon}
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            {tab}
          </div>
          <div className="text-base font-medium text-[var(--text-primary)]">
            {title}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
        {body}
      </p>
    </div>
  );
}
