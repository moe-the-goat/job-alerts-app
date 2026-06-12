import type { Metadata } from "next";
import { AlertTriangle, ExternalLink, Globe2, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { groupByOrigin } from "@/lib/origin-sections";
import { FeedbackActions } from "./_components/feedback-actions";

/**
 * Public, phone-first feedback page behind a per-(user,run) email token
 * (task W2). No session, no service-role key: the anon client calls the
 * SECURITY DEFINER RPC from migration 0012, which does all the token
 * validation and scoping inside Postgres.
 */

export const metadata: Metadata = {
  title: "Rate today's matches",
  // Tokenized URLs must never end up in a search index.
  robots: { index: false, follow: false },
};

// Token responses are per-secret-URL and time-sensitive — never cache.
export const dynamic = "force-dynamic";

interface TokenJob {
  id: number;
  title: string | null;
  company: string | null;
  location: string | null;
  job_url: string | null;
  match_percentage: number | null;
  origin: "global" | "local" | null;
  suspicious: boolean;
  ai_evaluated: boolean;
}

interface TokenPageData {
  ok: boolean;
  error?: string;
  expires_at?: string;
  jobs?: TokenJob[];
  given?: Record<string, string[]>;
}

function scoreTone(score: number): string {
  if (score >= 80) return "var(--sage-400)";
  if (score >= 60) return "var(--amber-400)";
  return "var(--terracotta-400)";
}

function DeadLink({ reason }: { reason?: string }) {
  const expired = reason === "expired";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-[26px] text-[var(--text-primary)]">
        {expired ? "This link has expired" : "This link isn't valid"}
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">
        {expired
          ? "Feedback links from the daily email work for 30 days. You can still rate these jobs from the dashboard."
          : "Check that the address matches the link in your email — or rate your jobs from the dashboard instead."}
      </p>
      <a
        href="/dashboard/feedback"
        className="mt-6 rounded-lg bg-[var(--accent-500)] px-5 py-2.5 text-[13.5px] font-medium text-[var(--bg-base)]"
      >
        Open the dashboard
      </a>
    </main>
  );
}

export default async function EmailFeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("email_feedback_jobs", {
    p_token: token,
  });

  const result: TokenPageData =
    !error && data && typeof (data as TokenPageData).ok === "boolean"
      ? (data as TokenPageData)
      : { ok: false, error: "invalid_token" };

  if (!result.ok) {
    return <DeadLink reason={result.error} />;
  }

  const jobs = result.jobs ?? [];
  const given = result.given ?? {};
  const sections = groupByOrigin(jobs);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <header>
        <h1 className="font-serif text-[26px] text-[var(--text-primary)]">
          Rate today&rsquo;s matches
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--text-secondary)]">
          One tap per job — it trains tomorrow&rsquo;s scoring. No sign-in
          needed.
        </p>
      </header>

      {jobs.length === 0 && (
        <p className="mt-10 text-center text-[14px] text-[var(--text-tertiary)]">
          This run surfaced no jobs to rate.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.label} className="mt-8">
          <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            {section.icon === "pin" && <MapPin className="h-3.5 w-3.5" />}
            {section.icon === "globe" && <Globe2 className="h-3.5 w-3.5" />}
            {section.label}
            <span className="font-normal">· {section.jobs.length}</span>
          </h2>

          <ul className="mt-3 space-y-3">
            {section.jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-xl bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-raised)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium leading-snug text-[var(--text-primary)]">
                      {job.title ?? "Untitled role"}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-[var(--text-tertiary)]">
                      {[job.company, job.location].filter(Boolean).join(" · ") ||
                        "—"}
                    </p>
                  </div>
                  {job.match_percentage != null && (
                    <span
                      className="shrink-0 rounded-md px-2 py-1 font-mono text-[13px] font-semibold"
                      style={{
                        color: scoreTone(job.match_percentage),
                        background: `color-mix(in oklab, ${scoreTone(job.match_percentage)}, transparent 88%)`,
                      }}
                      aria-label={`Match ${job.match_percentage}%`}
                    >
                      {job.match_percentage}%
                    </span>
                  )}
                </div>

                {job.suspicious && (
                  <p className="mt-2 flex items-center gap-1 text-[12px] text-[var(--amber-400)]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Flagged as possibly suspicious — check before applying.
                  </p>
                )}

                {job.job_url && (
                  <a
                    href={job.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-[var(--accent-500)]"
                  >
                    View posting
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                <div className="mt-3">
                  <FeedbackActions
                    token={token}
                    jobResultId={job.id}
                    company={job.company}
                    initialGiven={given[String(job.id)] ?? []}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {jobs.length > 0 && (
        <footer className="mt-10 text-center text-[12px] text-[var(--text-tertiary)]">
          This private link expires{" "}
          {result.expires_at
            ? `on ${new Date(result.expires_at).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              })}`
            : "30 days after the email was sent"}
          . Full controls live in the dashboard.
        </footer>
      )}
    </main>
  );
}
