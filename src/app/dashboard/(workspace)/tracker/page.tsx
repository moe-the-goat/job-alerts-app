import type { Metadata } from "next";
import { KanbanSquare } from "lucide-react";
import { loadDashboardState } from "../../_lib/dashboard-state";
import { Board } from "./_components/board";
import { AddFromResults } from "./_components/add-from-results";
import { loadBookmarks, loadLatestRunBookmarkableJobs } from "./_lib/bookmark-data";

export const metadata: Metadata = {
  title: "Tracker · Dashboard",
};

export default async function TrackerTab() {
  const state = await loadDashboardState();
  const [bookmarks, latestRun] = await Promise.all([
    loadBookmarks(state.user.id),
    loadLatestRunBookmarkableJobs(state.user.id),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
            Application tracker
          </h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">
            {bookmarks.length === 0
              ? "Bookmark jobs from Feedback or add them here — then move each one down the pipeline."
              : `${bookmarks.length} job${bookmarks.length === 1 ? "" : "s"} tracked · move each card as it progresses.`}
          </p>
        </div>
        <AddFromResults
          jobs={latestRun.jobs}
          runStartedAt={latestRun.runStartedAt}
          totalInRun={latestRun.totalInRun}
        />
      </div>

      {bookmarks.length === 0 ? (
        <EmptyState />
      ) : (
        <Board bookmarks={bookmarks} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-6 py-16 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
        <KanbanSquare className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
        Nothing tracked yet
      </h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
        Hit{" "}
        <span className="font-medium text-[var(--text-primary)]">Bookmark</span> on
        a job in the Feedback tab, or use{" "}
        <span className="font-medium text-[var(--text-primary)]">Add from results</span>{" "}
        above. Each job moves through Saved → Applied → Phone Screen → Interview
        → Offer → Closed.
      </p>
    </div>
  );
}
