"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { addBookmarkAction } from "../actions";
import type { BookmarkableJob } from "../_lib/types";

interface AddFromResultsProps {
  jobs: BookmarkableJob[];
  // ISO timestamp of the run these jobs came from, or null if the user has no
  // run yet. Drives the "From your run on …" header inside the picker.
  runStartedAt: string | null;
  // How many valid results the run produced before the already-tracked diff —
  // lets the header read "8 of 12" so an all-tracked run still makes sense.
  totalInRun: number;
}

export function AddFromResults({ jobs, runStartedAt, totalInRun }: AddFromResultsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-500)] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--accent-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Plus className="h-3.5 w-3.5" />
        Add from results
      </button>
      {open && (
        <Picker
          jobs={jobs}
          runStartedAt={runStartedAt}
          totalInRun={totalInRun}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** "From your run on Fri, Jun 13, 8:14 PM" — or a fallback when no run yet. */
function formatRunLabel(iso: string | null): string {
  if (!iso) return "No run yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Latest run";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Picker({
  jobs,
  runStartedAt,
  totalInRun,
  onClose,
}: AddFromResultsProps & { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [addingId, setAddingId] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());

  const q = query.trim().toLowerCase();
  const filtered = q
    ? jobs.filter(
        (j) =>
          (j.title ?? "").toLowerCase().includes(q) ||
          (j.company ?? "").toLowerCase().includes(q),
      )
    : jobs;

  function add(id: number) {
    setAddingId(id);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("job_result_id", String(id));
      const res = await addBookmarkAction(fd);
      if (res.ok) {
        setAdded((prev) => new Set(prev).add(id));
        router.refresh();
      }
      setAddingId(null);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add a job from your results"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border-muted)] bg-[var(--bg-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-medium text-[var(--text-primary)]">
              Add a job to your tracker
            </h3>
            <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-tertiary)]">
              {runStartedAt
                ? `From your run on ${formatRunLabel(runStartedAt)} · ${jobs.length} of ${totalInRun} to add`
                : "Your first run hasn't produced results yet."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-2 shrink-0 rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[var(--border-subtle)] px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-md border border-[var(--border-muted)] bg-[var(--bg-overlay)] px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title or company…"
              autoFocus
              className="w-full bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12.5px] text-[var(--text-tertiary)]">
              {jobs.length > 0
                ? "Nothing matches that filter."
                : !runStartedAt
                  ? "No results to add yet — they appear here once a run scores some jobs."
                  : totalInRun > 0
                    ? "Every job from your latest run is already in your tracker."
                    : "Your latest run didn't surface any jobs to add."}
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((job) => {
                const isAdded = added.has(job.id);
                return (
                  <li
                    key={job.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--bg-overlay)]/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] text-[var(--text-primary)]">
                        {job.title ?? "Untitled role"}
                      </div>
                      <div className="truncate text-[11px] text-[var(--text-tertiary)]">
                        {job.company ?? "Unknown company"}
                        {job.match_percentage != null && ` · ${job.match_percentage}%`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => add(job.id)}
                      disabled={isAdded || (isPending && addingId === job.id)}
                      className="shrink-0 rounded-md bg-[var(--bg-overlay)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)] transition-colors hover:text-[var(--text-primary)] hover:ring-[var(--border-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                    >
                      {isAdded ? "Added" : addingId === job.id ? "Adding…" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
