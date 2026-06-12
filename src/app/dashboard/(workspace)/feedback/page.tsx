import type { Metadata } from "next";
import { AlertCircle, Inbox } from "lucide-react";
import { loadDashboardState } from "../../_lib/dashboard-state";
import { ResultsGrid } from "./_components/results-grid";
import { RunPicker } from "./_components/run-picker";
import {
  loadJobsForRun,
  loadRecentRuns,
  pickActiveRun,
} from "./_lib/feedback-data";
import type { RunSummary } from "./_lib/types";

export const metadata: Metadata = {
  title: "Feedback · Dashboard",
};

interface FeedbackPageProps {
  searchParams: Promise<{ run?: string }>;
}

export default async function FeedbackTab({ searchParams }: FeedbackPageProps) {
  const state = await loadDashboardState();
  const params = await searchParams;
  const requestedId = parseRunId(params.run);

  const runs = await loadRecentRuns(state.user.id);
  const activeRun = pickActiveRun(runs, requestedId);

  if (!activeRun) {
    return <EmptyState frequencyHours={state.frequencyHours} />;
  }

  if (activeRun.status === "failed") {
    return (
      <FailedState
        runs={runs}
        activeRun={activeRun}
      />
    );
  }

  if (activeRun.status === "running") {
    return (
      <RunningState
        runs={runs}
        activeRun={activeRun}
      />
    );
  }

  if (activeRun.status === "success" && activeRun.approved === 0) {
    return (
      <ZeroApprovedState
        runs={runs}
        activeRun={activeRun}
      />
    );
  }

  const jobs = await loadJobsForRun(state.user.id, activeRun.id);

  return (
    <div className="space-y-5">
      <FeedbackHeader runs={runs} activeRun={activeRun} jobCount={jobs.length} />
      <ResultsGrid jobs={jobs} />
    </div>
  );
}

function FeedbackHeader({
  runs,
  activeRun,
  jobCount,
}: {
  runs: RunSummary[];
  activeRun: RunSummary;
  jobCount: number;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h2 className="font-serif text-[22px] tracking-tight text-[var(--text-primary)]">
          {isToday(activeRun.started_at) ? "Today's picks" : "Run picks"}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
          {jobCount} job{jobCount === 1 ? "" : "s"} scored against your CV ·
          react to tune tomorrow.
        </p>
      </div>
      <RunPicker runs={runs} activeRunId={activeRun.id} />
    </div>
  );
}

function EmptyState({ frequencyHours }: { frequencyHours: number | null }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-6 py-16 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
        <Inbox className="h-5 w-5" />
      </div>
      <h2 className="mt-4 font-serif text-[19px] text-[var(--text-primary)]">
        Your first morning is on the way
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
        We&apos;re {cadenceLabel(frequencyHours)}. Once the first run finishes,
        the picks land here and in your inbox at the same time.
      </p>
    </div>
  );
}

function ZeroApprovedState({
  runs,
  activeRun,
}: {
  runs: RunSummary[];
  activeRun: RunSummary;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
          No picks this run
        </h2>
        <RunPicker runs={runs} activeRunId={activeRun.id} />
      </div>
      <div className="rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-6 py-10 text-center">
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          The run finished, but nothing cleared the AI verdict bar. This
          happens on quiet days — try a previous run from the picker, or widen
          your search terms in{" "}
          <a
            href="/preferences"
            className="text-[var(--accent-400)] underline-offset-4 hover:underline"
          >
            Preferences
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function FailedState({
  runs,
  activeRun,
}: {
  runs: RunSummary[];
  activeRun: RunSummary;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
          Last run failed
        </h2>
        <RunPicker runs={runs} activeRunId={activeRun.id} />
      </div>
      <div className="rounded-xl border border-[var(--danger-400)]/30 bg-[var(--danger-400)]/5 px-6 py-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-400)]" />
          <div>
            <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
              We hit an error before we could deliver. The next scheduled run
              will try again — you don&apos;t need to do anything.
            </p>
            <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">
              If failures keep happening, check your{" "}
              <a
                href="/preferences"
                className="text-[var(--accent-400)] underline-offset-4 hover:underline"
              >
                Preferences
              </a>{" "}
              for an obvious problem like a typo&apos;d location.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunningState({
  runs,
  activeRun,
}: {
  runs: RunSummary[];
  activeRun: RunSummary;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
          Run in progress
        </h2>
        <RunPicker runs={runs} activeRunId={activeRun.id} />
      </div>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-6 py-10 text-center text-sm text-[var(--text-secondary)]">
        Picks will appear here as soon as the worker finishes. Refresh the page
        in a few minutes — runs typically take 5 to 7 minutes.
      </div>
    </div>
  );
}

function parseRunId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
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

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
