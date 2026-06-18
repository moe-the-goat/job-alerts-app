"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PackageOpen,
  XCircle,
} from "lucide-react";
import type { HealthStats } from "../_lib/analytics";
import { resetStalledRunAction } from "../actions";
import { Card, Pill, fmtAgo, fmtTime } from "./ui";

/**
 * Operational-health panel — the first thing the admin sees. A single status
 * banner summarizes the system at a glance (green = all clear, amber = issues),
 * then each problem type expands into a detail block ONLY when it has rows. A
 * healthy system therefore shows a calm one-line "all clear", not a wall of red.
 */
export function HealthPanel({ data }: { data: HealthStats }) {
  const issues =
    data.stalled.length +
    data.errorGroups.reduce((n, g) => n + g.count, 0) +
    data.zeroResultUsers.length +
    data.overdueUsers.length;

  return (
    <div className="space-y-4">
      <StatusBanner data={data} issues={issues} />

      {data.stalled.length > 0 && <StalledBlock rows={data.stalled} />}
      {data.errorGroups.length > 0 && <ErrorsBlock groups={data.errorGroups} />}
      {data.zeroResultUsers.length > 0 && <ZeroResultBlock rows={data.zeroResultUsers} />}
      {data.overdueUsers.length > 0 && <OverdueBlock rows={data.overdueUsers} />}
    </div>
  );
}

/** One-line system summary. Counts each problem class; green when all zero. */
function StatusBanner({ data, issues }: { data: HealthStats; issues: number }) {
  if (issues === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--success-400)]/30 bg-[var(--success-400)]/[0.06] px-4 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-400)]" />
        <span className="text-[13px] text-[var(--text-secondary)]">
          All clear — no stalled runs, errors, empty deliveries, or overdue users.
        </span>
      </div>
    );
  }

  const chips: { label: string; n: number }[] = [
    { label: "stalled", n: data.stalled.length },
    { label: "failing", n: data.errorGroups.reduce((s, g) => s + g.count, 0) },
    { label: "no results", n: data.zeroResultUsers.length },
    { label: "overdue", n: data.overdueUsers.length },
  ].filter((c) => c.n > 0);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--warning-400)]/30 bg-[var(--warning-400)]/[0.06] px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warning-400)]" />
      <span className="text-[13px] font-medium text-[var(--text-primary)]">
        {issues} {issues === 1 ? "issue" : "issues"} need attention
      </span>
      <span className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.label}
            className="rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
          >
            <span className="tabular-nums font-medium text-[var(--text-primary)]">{c.n}</span>{" "}
            {c.label}
          </span>
        ))}
      </span>
    </div>
  );
}

function BlockHead({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {icon}
      <span className="text-[12px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        {title}
      </span>
      {hint && <span className="text-[11px] text-[var(--text-tertiary)]/70">· {hint}</span>}
    </div>
  );
}

const rowCls =
  "flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border-muted)]/50 bg-[var(--bg-elevated)]/30 px-3 py-2 text-[12.5px]";

function StalledBlock({ rows }: { rows: HealthStats["stalled"] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function clear(runId: number) {
    setError(null);
    setPending(runId);
    const fd = new FormData();
    fd.set("run_id", String(runId));
    void resetStalledRunAction(fd)
      .then((res) => {
        if (res.ok) router.refresh();
        else setError(res.error ?? "Couldn't clear the run.");
      })
      .finally(() => setPending(null));
  }

  return (
    <div>
      <BlockHead
        icon={<Loader2 className="h-3.5 w-3.5 text-[var(--warning-400)]" />}
        title="Stalled runs"
        hint="running 90+ min — worker likely died mid-run"
      />
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.runId} className={rowCls}>
            <span className="min-w-0 truncate text-[var(--text-secondary)]">
              {r.email}
              <span className="ml-2 text-[var(--text-tertiary)]">
                started {fmtTime(r.startedAt)} · {fmtAgo(r.startedAt)}
              </span>
            </span>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => clear(r.runId)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-muted)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            >
              {pending === r.runId ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              Clear
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-1.5 text-[11px] text-[var(--danger-400)]">{error}</p>}
    </div>
  );
}

function ErrorsBlock({ groups }: { groups: HealthStats["errorGroups"] }) {
  return (
    <div>
      <BlockHead
        icon={<XCircle className="h-3.5 w-3.5 text-[var(--danger-400)]" />}
        title="Failures by cause"
        hint="grouped from failed runs"
      />
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <span key={g.signature} title={g.sample}>
            <Pill label={g.signature} count={g.count} tone="danger" />
          </span>
        ))}
      </div>
    </div>
  );
}

function ZeroResultBlock({ rows }: { rows: HealthStats["zeroResultUsers"] }) {
  return (
    <div>
      <BlockHead
        icon={<PackageOpen className="h-3.5 w-3.5 text-[var(--warning-400)]" />}
        title="Delivered nothing"
        hint="last run succeeded but approved 0 jobs"
      />
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.userId} className={rowCls}>
            <span className="min-w-0 truncate text-[var(--text-secondary)]">{r.email}</span>
            <span className="text-[var(--text-tertiary)]">
              {fmtTime(r.startedAt)} · {fmtAgo(r.startedAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverdueBlock({ rows }: { rows: HealthStats["overdueUsers"] }) {
  return (
    <div>
      <BlockHead
        icon={<Clock className="h-3.5 w-3.5 text-[var(--warning-400)]" />}
        title="Overdue for a run"
        hint="active users past their schedule, or never run"
      />
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.userId} className={rowCls}>
            <span className="min-w-0 truncate text-[var(--text-secondary)]">{r.email}</span>
            <span className="text-[var(--text-tertiary)]">
              {r.reason === "never" ? (
                <span className="text-[var(--danger-400)]/90">never run</span>
              ) : (
                <>due {fmtAgo(r.since)}</>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
