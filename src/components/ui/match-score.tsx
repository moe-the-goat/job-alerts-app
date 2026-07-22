"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export interface MatchScoreProps {
  /** 0–100 from job_results.match_percentage; null when not AI-scored. */
  score: number | null;
  /** Sub-scores for the tooltip breakdown; null entries are omitted. */
  tech?: number | null;
  experience?: number | null;
  logistics?: number | null;
  className?: string;
}

/**
 * Daybreak score language: a strong match (>=80) is the app's one recurring
 * "strong match" signal — a solid amber chip (amber-tint fill, amber ink, amber
 * edge). Everything else is a calm neutral chip. Amber-for-strong is the brand's
 * positive signal — distinct from the semantic "warning" amber used for cautions.
 */
function scoreColor(score: number): string {
  if (score >= 80) return "var(--highlight-500)";
  if (score >= 60) return "var(--accent-400)";
  return "var(--danger-400)";
}

/** Chip skin by score band — amber for strong, neutral otherwise. */
function chipClasses(score: number): string {
  if (score >= 80)
    return "bg-[color-mix(in_srgb,var(--highlight-400)_12%,transparent)] text-[var(--highlight-600)] border-[color-mix(in_srgb,var(--highlight-400)_42%,transparent)]";
  if (score >= 60)
    return "bg-[var(--surface-recessed)] text-[var(--text-secondary)] border-[var(--border-subtle)]";
  return "bg-[var(--surface-recessed)] text-[var(--text-tertiary)] border-[var(--border-subtle)]";
}

/**
 * match_percentage as a glanceable chip instead of a raw integer: a mono numeral
 * in a rounded chip, amber when strong. Hover/focus reveals the tech /
 * experience / logistics breakdown.
 */
export function MatchScore({
  score,
  tech,
  experience,
  logistics,
  className,
}: MatchScoreProps) {
  if (score === null) {
    return (
      <span
        className={cn(
          "font-mono text-[12px] text-[var(--text-disabled)]",
          className,
        )}
        aria-label="Not scored"
      >
        —
      </span>
    );
  }

  const clamped = Math.max(0, Math.min(100, score));

  const breakdown = [
    { label: "Tech", value: tech },
    { label: "Experience", value: experience },
    { label: "Logistics", value: logistics },
  ].filter((row): row is { label: string; value: number } => row.value != null);

  const chip = (
    <span
      tabIndex={0}
      role="img"
      aria-label={`Match ${clamped}%`}
      className={cn(
        "inline-flex min-w-[2.25rem] items-center justify-center rounded-md border px-2 py-[3px]",
        "font-mono text-[12px] font-medium tabular-nums outline-none",
        "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        chipClasses(clamped),
        className,
      )}
    >
      {clamped}
    </span>
  );

  if (breakdown.length === 0) return chip;

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1 py-0.5">
          {breakdown.map(({ label, value }) => (
            <span key={label} className="flex items-center gap-2">
              <span className="w-[72px] text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                {label}
              </span>
              <span
                className="inline-block h-[4px] w-14 overflow-hidden rounded-full bg-[var(--bg-overlay)]"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, value))}%`,
                    background: scoreColor(value),
                  }}
                />
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-[var(--text-secondary)]">
                {value}
              </span>
            </span>
          ))}
        </span>
      }
    >
      {chip}
    </Tooltip>
  );
}
