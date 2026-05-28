/**
 * Pure types + constants shared between server and client components.
 * Lives in its own module so client bundles don't accidentally pull in
 * the Supabase server client (which imports `next/headers`).
 */

export const FEEDBACK_TYPES = [
  "applied",
  "bookmarked",
  "not_relevant",
  "block_company",
  "wrong_location",
  "other",
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface RunSummary {
  id: number;
  status: "running" | "success" | "failed" | "skipped";
  started_at: string;
  approved: number;
}

export interface JobResult {
  id: number;
  run_id: number;
  title: string | null;
  company: string | null;
  location: string | null;
  job_url: string | null;
  match_percentage: number | null;
  tech_fit: number | null;
  experience_fit: number | null;
  logistics_fit: number | null;
  ai_verdict: string | null;
  compensation: string | null;
  effort: "low" | "medium" | "high" | "unknown" | null;
  suspicious: boolean;
  pre_flagged_low_quality: boolean;
  pre_flagged_trusted: boolean;
  similarity: number | null;
  created_at: string;
}

export interface JobWithFeedback extends JobResult {
  feedback: FeedbackType[];
}
