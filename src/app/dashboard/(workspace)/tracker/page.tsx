import type { Metadata } from "next";
import { Bookmark, KanbanSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Tracker · Dashboard",
};

const COLUMNS = [
  "Saved",
  "Applied",
  "Phone Screen",
  "Interview",
  "Offer",
  "Closed",
] as const;

export default function TrackerTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-6 py-10 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
          <KanbanSquare className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
          Your application tracker
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          Bookmark jobs from the Feedback tab and they&apos;ll show up here as
          a kanban — from Saved through Offer.
        </p>
      </div>

      {/* Visual placeholder of the kanban so the layout is honest about what's coming. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col} label={col} />
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-3 opacity-60">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </span>
        <span className="text-[10.5px] text-[var(--text-disabled)]">0</span>
      </div>
      <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-[var(--border-subtle)] bg-[var(--bg-base)]/40">
        <Bookmark className="h-3.5 w-3.5 text-[var(--text-disabled)]" />
      </div>
    </div>
  );
}
