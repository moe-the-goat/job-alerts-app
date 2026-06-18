"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { LlmDay, LlmUsageStats } from "../_lib/analytics";
import { capFor } from "../_lib/llm-caps";
import { Legend, Sparkbars, fmtNum } from "./ui";

// Warn once a model crosses this share of any daily cap — enough runway to react
// (rotate a key, pause a heavy user) before requests actually start failing.
const NEAR_CAP_PCT = 80;

/**
 * LLM-usage panel for the admin Analytics tab. Shows, per model, requests/tokens
 * used in a chosen range (today / this week / all-time) with % gauges against
 * each model's free-tier cap, plus a per-user breakdown.
 *
 * Honesty notes surfaced in the UI:
 *  - RPD % is accurate (we count every call). Cerebras/Groq caps are DOUBLED
 *    because the worker rotates across two accounts each.
 *  - "Peak RPM" is the max requests seen in any 60s window (a rate proxy — not a
 *    live meter), meaningful for the "today" range.
 *  - Tokens are best-effort (only where the provider reports them).
 *  - % vs cap is only shown for "today" (caps are per-day; week/all-time totals
 *    have no daily cap to compare against).
 */

type Range = "today" | "week" | "all";

function pct(used: number, cap: number | null): number | null {
  if (!cap || cap <= 0) return null;
  return Math.min(100, Math.round((used / cap) * 100));
}

function Bar({ value }: { value: number }) {
  const tone =
    value >= 90
      ? "var(--danger-400)"
      : value >= 70
        ? "var(--warning-400)"
        : "var(--success-400)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-overlay)]">
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: tone }} />
    </div>
  );
}

