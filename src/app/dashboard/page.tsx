import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Hammer, Inbox, KanbanSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-[var(--text-secondary)]">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12">
        <div className="animate-fade-in-up max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-muted)] bg-[var(--bg-elevated)]/60 px-3 py-1 text-xs text-[var(--text-secondary)]">
            <Hammer className="h-3 w-3 text-[var(--accent-400)]" />
            Coming soon
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Welcome,{" "}
            <span className="text-gradient">{user.email?.split("@")[0]}</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            Your account is ready. The full dashboard — daily matches and your
            personal tracker — is being built next.
          </p>
        </div>

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
      </main>
    </div>
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
