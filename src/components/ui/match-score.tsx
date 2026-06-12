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

const SEGMENTS = 5;

/** Heatmap: green = strong, yellow = middling, red = weak. */
function scoreColor(score: number): string {
  if (score >= 80) return "var(--success-400)";
  if (score >= 60) return "var(--warning-400)";
  return "var(--danger-400)";
}

/**
 * match_percentage as a glanceable visual instead of a raw integer:
 * a mono numeral plus a 5-segment gauge tinted by heat. Hover/focus
 * reveals the tech / experience / logistics breakdown.
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
  const filled = Math.round((clamped / 100) * SEGMENTS);
  const color = scoreColor(clamped);

  const breakdown = [
    { label: "Tech", value: tech },
    { label: "Experience", value: experience },
    { label: "Logistics", value: logistics },
  ].filter((row): row is { label: string; value: number } => row.value != null);

  const gauge = (
    <span
      tabIndex={0}
      role="img"
      aria-label={`Match ${clamped}%`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
    >
      <span
        className="w-7 text-right font-mono text-[12px] tabular-nums"
        style={{ color }}
      >
        {clamped}
      </span>
      <span className="inline-flex items-center gap-[2px]" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            data-filled={i < filled}
            className="h-[10px] w-[3px] rounded-full transition-colors duration-150"
            style={{
              background:
                i < filled ? color : "rgba(205, 217, 229, 0.11)",
            }}
          />
        ))}
      </span>
    </span>
  );

  if (breakdown.length === 0) return gauge;

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
                className="inline-block h-[4px] w-14 overflow-hidden rounded-full bg-[rgba(205,217,229,0.09)]"
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
      {gauge}
    </Tooltip>
  );
}
