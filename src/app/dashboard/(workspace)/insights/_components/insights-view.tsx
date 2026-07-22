import type { InsightsData } from "../_lib/insights-data";

/**
 * Read-only "your job search" insights. Pure presentation; data comes from
 * loadInsights() (RLS-scoped to the signed-in user). Dependency-free SVG bars,
 * matching the dashboard's design tokens.
 */
export function InsightsView({ data }: { data: InsightsData }) {
  const { totals, daily, topCompanies, matchBuckets, windowDays } = data;
  const maxDaily = Math.max(1, ...daily.map((d) => Math.max(d.runs, d.surfaced)));
  const maxBucket = Math.max(1, ...matchBuckets.map((b) => b.count));

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`Runs · ${windowDays}d`} value={totals.runs} />
        <Stat label="Jobs surfaced" value={totals.surfaced} />
        <Stat label="Applied" value={totals.applied} tone="accent" />
        <Stat label="Avg match" value={totals.avgMatch === null ? "—" : `${totals.avgMatch}%`} />
      </div>

      {/* Activity over time */}
      <Card title="Activity">
        <Legend
          items={[
            { label: "Jobs surfaced", color: "var(--accent-500)" },
            { label: "Runs", color: "var(--accent-300)" },
          ]}
        />
        <div className="mt-2">
          <Sparkbars
            data={daily.map((d) => ({
              title: `${shortDay(d.day)} · ${d.surfaced} surfaced, ${d.runs} run(s)`,
              segments: [
                // Runs sit behind surfaced as a thin marker — show surfaced as the
                // primary bar; runs as a small accent at the base.
                { value: d.surfaced, color: "var(--accent-500)" },
              ],
              marker: d.runs > 0,
            }))}
            max={maxDaily}
          />
        </div>
      </Card>

      <div className="grid gap-6 @[640px]:grid-cols-2">
        {/* Match-score distribution */}
        <Card title="Match-score spread">
          {matchBuckets.every((b) => b.count === 0) ? (
            <Empty>No AI-scored jobs yet.</Empty>
          ) : (
            <div className="space-y-1.5">
              {matchBuckets.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-right font-mono text-[11px] text-[var(--text-tertiary)]">
                    {b.label}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--bg-overlay)]">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.max(b.count > 0 ? 3 : 0, Math.round((b.count / maxBucket) * 100))}%`,
                        background: bucketColor(b.label),
                      }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {b.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Top companies */}
        <Card title="Most-surfaced companies">
          {topCompanies.length === 0 ? (
            <Empty>No companies yet.</Empty>
          ) : (
            <ul className="space-y-1">
              {topCompanies.map((c) => (
                <li
                  key={c.company}
                  className="flex items-center justify-between gap-3 px-1 py-0.5 text-[12.5px]"
                >
                  <span className="min-w-0 truncate text-[var(--text-secondary)]">{c.company}</span>
                  <span className="shrink-0 font-mono tabular-nums text-[var(--text-tertiary)]">
                    {c.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">
        Covers the last {windowDays} days. &ldquo;Applied&rdquo; counts every job you
        marked applied. Match scores come from the AI verdict; the dashboard shows
        every result regardless of your minimum-match email setting.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "accent";
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-4 py-3">
      <div
        className={`font-mono text-[22px] font-semibold tabular-nums ${
          tone === "accent" ? "text-[var(--highlight-500)]" : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-4">
      <h3 className="mb-3 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--border-muted)] px-4 py-6 text-center text-[12.5px] text-[var(--text-tertiary)]">
      {children}
    </p>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
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

/** Daily bars (surfaced) with a small base marker on days that had a run. */
function Sparkbars({
  data,
  max,
  height = 52,
}: {
  data: { title: string; segments: { value: number; color: string }[]; marker?: boolean }[];
  max: number;
  height?: number;
}) {
  const n = Math.max(1, data.length);
  const slot = 100 / n;
  const barW = slot * 0.78;
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Daily jobs surfaced"
    >
      {data.map((d, i) => {
        const x = i * slot + (slot - barW) / 2;
        const total = d.segments.reduce((s, g) => s + g.value, 0);
        const h = (total / max) * (height - 4);
        return (
          <g key={i}>
            <title>{d.title}</title>
            {total === 0 ? (
              <rect x={x} y={height - 1} width={barW} height={1} fill="var(--border-muted)" />
            ) : (
              <rect x={x} y={height - h} width={barW} height={h} fill={d.segments[0].color} rx={0.4} />
            )}
            {d.marker && (
              <rect x={x} y={height - 2} width={barW} height={2} fill="var(--accent-300)" rx={0.4} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function bucketColor(label: string): string {
  if (label === "80–100") return "var(--success-400)";
  if (label === "60–79") return "var(--accent-500)";
  if (label === "40–59") return "var(--warning-400)";
  return "var(--text-tertiary)";
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
