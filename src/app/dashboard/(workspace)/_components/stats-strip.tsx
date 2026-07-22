import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import type { LastRun } from "../../_lib/dashboard-state";
import { CountUp } from "@/components/ui/count-up";
import { AutoRefresh, ElapsedSince } from "./run-status-live";

/** A 3px amber sweep shown under the cluster while a run is in flight. */
function RunBar() {
  return (
    <div className="run-bar-track mt-3" aria-hidden>
      <div className="run-bar-fill" />
    </div>
  );
}

interface StatsStripProps {
  lastRun: LastRun | null;
  nextRunAt?: string | null;
  // A dispatch whose runs row hasn't landed yet (~10-15 min warm-up) — shown
  // as a "starting" state so a Run-now click is visibly acknowledged.
  pendingDispatchAt?: string | null;
}

export function StatsStrip({ lastRun, nextRunAt, pendingDispatchAt }: StatsStripProps) {
  // A freshly dispatched run outranks whatever the previous run says: the user
  // just started something and needs to see it happening.
  if (pendingDispatchAt) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-5 py-4">
        <AutoRefresh />
        <div className="flex items-center gap-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent-500)]/10 ring-1 ring-inset ring-[var(--accent-500)]/30">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-400)]" />
          </span>
          <div>
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              Run starting…
            </div>
            <div className="text-[11.5px] text-[var(--text-tertiary)]">
              requested <ElapsedSince iso={pendingDispatchAt} /> ago · warming up —
              live progress appears here once scraping starts · ~35–40 min total
            </div>
          </div>
        </div>
        <RunBar />
      </div>
    );
  }

  if (!lastRun) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-5 py-4">
        <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
          <span>
            <span className="text-[var(--text-primary)]">Waiting for the first run.</span>{" "}
            The morning email kicks off on the next cron tick.
          </span>
        </div>
      </div>
    );
  }

  const status = lastRun.status;
  const statusMeta = STATUS_META[status];

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-5 py-4">
      {status === "running" && <AutoRefresh />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className={[
              "inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset",
              statusMeta.bg,
              statusMeta.ring,
            ].join(" ")}
          >
            <statusMeta.icon className={`h-3.5 w-3.5 ${statusMeta.color}`} />
          </span>
          <div>
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              {status === "running" ? "Run in progress" : `Last run · ${statusMeta.label}`}
            </div>
            <div className="text-[11.5px] text-[var(--text-tertiary)]">
              {status === "running" ? (
                <>
                  running for <ElapsedSince iso={lastRun.started_at} /> · ~35–40 min
                  total
                </>
              ) : (
                <>
                  {formatRelative(lastRun.started_at)}
                  {lastRun.ended_at && (
                    <>
                      {" "}
                      · finished {formatFinished(lastRun.ended_at)} · took{" "}
                      {formatDuration(lastRun.started_at, lastRun.ended_at)}
                    </>
                  )}
                  {nextRunAt && <> · next {formatNext(nextRunAt)}</>}
                </>
              )}
            </div>
          </div>
        </div>

        {status === "success" && (
          <dl className="flex flex-wrap items-stretch overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[11px]">
            <Metric label="Scraped" value={lastRun.scraped} />
            <Metric label="Filtered" value={lastRun.filtered} />
            <Metric label="Evaluated" value={lastRun.ai_evaluated} />
            <Metric label="Approved" value={lastRun.approved} accent />
            <Metric label="Lower ranked" value={lastRun.lower_ranked} />
          </dl>
        )}

        {status === "failed" && lastRun.scraped > 0 && (
          <dl className="flex items-stretch overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[11px]">
            <Metric label="Scraped before failure" value={lastRun.scraped} />
          </dl>
        )}
      </div>
      {status === "running" && <RunBar />}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "min-w-[92px] flex-1 border-l border-[var(--border-subtle)] px-3.5 py-2 first:border-l-0",
        // The picks the run delivered get a faint amber wash — the same
        // "product delivered" note used on the scores and the landing.
        accent
          ? "bg-[color-mix(in_srgb,var(--highlight-400)_6%,transparent)]"
          : "",
      ].join(" ")}
    >
      <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd
        className={[
          "mt-0.5 font-mono text-[14px] font-medium tabular-nums",
          accent ? "text-[var(--highlight-500)]" : "text-[var(--text-primary)]",
        ].join(" ")}
      >
        <CountUp value={value} />
      </dd>
    </div>
  );
}

const STATUS_META = {
  success: {
    label: "Success",
    icon: CheckCircle2,
    color: "text-[var(--success-400)]",
    bg: "bg-[var(--success-400)]/10",
    ring: "ring-[var(--success-400)]/30",
  },
  running: {
    label: "Running",
    icon: Loader2,
    color: "text-[var(--accent-400)] animate-spin",
    bg: "bg-[var(--accent-500)]/10",
    ring: "ring-[var(--accent-500)]/30",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    color: "text-[var(--danger-400)]",
    bg: "bg-[var(--danger-400)]/10",
    ring: "ring-[var(--danger-400)]/30",
  },
  skipped: {
    label: "Skipped",
    icon: Clock,
    color: "text-[var(--text-tertiary)]",
    bg: "bg-[var(--bg-overlay)]",
    ring: "ring-[var(--border-muted)]",
  },
} as const;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatNext(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (d.getTime() <= Date.now()) return "on the next cron tick";
  // Pin to Asia/Jerusalem: this renders on the server (UTC on Vercel), and an
  // unpinned toLocaleString showed the UTC hour — a run scheduled for 9 PM
  // local read "6:00 PM" here while the reschedule dialog said 9. Users are
  // Palestine-based, like every other day-boundary in the app.
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Absolute finish time, pinned to Asia/Jerusalem (this renders on the server,
// which runs UTC — the users are Palestine-based, like the rest of the app's
// day-boundary logic). Adds the weekday once it's no longer "today".
function formatFinished(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameDay =
    d.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" }) ===
    new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" });
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Jerusalem",
    ...(sameDay ? {} : { weekday: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return "<1s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec === 0 ? `${min}m` : `${min}m ${remSec}s`;
}
