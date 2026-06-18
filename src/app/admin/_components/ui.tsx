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

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/** A segmented control (the same look as the LLM range toggle), generalized so
 *  every "over time" view shares one control. */
export function SegTabs<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 rounded-md border border-[var(--border-muted)] p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded px-2.5 py-1 text-[11.5px] transition-colors ${
            value === o.key
              ? "bg-[var(--accent-500)] text-white"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One stacked daily bar's worth of segments, bottom-up. */
export interface BarSegment {
  value: number;
  color: string; // a CSS var() string
}

/**
 * A dependency-free stacked-bar time series (SVG). Each entry is a day; each day
 * stacks its segments. Bars share a common max so heights are comparable across
 * days. Hovering a bar shows its native <title> tooltip.
 */
export function Sparkbars({
  data,
  height = 56,
  ariaLabel,
}: {
  data: { label: string; segments: BarSegment[]; title: string }[];
  height?: number;
  ariaLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.segments.reduce((s, g) => s + g.value, 0)));
  const n = Math.max(1, data.length);
  const gap = 0.18; // fraction of a slot used as the gap between bars
  const slot = 100 / n;
  const barW = slot * (1 - gap);

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      {data.map((d, i) => {
        const x = i * slot + (slot - barW) / 2;
        let yCursor = height;
        const total = d.segments.reduce((s, g) => s + g.value, 0);
        return (
          <g key={i}>
            <title>{d.title}</title>
            {/* baseline track so empty days still read as "a day" */}
            {total === 0 && (
              <rect x={x} y={height - 1} width={barW} height={1} fill="var(--border-muted)" />
            )}
            {d.segments.map((seg, j) => {
              if (seg.value <= 0) return null;
              const h = (seg.value / max) * (height - 2);
              yCursor -= h;
              return <rect key={j} x={x} y={yCursor} width={barW} height={h} fill={seg.color} rx={0.4} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** A horizontal proportional bar — used for the funnel stages. `value` is shown
 *  as a share of `max` (the funnel's first/biggest stage). */
export function FunnelRow({
  label,
  value,
  max,
  color = "var(--accent-500)",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(1.5, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[11.5px] text-[var(--text-tertiary)]">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--bg-overlay)]">
        <div
          className="flex h-full items-center justify-end rounded pr-2"
          style={{ width: `${pct}%`, background: color }}
        >
          <span className="text-[10.5px] font-medium tabular-nums text-white/90">
            {fmtNum(value)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** A small color-swatch legend row for the stacked charts. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
          <span className="h-2 w-2 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
