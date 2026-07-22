import { Bookmark as BookmarkIcon } from "lucide-react";
import {
  BOOKMARK_STATUSES,
  STATUS_LABELS,
  type Bookmark,
} from "../_lib/types";
import { BookmarkCard } from "./bookmark-card";

/**
 * Server component: lays out the six pipeline columns and drops each bookmark
 * into its status column. The cards themselves are client components (they own
 * the move / notes / delete interactions).
 */
export function Board({ bookmarks }: { bookmarks: Bookmark[] }) {
  const byStatus = new Map<string, Bookmark[]>();
  for (const s of BOOKMARK_STATUSES) byStatus.set(s, []);
  for (const b of bookmarks) {
    (byStatus.get(b.status) ?? byStatus.get("saved"))!.push(b);
  }

  return (
    // A real kanban: columns keep a usable fixed width and the BOARD scrolls
    // horizontally. The old 6-across grid squeezed each column to ~170px,
    // which crushed the cards (truncated titles, overflowing controls).
    <div className="flex gap-3 overflow-x-auto pb-3">
      {BOOKMARK_STATUSES.map((status) => {
        const items = byStatus.get(status) ?? [];
        return (
          <div
            key={status}
            className="flex w-60 shrink-0 flex-col gap-2 self-start rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 shadow-[var(--shadow-raised)] sm:w-64"
          >
            <div className="flex items-center justify-between px-0.5">
              <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                {STATUS_LABELS[status]}
              </span>
              <span className="text-[10.5px] text-[var(--text-disabled)]">
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-[var(--border-subtle)] bg-[var(--bg-base)]/40">
                <BookmarkIcon className="h-3.5 w-3.5 text-[var(--text-disabled)]" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((b) => (
                  <BookmarkCard key={b.id} bookmark={b} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
