import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import type { LastRun } from "../../_lib/dashboard-state";

interface StatsStripProps {
  lastRun: LastRun | null;
}

export function StatsStrip({ lastRun }: StatsStripProps) {
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
              Last run · {statusMeta.label}
            </div>
            <div className="text-[11.5px] text-[var(--text-tertiary)]">
              {formatRelative(lastRun.started_at)}
              {lastRun.ended_at && (
                <> · took {formatDuration(lastRun.started_at, lastRun.ended_at)}</>
              )}
            </div>
          </div>
        </div>

        {status === "success" && (
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11px] sm:grid-cols-4">
            <Metric label="Scraped" value={lastRun.scraped} />
            <Metric label="Filtered" value={lastRun.filtered} />
            <Metric label="Evaluated" value={lastRun.ai_evaluated} />
            <Metric label="Approved" value={lastRun.approved} accent />
          </dl>
        )}

        {status === "failed" && lastRun.scraped > 0 && (
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11px]">
            <Metric label="Scraped before failure" value={lastRun.scraped} />
          </dl>
        )}
      </div>
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
    <div>
      <dt className="text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </dt>
      <dd
        className={[
          "mt-0.5 font-mono text-[14px] font-medium",
          accent ? "text-[var(--accent-400)]" : "text-[var(--text-primary)]",
        ].join(" ")}
      >
        {value.toLocaleString()}
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

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return "<1s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec === 0 ? `${min}m` : `${min}m ${remSec}s`;
}