export function LlmUsage({ data, trend }: { data: LlmUsageStats; trend?: LlmDay[] }) {
  const [range, setRange] = React.useState<Range>("today");
  const r = data[range];
  const isToday = range === "today";

  const tabs: { key: Range; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "all", label: "All-time" },
  ];

  // Cap warnings always reflect TODAY (caps are per-day), regardless of the tab.
  const nearCap = data.today.byModel
    .flatMap((m) => {
      const cap = capFor(m.model);
      const out: { label: string; pct: number; kind: string }[] = [];
      const rpd = pct(m.requests, cap.rpd);
      const tpd = cap.tpd ? pct(m.tokens, cap.tpd) : null;
      if (rpd !== null && rpd >= NEAR_CAP_PCT) out.push({ label: cap.label, pct: rpd, kind: "requests" });
      if (tpd !== null && tpd >= NEAR_CAP_PCT) out.push({ label: cap.label, pct: tpd, kind: "tokens" });
      return out;
    })
    .sort((a, b) => b.pct - a.pct);

  return (
    <section className="mt-8">
      {nearCap.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--danger-400)]/30 bg-[var(--danger-400)]/[0.06] px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger-400)]" />
          <span className="text-[12.5px] font-medium text-[var(--text-primary)]">
            Approaching today&rsquo;s cap
          </span>
          <span className="flex flex-wrap gap-1.5">
            {nearCap.map((c, i) => (
              <span
                key={i}
                className="rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
              >
                {c.label} {c.kind} ·{" "}
                <span className="tabular-nums font-medium text-[var(--danger-400)]">{c.pct}%</span>
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          LLM usage
        </h2>
        <div className="flex gap-1 rounded-md border border-[var(--border-muted)] p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setRange(t.key)}
              className={`rounded px-2.5 py-1 text-[11.5px] transition-colors ${
                range === t.key
                  ? "bg-[var(--accent-500)] text-white"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {r.byModel.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-muted)] px-4 py-6 text-center text-[13px] text-[var(--text-tertiary)]">
          No LLM usage recorded for this range yet.
        </p>
      ) : (
        <div className="space-y-3">
          {r.byModel.map((m) => {
            const cap = capFor(m.model);
            const rpdPct = isToday ? pct(m.requests, cap.rpd) : null;
            const tpdPct = isToday && cap.tpd ? pct(m.tokens, cap.tpd) : null;
            return (
              <div
                key={m.model}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">
                    {cap.label}
                    {cap.accounts > 1 && (
                      <span className="ml-2 rounded-sm bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                        {cap.accounts} accounts
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11.5px] text-[var(--text-tertiary)]">
                    {m.requests.toLocaleString()} req
                    {m.requestsFailed > 0 && (
                      <span className="text-[var(--danger-400)]/80">
                        {" "}· {m.requestsFailed} failed
                      </span>
                    )}
                    {m.tokens > 0 && ` · ${m.tokens.toLocaleString()} tok`}
                    {isToday && m.peakRpm > 0 && ` · peak ${m.peakRpm}/min`}
                  </span>
                </div>

                {/* Daily caps only make sense for the "today" range. */}
                {isToday && (
                  <div className="mt-2 grid gap-2 @[520px]:grid-cols-2">
                    {rpdPct !== null && (
                      <Gauge
                        label={`Requests / day · ${m.requests}/${cap.rpd}`}
                        value={rpdPct}
                      />
                    )}
                    {tpdPct !== null && (
                      <Gauge
                        label={`Tokens / day · ${m.tokens.toLocaleString()}/${cap.tpd?.toLocaleString()}`}
                        value={tpdPct}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Per-user breakdown */}
          {r.byUser.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border-subtle)] px-3 py-2">
              <div className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                Per user
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[var(--text-tertiary)]">
                    <th className="py-1 pr-3 font-medium">User</th>
                    <th className="py-1 pr-3 font-medium">Model</th>
                    <th className="py-1 pr-3 font-medium">Requests</th>
                    <th className="py-1 pr-3 font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byUser.map((u, i) => (
                    <tr key={i} className="border-t border-[var(--border-muted)]/40">
                      <td className="min-w-0 max-w-[200px] truncate py-1 pr-3 text-[var(--text-secondary)]">
                        {u.email}
                      </td>
                      <td className="py-1 pr-3 text-[var(--text-tertiary)]">{u.model}</td>
                      <td className="py-1 pr-3 tabular-nums text-[var(--text-secondary)]">
                        {u.requests.toLocaleString()}
                      </td>
                      <td className="py-1 pr-3 tabular-nums text-[var(--text-secondary)]">
                        {u.tokens ? u.tokens.toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10.5px] leading-relaxed text-[var(--text-tertiary)]">
            % gauges compare today&rsquo;s usage to each model&rsquo;s free-tier
            daily cap (estimates — providers don&rsquo;t expose a live quota).
            Cerebras &amp; Groq caps are doubled for the two accounts each.
            &ldquo;Peak/min&rdquo; is the busiest 60-second window, not a live rate.
          </p>
        </div>
      )}

      {trend && trend.some((d) => d.requests > 0) && <Trajectory trend={trend} />}
    </section>
  );
}

/** 30-day usage trajectory — total requests per day, with a tokens overlay
 *  summary. Always-on (independent of the today/week/all toggle) so you can see
 *  whether usage is trending toward the caps before you hit them. */
function Trajectory({ trend }: { trend: LlmDay[] }) {
  const totalReq = trend.reduce((n, d) => n + d.requests, 0);
  const totalTok = trend.reduce((n, d) => n + d.tokens, 0);
  const dayName = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
          {trend.length}-day trajectory
        </span>
        <span className="text-[11.5px] text-[var(--text-tertiary)]">
          {fmtNum(totalReq)} req · {fmtNum(totalTok)} tok
        </span>
      </div>
      <Sparkbars
        ariaLabel="LLM requests per day over the trend window"
        height={48}
        data={trend.map((d) => ({
          label: d.day,
          title: `${dayName(d.day)} · ${d.requests} req, ${fmtNum(d.tokens)} tok`,
          segments: [{ value: d.requests, color: "var(--accent-500)" }],
        }))}
      />
      <div className="mt-2">
        <Legend items={[{ label: "Requests / day (all models)", color: "var(--accent-500)" }]} />
      </div>
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-[var(--text-tertiary)]">{label}</span>
        <span className="font-mono text-[var(--text-secondary)]">{value}%</span>
      </div>
      <Bar value={value} />
    </div>
  );
}
