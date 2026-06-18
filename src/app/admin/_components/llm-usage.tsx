"use client";

import * as React from "react";
import type { LlmUsageStats } from "../_lib/analytics";
import { capFor } from "../_lib/llm-caps";

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

export function LlmUsage({ data }: { data: LlmUsageStats }) {
  const [range, setRange] = React.useState<Range>("today");
  const r = data[range];
  const isToday = range === "today";

  const tabs: { key: Range; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "all", label: "All-time" },
  ];

  return (
    <section className="mt-8">
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
    </section>
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
