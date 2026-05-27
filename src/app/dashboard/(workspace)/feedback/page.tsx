import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { loadDashboardState } from "../../_lib/dashboard-state";

export const metadata: Metadata = {
  title: "Feedback · Dashboard",
};

export default async function FeedbackTab() {
  const state = await loadDashboardState();
  const hasRun = state.lastRun?.status === "success" && state.lastRun.approved > 0;

  if (!hasRun) {
    return <EmptyState frequency={state.frequencyHours} />;
  }

  // B6a will replace this section with real job cards from `job_results`.
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-6 py-12 text-center text-sm text-[var(--text-tertiary)]">
      Job cards coming in B6a — last run approved{" "}
      <span className="font-mono text-[var(--text-secondary)]">
        {state.lastRun?.approved}
      </span>{" "}
      job{state.lastRun?.approved === 1 ? "" : "s"}.
    </div>
  );
}

function EmptyState({ frequency }: { frequency: number | null }) {
  const cadence = cadenceLabel(frequency);
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-6 py-16 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
        <Inbox className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
        Your first morning is on the way
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
        We&apos;re {cadence}. Once the first run finishes, the picks land here
        and in your inbox at the same time.
      </p>
    </div>
  );
}

function cadenceLabel(hours: number | null): string {
  switch (hours) {
    case 1:
      return "scoring jobs every hour (debug)";
    case 24:
      return "scoring jobs every morning";
    case 48:
      return "scoring jobs every two days";
    case 168:
      return "scoring jobs once a week";
    default:
      return "scoring jobs on your schedule";
  }
}
