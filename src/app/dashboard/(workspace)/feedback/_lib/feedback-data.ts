import { createClient } from "@/lib/supabase/server";
import type {
  FeedbackType,
  JobResult,
  JobWithFeedback,
  RunSummary,
} from "./types";

export type { FeedbackType, JobResult, JobWithFeedback, RunSummary };

const RUN_HISTORY_LIMIT = 14;
const RUN_FIELDS = "id, status, started_at, approved";

export async function loadRecentRuns(userId: string): Promise<RunSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("runs")
    .select(RUN_FIELDS)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(RUN_HISTORY_LIMIT)
    .returns<RunSummary[]>();
  return data ?? [];
}

/**
 * Resolves the run the user is asking to view. Order of preference:
 *   1. `?run=<id>` query param if the user owns the run.
 *   2. The most recent successful run with approved > 0.
 *   3. The most recent run of any kind (so an empty / failed state has data).
 *   4. null when the user has never had a run.
 */
export function pickActiveRun(
  runs: RunSummary[],
  requestedId: number | null,
): RunSummary | null {
  if (runs.length === 0) return null;
  if (requestedId !== null) {
    const requested = runs.find((r) => r.id === requestedId);
    if (requested) return requested;
  }
  const successWithJobs = runs.find(
    (r) => r.status === "success" && r.approved > 0,
  );
  if (successWithJobs) return successWithJobs;
  return runs[0];
}

const JOB_FIELDS =
  "id, run_id, title, company, location, job_url, " +
  "match_percentage, tech_fit, experience_fit, logistics_fit, ai_verdict, " +
  "description_excerpt, compensation, effort, suspicious, " +
  "pre_flagged_low_quality, pre_flagged_trusted, similarity, created_at, origin";

/** A verdict row as read here; the embedded job_results is only a join filter. */
interface FeedbackRow {
  job_result_id: number | null;
  feedback_type: FeedbackType;
}

export async function loadJobsForRun(
  userId: string,
  runId: number,
): Promise<JobWithFeedback[]> {
  const supabase = await createClient();

  // Top-section picks only: ai_evaluated=true AND is_valid=true. The
  // lower-ranked summary (ai_evaluated=false) is reserved for a later
  // collapsed section.
  // The feedback side is scoped to THIS run by joining through the
  // feedback -> job_results foreign key (declared in migration 0002). Without
  // the join it fetched every verdict the user had ever written just to
  // annotate one run's ~25 rows, so the payload grew forever as they used the
  // app. The join keeps it a single query, so both still run in parallel.
  const scopedFeedback = supabase
    .from("feedback")
    .select("job_result_id, feedback_type, job_results!inner(run_id)")
    .eq("user_id", userId)
    .eq("job_results.run_id", runId);

  const [jobsRes, feedbackRes] = await Promise.all([
    supabase
      .from("job_results")
      .select(JOB_FIELDS)
      .eq("user_id", userId)
      .eq("run_id", runId)
      .eq("ai_evaluated", true)
      .eq("is_valid", true)
      .order("match_percentage", { ascending: false, nullsFirst: false })
      .returns<JobResult[]>(),
    scopedFeedback.returns<FeedbackRow[]>(),
  ]);

  const jobs = jobsRes.data ?? [];

  // If the embedded join ever fails (relationship not exposed by PostgREST),
  // fall back to the previous unscoped read rather than losing every verdict
  // on the page — correctness first, the scoping is only an optimization.
  let feedbackRows = feedbackRes.data ?? [];
  if (feedbackRes.error) {
    const { data } = await supabase
      .from("feedback")
      .select("job_result_id, feedback_type")
      .eq("user_id", userId)
      .returns<FeedbackRow[]>();
    feedbackRows = data ?? [];
  }

  // One verdict per job since migration 0016 — collapse to a single value.
  const feedbackByJob = new Map<number, FeedbackType>();
  for (const row of feedbackRows) {
    if (row.job_result_id == null) continue;
    feedbackByJob.set(row.job_result_id, row.feedback_type);
  }

  return jobs.map((job) => ({
    ...job,
    feedback: feedbackByJob.get(job.id) ?? null,
  }));
}
