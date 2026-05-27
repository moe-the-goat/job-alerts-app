import { Mail } from "lucide-react";

/**
 * A high-fidelity render of the actual morning email — styled to be
 * recognizable as an email and to surface the value (per-job score,
 * match reason) without explanatory copy.
 *
 * The data is hand-picked for the demo, not a fixture from the DB.
 */
type Job = {
  score: number;
  title: string;
  company: string;
  location: string;
  match: string;
};

const SAMPLE_JOBS: Job[] = [
  {
    score: 92,
    title: "Senior Software Engineer",
    company: "Linear",
    location: "Remote · EU",
    match: "Python, distributed infra, 3+ yrs match",
  },
  {
    score: 88,
    title: "Backend Engineer",
    company: "Vercel",
    location: "Berlin · Hybrid",
    match: "TypeScript, edge runtime, SRE-adjacent",
  },
  {
    score: 86,
    title: "ML Platform Engineer",
    company: "Hugging Face",
    location: "Paris · Remote-friendly",
    match: "PyTorch, training infra at scale",
  },
];

export function EmailPreview() {
  return (
    <div className="relative w-full">
      {/* Very subtle stacked-card illusion behind, hinting at the daily archive */}
      <div
        aria-hidden
        className="absolute -bottom-3 left-4 right-4 h-full rounded-2xl bg-[var(--bg-elevated)] opacity-40 blur-[1px]"
      />
      <div
        aria-hidden
        className="absolute -bottom-1.5 left-2 right-2 h-full rounded-2xl bg-[var(--bg-elevated)] opacity-60"
      />

      <article
        role="figure"
        aria-label="Sample morning email from job-alerts"
        className="relative overflow-hidden rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-elevated)] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,244,224,0.02)_inset]"
      >
        {/* Email header — a real email client chrome row */}
        <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
              <Mail className="h-3.5 w-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                jobs for you
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                Today · 9:14 AM · 3 picks
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-400)]" />
            inbox
          </div>
        </header>

        {/* Subject line */}
        <div className="px-5 pt-4 pb-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
            Subject
          </div>
          <div className="mt-0.5 text-[15px] font-medium text-[var(--text-primary)]">
            Your 3 morning picks · scored against your CV
          </div>
        </div>

        {/* Job entries */}
        <ul className="px-3 pb-3 pt-1">
          {SAMPLE_JOBS.map((job, i) => (
            <li
              key={job.title}
              className="rounded-lg px-2 py-3 transition-colors hover:bg-[var(--bg-overlay)] sm:px-3 animate-fade-in-up"
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
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-[var(--text-tertiary)]">
                    <span className="text-[var(--accent-400)]">▸</span>
                    <span>{job.match}</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Footer note — explains the feedback loop in product voice */}
        <footer className="border-t border-[var(--border-subtle)] px-5 py-3 text-[11.5px] text-[var(--text-tertiary)]">
          Reply with feedback to tune tomorrow&apos;s picks.
        </footer>
      </article>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  // Score uses mono digits so 92 and 88 line up; the box uses a soft
  // amber tint that scales subtly with the score — 90+ glows warmer.
  const strong = score >= 90;
  return (
    <div
      className={
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-[13px] font-medium " +
        (strong
          ? "bg-gradient-to-br from-[var(--accent-300)]/15 to-[var(--accent-500)]/10 text-[var(--accent-300)] ring-1 ring-inset ring-[var(--accent-500)]/30"
          : "bg-[var(--bg-overlay)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)]")
      }
    >
      {score}
    </div>
  );
}
