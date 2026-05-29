"use server";

// IMPORTANT: this is a "use server" module — every export is a Server Action.
// Constants/types are imported from _lib/types.ts (a plain module) and never
// re-exported here, so client components get the real values, not action refs.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  BOOKMARK_STATUSES,
  CLOSE_REASONS,
  type BookmarkStatus,
  type CloseReason,
  type StatusHistoryEntry,
} from "./_lib/types";

export type TrackerActionState = { ok: boolean; error?: string };

const TRACKER_PATH = "/dashboard/tracker";

function isStatus(v: string): v is BookmarkStatus {
  return (BOOKMARK_STATUSES as readonly string[]).includes(v);
}
function isCloseReason(v: string): v is CloseReason {
  return (CLOSE_REASONS as readonly string[]).includes(v);
}

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Move a bookmark to a new status. Appends an entry to status_history (the
 * append-only audit) and sets close_reason only when moving to `closed`
 * (cleared otherwise). Closing requires a valid reason.
 */
export async function moveBookmarkAction(
  formData: FormData,
): Promise<TrackerActionState> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const reasonRaw = String(formData.get("close_reason") ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Bad bookmark id." };
  if (!isStatus(status)) return { ok: false, error: "Unknown status." };

  let closeReason: CloseReason | null = null;
  if (status === "closed") {
    if (!isCloseReason(reasonRaw)) {
      return { ok: false, error: "Closing a bookmark needs a reason." };
    }
    closeReason = reasonRaw;
  }

  const { supabase, user } = await authedClient();
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };

  // Read the current history (scoped to the user) so we can append to it.
  const { data: current, error: readErr } = await supabase
    .from("bookmarks")
    .select("status_history")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{ status_history: unknown }>();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) return { ok: false, error: "Bookmark not found." };

  const history = Array.isArray(current.status_history)
    ? (current.status_history as StatusHistoryEntry[])
    : [];
  const entry: StatusHistoryEntry = {
    status,
    at: new Date().toISOString(),
    reason: closeReason,
  };

  const { error } = await supabase
    .from("bookmarks")
    .update({
      status,
      close_reason: closeReason,
      status_history: [...history, entry],
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(TRACKER_PATH);
  return { ok: true };
}

/** Update the free-form notes on a bookmark. */
export async function updateBookmarkNotesAction(
  formData: FormData,
): Promise<TrackerActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Bad bookmark id." };
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const notes = notesRaw.length > 0 ? notesRaw.slice(0, 2000) : null;

  const { supabase, user } = await authedClient();
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };

  const { error } = await supabase
    .from("bookmarks")
    .update({ notes })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(TRACKER_PATH);
  return { ok: true };
}

/** Remove a bookmark from the tracker. Does not touch feedback history. */
export async function deleteBookmarkAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const { supabase, user } = await authedClient();
  if (!user) return;
  await supabase.from("bookmarks").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath(TRACKER_PATH);
}

/**
 * Add a job_result to the tracker as a "saved" bookmark. Verifies the result
 * belongs to the user before inserting; idempotent via the
 * (user_id, job_result_id) unique constraint.
 */
export async function addBookmarkAction(
  formData: FormData,
): Promise<TrackerActionState> {
  const jobResultId = Number(formData.get("job_result_id"));
  if (!Number.isInteger(jobResultId) || jobResultId <= 0) {
    return { ok: false, error: "Bad job id." };
  }

  const { supabase, user } = await authedClient();
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };

  // Defense in depth: confirm the result is the caller's before bookmarking.
  const { data: job } = await supabase
    .from("job_results")
    .select("id")
    .eq("id", jobResultId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: number }>();
  if (!job) return { ok: false, error: "Job not found or not yours." };

  const entry: StatusHistoryEntry = {
    status: "saved",
    at: new Date().toISOString(),
    reason: null,
  };
  const { error } = await supabase.from("bookmarks").upsert(
    {
      user_id: user.id,
      job_result_id: jobResultId,
      status: "saved",
      status_history: [entry],
    },
    { onConflict: "user_id,job_result_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(TRACKER_PATH);
  return { ok: true };
}
