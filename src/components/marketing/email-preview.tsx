import { LogoMark } from "@/components/brand/logo";
import { SAMPLE_PICKS } from "./sample-picks";

/**
 * A high-fidelity render of an actual morning email as it would appear
 * inside an email client (Apple Mail / Gmail conversation view).
 *
 * Includes the chrome a real email reader recognizes — sender row with
 * avatar + address, "to me" line, subject heading, date, and message
 * body — so visitors immediately see "this is what gets sent to me",
 * not a stylized abstraction.
 */
export function EmailPreview() {
  return (
    <article
      role="figure"
      aria-label="Sample morning email"
      className="relative w-full overflow-hidden rounded-xl border border-[var(--border-muted)] bg-[var(--bg-elevated)] shadow-[var(--shadow-raised)]"
    >
      {/* Sender + metadata block — reads as an opened email without any
          faux client chrome around it. */}
      <header className="space-y-3 px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          {/* Sender avatar — the actual brand mark in miniature */}
          <div
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--bg-overlay)] ring-1 ring-inset ring-[var(--border-muted)]"
          >
            <LogoMark className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13.5px] font-medium text-[var(--text-primary)]">
                Job Alerts
              </span>
              <span className="shrink-0 text-[11.5px] text-[var(--text-tertiary)]">
                9:14 AM
              </span>
            </div>
            <div className="truncate text-[12px] text-[var(--text-tertiary)]">
              hi@joalerts.app
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">
              to <span className="text-[var(--text-secondary)]">me</span>
            </div>
          </div>
        </div>

        {/* Subject line — the heaviest thing on the page, like a real email */}
        <h2 className="pt-1 text-[17px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
          Your morning shortlist · 3 picks
        </h2>
      </header>

      {/* Body — written in the voice of an email, not marketing */}
      <div className="space-y-3 px-5 pb-3">
        <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
          Good morning. I scored{" "}
          <span className="font-mono text-[var(--text-primary)]">412</span>{" "}
          listings overnight. These three matched your CV best.
        </p>

        <ol className="space-y-2 pt-1">
          {SAMPLE_PICKS.map((job, i) => (
            <li
              key={job.title}
              className="animate-fade-in-up rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-overlay)]/60 px-3 py-2.5"
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
                    <span className="text-[var(--highlight-500)]">▸</span>{" "}
                    {job.match}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <p className="pt-2 text-[12px] leading-relaxed text-[var(--text-tertiary)]">
          Open your dashboard to react — applied, bookmarked, or not for you.
          Your reactions tune tomorrow&apos;s picks.
        </p>
      </div>

      {/* Email signature row */}
      <footer className="border-t border-[var(--border-subtle)] px-5 py-3 text-[11px] text-[var(--text-tertiary)]">
        — Job Alerts · daily, 9 AM your time
      </footer>
    </article>
  );
}

function ScorePill({ score }: { score: number }) {
  // The top pick glows in the sunrise amber — First Light's one warm note,
  // reserved for the moment the product delivers. Lesser scores stay neutral
  // so the amber keeps its meaning.
  const strong = score >= 90;
  return (
    <div
      className={
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[12.5px] font-semibold " +
        (strong
          ? "bg-[var(--highlight-400)]/14 text-[var(--highlight-500)] ring-1 ring-inset ring-[var(--highlight-400)]/35"
          : "bg-[var(--bg-overlay)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)]")
      }
    >
      {score}
    </div>
  );
}
