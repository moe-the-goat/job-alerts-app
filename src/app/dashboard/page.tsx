import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, FileText, Hammer, Inbox, KanbanSquare } from "lucide-react";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_text, cv_uploaded_at")
    .eq("user_id", user.id)
    .single();

  const hasCv = Boolean(profile?.cv_text && profile.cv_text.length > 0);

  return (
    <AppShell email={user.email}>
      <div className="animate-fade-in-up max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-muted)] bg-[var(--bg-elevated)]/60 px-3 py-1 text-xs text-[var(--text-secondary)]">
          <Hammer className="h-3 w-3 text-[var(--accent-400)]" />
          Coming soon
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Welcome,{" "}
          <span className="text-[var(--accent-400)]">
            {user.email?.split("@")[0]}
          </span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
          Your account is ready. The full dashboard — daily matches and your
          personal tracker — is being built next.
        </p>
      </div>

      {!hasCv && (
        <div
          className="animate-fade-in-up mt-10 rounded-xl border border-[var(--accent-500)]/30 bg-gradient-to-br from-[var(--accent-500)]/10 to-[var(--bg-elevated)]/60 p-6"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--accent-500)]/30">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-medium text-[var(--text-primary)]">
                  Upload your CV to start
                </div>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                  We score every job against your CV. Once it&apos;s uploaded,
                  the morning email turns on.
                </p>
              </div>
            </div>
            <Link
              href="/onboarding/cv"
              className={buttonStyles({ variant: "primary", size: "md" })}
            >
              Upload CV
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {hasCv && (
        <div
          className="animate-fade-in-up mt-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-overlay)] text-[var(--success-400)] ring-1 ring-inset ring-[var(--border-muted)]">
                <FileText className="h-4 w-4" />
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                CV on file —{" "}
                <span className="text-[var(--text-primary)]">
                  {profile?.cv_text?.length.toLocaleString()} chars
                </span>
                {profile?.cv_uploaded_at && (
                  <>
                    , updated{" "}
                    <span className="text-[var(--text-tertiary)]">
                      {formatUpdated(profile.cv_uploaded_at)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <Link
              href="/onboarding/cv"
              className={buttonStyles({ variant: "ghost", size: "sm" })}
            >
              Update
            </Link>
          </div>
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
