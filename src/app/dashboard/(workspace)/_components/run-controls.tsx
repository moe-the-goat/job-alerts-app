"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Loader2, Play, X } from "lucide-react";
import {
  triggerManualRunAction,
  rescheduleRunAction,
  getScheduleSlotCountsAction,
} from "@/app/actions/run";
import {
  congestionLevel,
  estimatedDelayMinutes,
  formatHour,
  suggestClearHour,
} from "@/app/dashboard/_lib/schedule-congestion";

// Rough wall-clock for one full run, shown to the user so "Run now" sets
// honest expectations. Matches observed multi-user runs (~38 min).
const APPROX_RUN_MINUTES = "35–40";

interface RunControlsProps {
  runsUsedToday: number;
  maxRunsPerDay: number;
  // The latest run's status — used to disable "Run now" while one is in flight.
  lastRunStatus: string | null;
  nextRunAt: string | null;
  // A dispatch (user's or admin-forced) whose runs row hasn't landed yet —
  // treated like an in-flight run so the button can't fire a duplicate.
  pendingDispatchAt?: string | null;
}

export function RunControls({
  runsUsedToday,
  maxRunsPerDay,
  lastRunStatus,
  nextRunAt,
  pendingDispatchAt,
}: RunControlsProps) {
  const remaining = Math.max(0, maxRunsPerDay - runsUsedToday);
  const starting = Boolean(pendingDispatchAt);
  const inFlight = lastRunStatus === "running" || starting;
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
          starting
            ? "A run is starting — it appears at the top in a few minutes."
            : inFlight
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
          {starting ? "starting" : inFlight ? "running" : `${remaining}/${maxRunsPerDay} left`}
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

// Congestion hint under the reschedule time picker: how many users already run
// at the chosen hour, an honest delay caveat when it's busy, and a nudge to the
// nearest clearer hour (advice, never an automatic move).
function SlotHint({
  counts,
  hour,
  onPick,
}: {
  counts: Record<number, number> | null;
  hour: number | null;
  onPick: (hour: number) => void;
}) {
  if (!counts || hour === null || !Number.isInteger(hour)) return null;
  const count = counts[hour] ?? 0;
  const level = congestionLevel(count);

  if (level === "busy") {
    const mins = estimatedDelayMinutes(count);
    const suggestion = suggestClearHour(counts, hour);
    return (
      <div className="flex items-start gap-1.5 rounded-lg border border-[var(--warning-400)]/30 bg-[var(--warning-400)]/10 px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning-400)]" />
        <span>
          <span className="font-medium text-[var(--text-primary)]">
            {count} users
          </span>{" "}
          already run around {formatHour(hour)} — your email may arrive up to ~
          {mins} min later.
          {suggestion !== null && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => onPick(suggestion)}
                className="rounded-sm font-medium text-[var(--accent-400)] underline underline-offset-2 outline-none hover:text-[var(--accent-300)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                Try {formatHour(suggestion)} — clearer
              </button>
            </>
          )}
        </span>
      </div>
    );
  }

  const label =
    level === "some"
      ? `${count} other ${count === 1 ? "user runs" : "users run"} around ${formatHour(hour)}.`
      : `${formatHour(hour)} is clear — no queue.`;
  return <p className="text-[11.5px] text-[var(--text-tertiary)]">{label}</p>;
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
  // Per-hour scheduled-user counts for the congestion hint (loaded on open).
  const [slotCounts, setSlotCounts] = useState<Record<number, number> | null>(null);

  useEffect(() => {
    let alive = true;
    getScheduleSlotCountsAction().then((res) => {
      if (alive) setSlotCounts(res.counts ?? {});
    });
    return () => {
      alive = false;
    };
  }, []);

  // The selected local hour (users are Palestine-based, so local == the
  // Jerusalem slot the counts are keyed by). null until a time is picked.
  const selectedHour =
    value.length >= 13 ? Number.parseInt(value.slice(11, 13), 10) : NaN;
  const hasHour = Number.isInteger(selectedHour);

  function moveToHour(hour: number) {
    // Keep the chosen date, snap to the top of the suggested hour.
    setValue(`${value.slice(0, 11)}${String(hour).padStart(2, "0")}:00`);
  }

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

        <SlotHint
          counts={slotCounts}
          hour={hasHour ? selectedHour : null}
          onPick={moveToHour}
        />

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
