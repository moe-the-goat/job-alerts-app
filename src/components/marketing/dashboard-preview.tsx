import { Bookmark, Check, X, ChevronDown } from "lucide-react";
import { SAMPLE_PICKS } from "./sample-picks";

/**
 * A high-fidelity render of the user's own dashboard (Tab A — Feedback)
 * showing the SAME three picks as the email mock, but with the action
 * chips that exist only on the web app: applied / bookmarked / not for me.
 *
 * The visual parallel with EmailPreview communicates: same picks, two
 * surfaces. The dashboard adds reactions that train the model.
 */
export function DashboardPreview() {
  return (
    <article
      role="figure"
      aria-label="Sample dashboard view"
      className="relative w-full overflow-hidden rounded-xl border border-[var(--border-muted)] bg-[var(--bg-elevated)] shadow-[var(--shadow-raised)]"
    >
      {/* In-app tab bar — the figure is an honest crop of the app, no
          faux browser chrome around it. */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
        <nav className="flex items-center gap-1 text-[12.5px]">
          <span className="rounded-md bg-[var(--bg-overlay)] px-2.5 py-1 font-medium text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-muted)]">
            Feedback
          </span>
          <span className="px-2.5 py-1 text-[var(--text-tertiary)]">
            Tracker
          </span>
        </nav>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--success-400)]" />
          live
        </div>
      </div>

      {/* Subheader */}
      <div className="flex items-baseline justify-between px-5 pt-4 pb-2">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
            Today
          </div>
          <div className="text-[11.5px] text-[var(--text-tertiary)]">
            3 picks · scored from 412
          </div>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className="pointer-events-none flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-tertiary)]"
        >
          Sort: score <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Pick cards with feedback action row */}
      <div className="space-y-2 px-3 pb-4 pt-1">
        {SAMPLE_PICKS.map((job, i) => (
          <div
            key={job.title}
            className="animate-fade-in-up rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-overlay)]/60 px-3 py-3"
            style={{ animationDelay: `${260 + i * 90}ms` }}
          >
            <div className="flex items-start gap-3">
              <ScorePill score={job.score} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-[var(--text-primary)]">
                  {job.title}
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                  {job.company} · {job.location}
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">
                  <span className="text-[var(--accent-400)]">▸</span>{" "}
                  {job.match}
                </div>

                {/* Feedback action chips — the dashboard's signature affordance */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <ActionChip icon={<Check className="h-3 w-3" />} label="Applied" />
                  <ActionChip
                    icon={<Bookmark className="h-3 w-3" />}
                    label="Bookmark"
                  />
                  <ActionChip
                    icon={<X className="h-3 w-3" />}
                    label="Not for me"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function ActionChip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 px-2 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
      {icon}
      {label}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const strong = score >= 90;
  return (
    <div
      className={
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[12.5px] font-medium " +
        (strong
          ? "bg-[var(--accent-500)]/12 text-[var(--accent-300)] ring-1 ring-inset ring-[var(--accent-500)]/30"
          : "bg-[var(--bg-overlay)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)]")
      }
    >
      {score}
    </div>
  );
}
