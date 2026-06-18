"use client";

import * as React from "react";
import type { TrendStats } from "../_lib/analytics";
import { Card, FunnelRow, Legend, SegTabs, Sparkbars, Stat, fmtNum } from "./ui";

/**
 * Trends — "how the system is going over time". One shared range selector
 * (7 / 14 / 30 days) slices every daily series at once, so the whole section
 * moves together. Charts are dependency-free SVG (see ui.tsx) and reuse the
 * same palette as the rest of the tab.
 */

type Range = 7 | 14 | 30;

const COLORS = {
  success: "var(--success-400)",
  failed: "var(--danger-400)",
  accent: "var(--accent-500)",
  accentDim: "var(--accent-300)",
  applied: "var(--success-400)",
  notRelevant: "var(--warning-400)",
  blocked: "var(--danger-400)",
  other: "var(--text-tertiary)",
};

function dayLabel(iso: string): string {
  // "06-18" → "Jun 18"-ish short label for tooltips.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Trends({ data }: { data: TrendStats }) {
  const [range, setRange] = React.useState<Range>(14);

  // Slice the tail of each dense series to the chosen window.
  const tail = <T,>(arr: T[]): T[] => arr.slice(-range);
  const runs = tail(data.runs);
  const signups = tail(data.signups);
  const feedback = tail(data.feedback);

  const runTotals = runs.reduce(
    (a, d) => {
      a.total += d.total;
      a.success += d.success;
      a.failed += d.failed;
      return a;
    },
    { total: 0, success: 0, failed: 0 },
  );
  const successRate =
    runTotals.total > 0 ? Math.round((runTotals.success / runTotals.total) * 100) : null;
  const signupTotals = signups.reduce(
    (a, d) => {
      a.requests += d.requests;
      a.approved += d.approved;
      return a;
    },
    { requests: 0, approved: 0 },
  );
  const feedbackTotal = feedback.reduce(
    (n, d) => n + d.applied + d.notRelevant + d.blocked + d.other,
    0,
  );

  const funnel = data.funnel;
  const funnelMax = Math.max(1, funnel.scraped);
  const mix = data.runMix;
  const mixTotal = mix.scheduled + mix.manual;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-[12px] text-[var(--text-tertiary)]">
          Last {range} days. Funnel &amp; run mix span the full {data.days.length}-day window.
        </p>
        <SegTabs
          value={range}
          onChange={setRange}
          options={[
            { key: 7, label: "7d" },
            { key: 14, label: "14d" },
            { key: 30, label: "30d" },
          ]}
        />
      </div>

      {/* Runs over time */}
      <Card title="Runs over time">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Runs" value={runTotals.total} />
          <Stat label="Succeeded" value={runTotals.success} tone="success" />
          <Stat label="Failed" value={runTotals.failed} tone={runTotals.failed > 0 ? "danger" : undefined} />
          <Stat label="Success rate" value={successRate === null ? "—" : `${successRate}%`} />
        </div>
        <div className="mt-3">
          <Sparkbars
            ariaLabel="Runs per day, success and failed stacked"
            data={runs.map((d) => ({
              label: d.day,
              title: `${dayLabel(d.day)} · ${d.success} ok, ${d.failed} failed`,
              segments: [
                { value: d.success, color: COLORS.success },
                { value: d.failed, color: COLORS.failed },
              ],
            }))}
          />
          <div className="mt-2">
            <Legend
              items={[
                { label: "Succeeded", color: COLORS.success },
                { label: "Failed", color: COLORS.failed },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Pipeline funnel */}
      <Card title="Pipeline funnel">
        <p className="-mt-1 mb-3 text-[11.5px] text-[var(--text-tertiary)]">
          Where jobs drop off across the {data.days.length}-day window — scraped → shown.
        </p>
        <div className="space-y-2">
          <FunnelRow label="Scraped" value={funnel.scraped} max={funnelMax} color={COLORS.accent} />
          <FunnelRow label="After filters" value={funnel.filtered} max={funnelMax} color={COLORS.accent} />
          <FunnelRow label="AI evaluated" value={funnel.aiEvaluated} max={funnelMax} color={COLORS.accentDim} />
          <FunnelRow label="Approved" value={funnel.approved} max={funnelMax} color={COLORS.success} />
          <FunnelRow label="Lower-ranked" value={funnel.lowerRanked} max={funnelMax} color={COLORS.other} />
        </div>
      </Card>

      {/* Signups + feedback side by side on wide screens */}
      <Card title="Signups & feedback">
        <div className="grid gap-6 @[640px]:grid-cols-2">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                Access requests
              </span>
              <span className="text-[11.5px] text-[var(--text-tertiary)]">
                {signupTotals.requests} req · {signupTotals.approved} approved
              </span>
            </div>
            <Sparkbars
              ariaLabel="Access requests per day, approved stacked"
              data={signups.map((d) => ({
                label: d.day,
                title: `${dayLabel(d.day)} · ${d.requests} requests, ${d.approved} approved`,
                segments: [
                  { value: d.approved, color: COLORS.success },
                  { value: Math.max(0, d.requests - d.approved), color: COLORS.accentDim },
                ],
              }))}
            />
            <div className="mt-2">
              <Legend
                items={[
                  { label: "Approved", color: COLORS.success },
                  { label: "Pending/other", color: COLORS.accentDim },
                ]}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                Feedback reactions
              </span>
              <span className="text-[11.5px] text-[var(--text-tertiary)]">{feedbackTotal} total</span>
            </div>
            <Sparkbars
              ariaLabel="Feedback reactions per day by type"
              data={feedback.map((d) => ({
                label: d.day,
                title: `${dayLabel(d.day)} · ${d.applied} applied, ${d.notRelevant} not-relevant, ${d.blocked} blocked`,
                segments: [
                  { value: d.applied, color: COLORS.applied },
                  { value: d.notRelevant, color: COLORS.notRelevant },
                  { value: d.blocked, color: COLORS.blocked },
                  { value: d.other, color: COLORS.other },
                ],
              }))}
            />
            <div className="mt-2">
              <Legend
                items={[
                  { label: "Applied", color: COLORS.applied },
                  { label: "Not relevant", color: COLORS.notRelevant },
                  { label: "Blocked", color: COLORS.blocked },
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Run trigger mix */}
      <Card title="How runs are triggered">
        {mixTotal === 0 ? (
          <p className="text-[12.5px] text-[var(--text-tertiary)]">No runs in this window.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--bg-overlay)]">
              <div
                className="h-full"
                style={{
                  width: `${Math.round((mix.scheduled / mixTotal) * 100)}%`,
                  background: COLORS.accent,
                }}
              />
            </div>
            <span className="shrink-0 text-[12px] text-[var(--text-secondary)]">
              <span className="tabular-nums">{fmtNum(mix.scheduled)}</span> scheduled ·{" "}
              <span className="tabular-nums">{fmtNum(mix.manual)}</span> manual
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
