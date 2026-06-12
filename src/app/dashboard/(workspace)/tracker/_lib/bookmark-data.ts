import { createClient } from "@/lib/supabase/server";
import type {
  Bookmark,
  BookmarkableJob,
  LatestRunPicker,
  StatusHistoryEntry,
} from "./types";

export type { Bookmark, BookmarkableJob, LatestRunPicker };

// Shape of the bookmarks row + the embedded job_results columns we join in.
interface BookmarkRow {
  id: number;
  job_result_id: number;
  status: Bookmark["status"];
  close_reason: Bookmark["close_reason"];
  notes: string | null;
  status_history: unknown;
  created_at: string;
  updated_at: string;
  job_results: {
    title: string | null;
    company: string | null;
    location: string | null;
    job_url: string | null;
    match_percentage: number | null;
  } | null;
}

const BOOKMARK_FIELDS =
  "id, job_result_id, status, close_reason, notes, status_history, created_at, updated_at, " +
  "job_results!inner(title, company, location, job_url, match_percentage)";

/**
 * Load the user's bookmarks with their joined job details, newest-touched
 * first. The inner join on job_results means a bookmark whose job_result was
 * purged (90-day retention) simply drops out — but bookmarked results are
 * retained indefinitely, so that shouldn't happen in practice.
 */
export async function loadBookmarks(userId: string): Promise<Bookmark[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookmarks")
    .select(BOOKMARK_FIELDS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .returns<BookmarkRow[]>();

  return (data ?? []).map((row) => {
    const job = normalizeJoin(row.job_results);
    return {
      id: row.id,
      job_result_id: row.job_result_id,
      status: row.status,
      close_reason: row.close_reason,
      notes: row.notes,
      status_history: normalizeHistory(row.status_history),
      created_at: row.created_at,
      updated_at: row.updated_at,
      title: job?.title ?? null,
      company: job?.company ?? null,
      location: job?.location ?? null,
      job_url: job?.job_url ?? null,
      match_percentage: job?.match_percentage ?? null,
    };
  });
}

/**
 * The "Add from results" picker payload: the valid jobs from the user's MOST
 * RECENT run that they haven't tracked yet, plus the run's identity so the UI
 * can label where the list came from ("From your run on …").
 *
 * Scoping to one run (rather than the last N results across all runs) means
 * the user reviews exactly what the latest scrape surfaced — the natural unit
 * for "what's new to track" — instead of a rolling window that mixes runs.
 *
 * Three scoped queries: the latest run id, that run's valid results, and the
 * user's existing bookmark targets (diffed in memory). At this scale that's
 * simpler and cheaper than a NOT IN subquery over the API. `is_valid = true`
 * keeps the lower-ranked summary rows out of the picker.
 */
export async function loadLatestRunBookmarkableJobs(
  userId: string,
): Promise<LatestRunPicker> {
  const supabase = await createClient();

  // Latest run by start time. We don't filter on status: a run that produced
  // results is worth offering even if it later ended 'failed' mid-write.
  const { data: run } = await supabase
    .from("runs")
    .select("id, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number; started_at: string }>();

  if (!run) {
    return { runStartedAt: null, totalInRun: 0, jobs: [] };
  }

  const [resultsRes, bookmarkedRes] = await Promise.all([
    supabase
      .from("job_results")
      .select("id, title, company, location, match_percentage, created_at")
      .eq("user_id", userId)
      .eq("run_id", run.id)
      .eq("is_valid", true)
      .order("match_percentage", { ascending: false, nullsFirst: false })
      .returns<BookmarkableJob[]>(),
    supabase
      .from("bookmarks")
      .select("job_result_id")
      .eq("user_id", userId)
      .returns<{ job_result_id: number }[]>(),
  ]);

  const inRun = resultsRes.data ?? [];
  const alreadyBookmarked = new Set(
    (bookmarkedRes.data ?? []).map((b) => b.job_result_id),
  );
  const jobs = inRun.filter((j) => !alreadyBookmarked.has(j.id));

  return {
    runStartedAt: run.started_at,
    totalInRun: inRun.length,
    jobs,
  };
}

function normalizeJoin(
  job: BookmarkRow["job_results"],
): BookmarkRow["job_results"] {
  // PostgREST returns a to-one embed as an object, but the typed client
  // sometimes widens it to an array — tolerate both.
  if (Array.isArray(job)) return job[0] ?? null;
  return job;
}

function normalizeHistory(raw: unknown): StatusHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StatusHistoryEntry =>
      !!e && typeof e === "object" && typeof (e as StatusHistoryEntry).status === "string",
  );
}
