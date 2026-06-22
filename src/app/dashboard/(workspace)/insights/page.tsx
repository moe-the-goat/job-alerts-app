import type { Metadata } from "next";
import { LineChart } from "lucide-react";
import { loadDashboardState } from "../../_lib/dashboard-state";
import { loadInsights } from "./_lib/insights-data";
import { InsightsView } from "./_components/insights-view";

export const metadata: Metadata = {
  title: "Insights · Dashboard",
};

export default async function InsightsTab() {
  const state = await loadDashboardState();
  const data = await loadInsights(state.user.id);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
          Your job search
        </h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
          A read-only snapshot of your last 30 days — runs, jobs surfaced, how
          they scored, and where you&apos;ve been applying.
        </p>
      </div>

      {data.hasAnyRun ? (
        <InsightsView data={data} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-6 py-16 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
        <LineChart className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
        No runs yet
      </h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
        Once your first run completes, this page fills in with your activity,
        match-score spread, and most-surfaced companies.
      </p>
    </div>
  );
}
