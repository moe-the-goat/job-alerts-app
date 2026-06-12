"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Play, X } from "lucide-react";
import { triggerManualRunAction, rescheduleRunAction } from "@/app/actions/run";

// Rough wall-clock for one full run, shown to the user so "Run now" sets
// honest expectations. Matches observed multi-user runs (~38 min).
const APPROX_RUN_MINUTES = "35–40";

interface RunControlsProps {
  runsUsedToday: number;
  maxRunsPerDay: number;
  // The latest run's status — used to disable "Run now" while one is in flight.
  lastRunStatus: string | null;
  nextRunAt: string | null;
}

export function RunControls({
  runsUsedToday,
  maxRunsPerDay,
  lastRunStatus,
  nextRunAt,
}: RunControlsProps) {
  const remaining = Math.max(0, maxRunsPerDay - runsUsedToday);
  const inFlight = lastRunStatus === "running";
  const noneLeft = remaining <= 0;

  const [runOpen, setRunOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setRunOpen(true)}
        disabled={inFlight || noneLeft}
        title={
          inFlight
            ? "A run is already in progress."
            : noneLeft
              ? "You've used today's runs. Resets at midnight."
              : "Trigger a fresh run now"
        }
        className="flex w-full items-center gap-2 rounded-md border border-[var(--border-muted)] bg-[var(--bg-overlay)]/40 px-2 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--bg-overlay)]/40"
      >
        {inFlight ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-400)]" />
        ) : (
          <Play className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        )}
        Run now
        <span
          className={`ml-auto inline-flex items-center rounded-sm px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider ${
            noneLeft
              ? "bg-[var(--bg-base)] text-[var(--text-tertiary)]"
              : "bg-[var(--bg-base)] text-[var(--accent-400)]"
          }`}
        >
          {inFlight ? "running" : `${remaining}/${maxRunsPerDay} left`}
        </span>
      </button>

      <button
        type="button"
        onClick={() => setRescheduleOpen(true)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <CalendarClock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        Reschedule run
      </button>

      {runOpen && (
        <RunNowDialog
          remaining={remaining}
          maxRunsPerDay={maxRunsPerDay}
          onClose={() => setRunOpen(false)}
        />
      )}
      {rescheduleOpen && (
        <RescheduleDialog
          nextRunAt={nextRunAt}
          onClose={() => setRescheduleOpen(false)}
        />
      )}
    </>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border-muted)] bg-[var(--bg-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <h3 className="text-[14px] font-medium text-[var(--text-primary)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RunNowDialog({
  remaining,
  maxRunsPerDay,
  onClose,
}: {
  remaining: number;
  maxRunsPerDay: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await triggerManualRunAction();
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Modal title="Run now" onClose={onClose}>
      <div className="space-y-4 px-4 py-4">
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          This scrapes fresh jobs and scores them against your CV right now,
          then emails you the matches. It takes about{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {APPROX_RUN_MINUTES} minutes
          </span>{" "}
          to finish.
        </p>

        <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-overlay)]/40 px-3 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-tertiary)]">Runs left today</span>
            <span className="font-medium text-[var(--text-primary)]">
              {remaining} of {maxRunsPerDay}
            </span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">
            You get {maxRunsPerDay} runs per day. Running now uses one and{" "}
            <span className="text-[var(--text-secondary)]">
              cancels today&rsquo;s scheduled run
            </span>{" "}
            if it hasn&rsquo;t happened yet. The budget resets at midnight.
          </p>
        </div>

        {error && (
          <p className="rounded-md border border-[var(--border-muted)] px-3 py-2 text-[12.5px] text-[var(--danger-400)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-500)] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--accent-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run now
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Format an ISO instant into the value a datetime-local input expects
// (YYYY-MM-DDTHH:mm in LOCAL time). Returns "" when there's nothing to seed.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function RescheduleDialog({
  nextRunAt,
  onClose,
}: {
  nextRunAt: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(() => toLocalInputValue(nextRunAt));

  function save() {
    setError(null);
    if (!value) {
      setError("Pick a date and time.");
      return;
    }
    // The input is local time; convert to an ISO instant for the action.
    const iso = new Date(value).toISOString();
    startTransition(async () => {
      const fd = new FormData();
      fd.set("next_run_at", iso);
      const res = await rescheduleRunAction(fd);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Modal title="Reschedule next run" onClose={onClose}>
      <div className="space-y-4 px-4 py-4">
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Choose when your next scheduled run should happen. This doesn&rsquo;t
          use one of your manual runs — it just moves the automatic one.
        </p>

        <label className="block">
          <span className="mb-1.5 block text-[11.5px] uppercase tracking-wider text-[var(--text-tertiary)]">
            Next run
          </span>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-[var(--border-muted)] bg-[var(--bg-overlay)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] [color-scheme:dark]"
          />
        </label>

        {error && (
          <p className="rounded-md border border-[var(--border-muted)] px-3 py-2 text-[12.5px] text-[var(--danger-400)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-500)] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--accent-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save time"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
