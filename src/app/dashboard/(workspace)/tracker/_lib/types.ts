// Pure types + constants for Tab B (the Tracker). No server imports, so this
// is safe to import from client components. (Server actions live in
// ../actions.ts; this file must stay free of "use server" so the constants
// import as real values, not action references.)

export const BOOKMARK_STATUSES = [
  "saved",
  "applied",
  "phone_screen",
  "interview",
  "offer",
  "closed",
] as const;
export type BookmarkStatus = (typeof BOOKMARK_STATUSES)[number];

export const STATUS_LABELS: Record<BookmarkStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  phone_screen: "Phone Screen",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

export const CLOSE_REASONS = [
  "rejected_by_company",
  "withdrew",
  "ghosted",
  "accepted_elsewhere",
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  rejected_by_company: "Rejected",
  withdrew: "Withdrew",
  ghosted: "Ghosted",
  accepted_elsewhere: "Accepted elsewhere",
};

// One entry appended to bookmarks.status_history on every status change —
// an append-only audit of the application's journey.
export interface StatusHistoryEntry {
  status: BookmarkStatus;
  at: string; // ISO timestamp
  reason?: CloseReason | null;
}

export interface Bookmark {
  id: number;
  job_result_id: number;
  status: BookmarkStatus;
  close_reason: CloseReason | null;
  notes: string | null;
  status_history: StatusHistoryEntry[];
  created_at: string;
  updated_at: string;
  // Joined from job_results so a bookmark survives the source URL rotting.
  title: string | null;
  company: string | null;
  location: string | null;
  job_url: string | null;
  match_percentage: number | null;
}

// A job_result the user could still bookmark (not yet in their tracker) —
// powers the "Add from results" picker.
export interface BookmarkableJob {
  id: number;
  title: string | null;
  company: string | null;
  location: string | null;
  match_percentage: number | null;
  created_at: string;
}
