import Link from "next/link";
import { FileText, Mail, Play, Settings, Sparkles } from "lucide-react";
import type { DashboardState } from "../../_lib/dashboard-state";

interface SidebarProps {
  state: DashboardState;
}

export function Sidebar({ state }: SidebarProps) {
  return (
    <aside className="space-y-4">
      <Section title="Quick actions">
        <RunNowButton />
        <SidebarLink
          href="/preferences"
          icon={<Settings className="h-3.5 w-3.5" />}
          label="Preferences"
        />
        <SidebarLink
          href="/onboarding/cv"
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Update CV"
        />
      </Section>

      <Section title="Account">
        <SidebarKV
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Delivery"
          value={state.notificationEmail ?? "—"}
        />
        <SidebarKV
          label="Cadence"
          value={frequencyLabel(state.frequencyHours)}
        />
        <SidebarKV
          label="Active searches"
          value={String(state.activeSearches)}
        />
        <SidebarKV
          label="CV"
          value={state.cvChars ? `${state.cvChars.toLocaleString()} chars` : "—"}
        />
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-4">
      <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <span className="text-[var(--text-tertiary)]">{icon}</span>
      {label}
    </Link>
  );
}

function SidebarKV({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2 py-1">
      <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-tertiary)]">
        {icon}
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-[12px] text-[var(--text-secondary)]">
        {value}
      </span>
    </div>
  );
}

/**
 * "Run now" is part of B6's contract but the worker can only act on it
 * once B7 ships. Rendered as a disabled affordance with an explanatory
 * tooltip so the empty state isn't surprising.
 */
function RunNowButton() {
  return (
    <button
      type="button"
      disabled
      title="Manual runs unlock once the multi-user worker is live."
      className="flex w-full items-center gap-2 rounded-md border border-dashed border-[var(--border-muted)] bg-[var(--bg-overlay)]/40 px-2 py-1.5 text-[13px] text-[var(--text-tertiary)] cursor-not-allowed"
    >
      <Play className="h-3.5 w-3.5" />
      Run now
      <span className="ml-auto inline-flex items-center gap-1 rounded-sm bg-[var(--bg-base)] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-[var(--accent-400)]">
        <Sparkles className="h-2.5 w-2.5" />
        Soon
      </span>
    </button>
  );
}

function frequencyLabel(hours: number | null): string {
  switch (hours) {
    case 1:
      return "Hourly";
    case 24:
      return "Daily";
    case 48:
      return "Every 2 days";
    case 168:
      return "Weekly";
    default:
      return "—";
  }
}
