"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MapPin, StickyNote, Trash2, X } from "lucide-react";
import {
  moveBookmarkAction,
  updateBookmarkNotesAction,
  deleteBookmarkAction,
} from "../actions";
import {
  BOOKMARK_STATUSES,
  CLOSE_REASONS,
  CLOSE_REASON_LABELS,
  STATUS_LABELS,
  type Bookmark,
  type BookmarkStatus,
  type CloseReason,
} from "../_lib/types";

export function BookmarkCard({ bookmark }: { bookmark: Bookmark }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  function move(status: BookmarkStatus, reason: CloseReason | null = null) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(bookmark.id));
      fd.set("status", status);
      if (reason) fd.set("close_reason", reason);
      const res = await moveBookmarkAction(fd);
      if (res.ok) {
        setPendingClose(false);
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't move this card.");
      }
    });
  }

  function onPickStatus(next: BookmarkStatus) {
    if (next === bookmark.status) return;
    if (next === "closed") {
      setPendingClose(true); // ask for a reason before committing
      return;
    }
    move(next);
  }

  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-3 transition-colors hover:border-[var(--border-muted)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-[13px] font-medium text-[var(--text-primary)]">
            {bookmark.title ?? "Untitled role"}
          </h4>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--text-secondary)]">
            <span className="truncate">{bookmark.company ?? "Unknown company"}</span>
            {bookmark.location && (
              <span className="inline-flex items-center gap-0.5 text-[var(--text-tertiary)]">
                <MapPin className="h-3 w-3" />
                {bookmark.location}
              </span>
            )}
          </div>
        </div>
        {bookmark.match_percentage != null && (
          <span className="shrink-0 rounded-md bg-[var(--bg-overlay)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)]">
            {bookmark.match_percentage}
          </span>
        )}
      </div>

      {bookmark.status === "closed" && bookmark.close_reason && (
        <div className="mt-2 inline-flex rounded-md bg-[var(--danger-400)]/10 px-1.5 py-0.5 text-[10.5px] text-[var(--danger-400)] ring-1 ring-inset ring-[var(--danger-400)]/25">
          {CLOSE_REASON_LABELS[bookmark.close_reason]}
        </div>
      )}

      {/* Move control */}
      {pendingClose ? (
        <CloseReasonPicker
          disabled={isPending}
          onConfirm={(r) => move("closed", r)}
          onCancel={() => setPendingClose(false)}
        />
      ) : (
        <div className="mt-2.5">
          <label className="sr-only" htmlFor={`move-${bookmark.id}`}>
            Move {bookmark.title ?? "bookmark"} to a different stage
          </label>
          <select
            id={`move-${bookmark.id}`}
            value={bookmark.status}
            disabled={isPending}
            onChange={(e) => onPickStatus(e.target.value as BookmarkStatus)}
            className="w-full rounded-md border border-[var(--border-muted)] bg-[var(--bg-overlay)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            {BOOKMARK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === bookmark.status ? `● ${STATUS_LABELS[s]}` : `Move to ${STATUS_LABELS[s]}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {showNotes ? (
        <NotesEditor
          bookmarkId={bookmark.id}
          initial={bookmark.notes ?? ""}
          onDone={() => setShowNotes(false)}
        />
      ) : (
        bookmark.notes && (
          <p className="mt-2 whitespace-pre-wrap rounded-md bg-[var(--bg-overlay)]/50 px-2 py-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {bookmark.notes}
          </p>
        )
      )}

      {error && <p className="mt-1.5 text-[11px] text-[var(--danger-400)]">{error}</p>}

      <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <StickyNote className="h-3 w-3" />
            {bookmark.notes ? "Edit note" : "Note"}
          </button>
          <DeleteButton id={bookmark.id} />
        </div>
        {bookmark.job_url && (
          <a
            href={bookmark.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  );
}

function CloseReasonPicker({
  onConfirm,
  onCancel,
  disabled,
}: {
  onConfirm: (reason: CloseReason) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [reason, setReason] = useState<CloseReason>(CLOSE_REASONS[0]);
  return (
    <div className="mt-2.5 rounded-md border border-[var(--danger-400)]/25 bg-[var(--danger-400)]/[0.04] p-2">
      <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        Why is this closing?
      </div>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as CloseReason)}
        className="w-full rounded-md border border-[var(--border-muted)] bg-[var(--bg-overlay)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {CLOSE_REASONS.map((r) => (
          <option key={r} value={r}>
            {CLOSE_REASON_LABELS[r]}
          </option>
        ))}
      </select>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-md px-2 py-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason)}
          disabled={disabled}
          className="rounded-md bg-[var(--danger-400)]/15 px-2 py-1 text-[11px] font-medium text-[var(--danger-400)] hover:bg-[var(--danger-400)]/25 outline-none focus-visible:ring-2 focus-visible:ring-[rgba(248,113,113,0.45)] disabled:opacity-50"
        >
          Close it
        </button>
      </div>
    </div>
  );
}

function NotesEditor({
  bookmarkId,
  initial,
  onDone,
}: {
  bookmarkId: number;
  initial: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(bookmarkId));
      fd.set("notes", value);
      const res = await updateBookmarkNotesAction(fd);
      if (res.ok) {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="mt-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Recruiter name, next step, salary range…"
        className="w-full resize-none rounded-md border border-[var(--border-muted)] bg-[var(--bg-overlay)] px-2 py-1.5 text-[11.5px] leading-relaxed text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-2 py-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-md bg-[var(--accent-500)]/15 px-2 py-1 text-[11px] font-medium text-[var(--accent-300)] ring-1 ring-inset ring-[var(--accent-500)]/40 hover:bg-[var(--accent-500)]/25 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  );
}

function DeleteButton({ id }: { id: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      await deleteBookmarkAction(fd);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md px-1.5 py-1 text-[10.5px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="rounded-md bg-[var(--danger-400)]/15 px-1.5 py-1 text-[10.5px] font-medium text-[var(--danger-400)] hover:bg-[var(--danger-400)]/25 outline-none focus-visible:ring-2 focus-visible:ring-[rgba(248,113,113,0.45)] disabled:opacity-50"
        >
          Remove
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label="Remove bookmark"
      className="inline-flex items-center rounded-md px-1.5 py-1 text-[10.5px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--danger-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Trash2 className="h-3 w-3" />
    </button>
  );
}
