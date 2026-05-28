import { ExternalLink, MapPin } from "lucide-react";
import type { JobWithFeedback } from "../_lib/types";
import { FeedbackButtons } from "./feedback-buttons";
import { SeverityBadge, type SeverityKind } from "./severity-badge";

interface JobCardProps {
  job: JobWithFeedback;
}

export function JobCard({ job }: JobCardProps) {
  const severities = pickSeverities(job);
  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 transition-colors hover:border-[var(--border-muted)]">
      <div className="flex items-start gap-4">
        <ScorePill score={job.match_percentage} />

        <div className="min-w-0 flex-1 space-y-2.5">
          <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-medium text-[var(--text-primary)]">
                {job.title ?? "Untitled role"}
              </h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">
                  {job.company ?? "Unknown company"}
                </span>
                {job.location && (
                  <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
                    <MapPin className="h-3 w-3" />
                    {job.location}
                  </span>
                )}
              </div>
            </div>

            {severities.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {severities.map((kind) => (
                  <SeverityBadge key={kind} kind={kind} />
                ))}
              </div>
            )}
          </header>

          {job.ai_verdict && (
            <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {job.ai_verdict}
            </p>
          )}

          <SubScores
            tech={job.tech_fit}
            experience={job.experience_fit}
            logistics={job.logistics_fit}
            extra={[
              job.compensation ? { label: "Comp", value: job.compensation } : null,
              job.effort && job.effort !== "unknown"
                ? { label: "Effort", value: capitalize(job.effort) }
                : null,
            ].filter(Boolean) as { label: string; value: string }[]}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <FeedbackButtons jobResultId={job.id} submitted={job.feedback} />
            {job.job_url && (
              <a
                href={job.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-md"
              >
                Open job
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function pickSeverities(job: JobWithFeedback): SeverityKind[] {
  const out: SeverityKind[] = [];
  // Order matters — the verdict prefix in core_ai uses [SCAM] before
  // [AI-SUSPICIOUS] before [BLACKLIST]; we follow the same priority.
  const verdict = job.ai_verdict ?? "";
  if (verdict.includes("[SCAM]")) out.push("scam");
  if (job.suspicious || verdict.includes("[AI-SUSPICIOUS]")) {
    out.push("suspicious");
  }
  if (job.pre_flagged_low_quality) out.push("low_quality");
  if (job.pre_flagged_trusted && out.length === 0) out.push("trusted");
  return out;
}

function ScorePill({ score }: { score: number | null }) {
  const display = score ?? "—";
  const strong = (score ?? 0) >= 85;
  const ok = (score ?? 0) >= 70 && (score ?? 0) < 85;
  return (
    <div
      className={[
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-[13.5px] font-medium ring-1 ring-inset",
        strong
          ? "bg-gradient-to-br from-[var(--accent-300)]/15 to-[var(--accent-500)]/10 text-[var(--accent-300)] ring-[var(--accent-500)]/30"
          : ok
            ? "bg-[var(--bg-overlay)] text-[var(--warning-400)] ring-[var(--warning-400)]/30"
            : "bg-[var(--bg-overlay)] text-[var(--text-tertiary)] ring-[var(--border-muted)]",
      ].join(" ")}
    >
      {display}
    </div>
  );
}

function SubScores({
  tech,
  experience,
  logistics,
  extra,
}: {
  tech: number | null;
  experience: number | null;
  logistics: number | null;
  extra: { label: string; value: string }[];
}) {
  const items = [
    tech !== null ? { label: "Tech", value: `${tech}` } : null,
    experience !== null ? { label: "Exp", value: `${experience}` } : null,
    logistics !== null ? { label: "Logistics", value: `${logistics}` } : null,
    ...extra,
  ].filter(Boolean) as { label: string; value: string }[];
  if (items.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
      {items.map(({ label, value }) => (
        <div key={label} className="inline-flex items-baseline gap-1">
          <dt className="text-[var(--text-tertiary)] uppercase tracking-wider">
            {label}
          </dt>
          <dd className="font-mono text-[var(--text-secondary)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
