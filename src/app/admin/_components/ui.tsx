import * as React from "react";

/**
 * Shared presentation primitives for the admin Analytics tab. Kept in one place
 * so every section (Health, Activity, Users, LLM) speaks the same visual
 * language — same cards, stats, pills, spacing — and the page stays consistent
 * as it grows.
 */

export type Tone = "danger" | "success" | "warning" | undefined;

const TONE_TEXT: Record<NonNullable<Tone>, string> = {
  danger: "text-[var(--danger-400)]",
  success: "text-[var(--success-400)]",
  warning: "text-[var(--warning-400)]",
};

/** A single big-number metric tile. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
}) {
  const color = tone ? TONE_TEXT[tone] : "text-[var(--text-primary)]";
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-4 py-3">
      <div className={`text-[22px] font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </div>
    </div>
  );
}

/** A titled sub-section within a group. */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[12px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A top-level group divider (Health / Activity / Users). Bigger and quieter
 *  than a Card title, with a hairline rule, so the page reads in clear bands. */
export function GroupHeader({ title }: { title: string }) {
  return (
    <div className="mt-12 flex items-center gap-3 first:mt-2">
      <h2 className="text-[13px] font-semibold tracking-tight text-[var(--text-secondary)]">
        {title}
      </h2>
      <div className="h-px flex-1 bg-[var(--border-muted)]/60" />
    </div>
  );
}

/** A rounded count pill (reused for feedback by-type and error groups). */
export function Pill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone?: Tone;
}) {
  const accent = tone ? TONE_TEXT[tone] : "text-[var(--text-secondary)]";
  return (
    <span className="rounded-full border border-[var(--border-muted)] bg-[var(--bg-overlay)] px-3 py-1 text-[11.5px] text-[var(--text-secondary)]">
      <span className={accent}>{label}</span> ·{" "}
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Compact, human relative time ("3h ago", "2d ago"). For freshness cues where
 *  an exact timestamp is noise. */
export function fmtAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const past = ms >= 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const out =
    mins < 60
      ? `${mins}m`
      : mins < 1440
        ? `${Math.round(mins / 60)}h`
        : `${Math.round(mins / 1440)}d`;
  return past ? `${out} ago` : `in ${out}`;
}
