"use client";

import * as React from "react";
import {
  Bookmark,
  Check,
  EyeOff,
  Loader2,
  MessageSquarePlus,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EmailFeedbackType =
  | "applied"
  | "bookmarked"
  | "not_relevant"
  | "block_company";

const MAX_NOTE_LENGTH = 500;

interface FeedbackActionsProps {
  token: string;
  jobResultId: number;
  company: string | null;
  /** Feedback types this user already gave on this job (any device). */
  initialGiven: string[];
}

const ACTIONS: {
  type: EmailFeedbackType;
  label: string;
  icon: typeof Check;
  destructive?: boolean;
}[] = [
  { type: "applied", label: "Applied", icon: Check },
  { type: "bookmarked", label: "Save", icon: Bookmark },
  { type: "not_relevant", label: "Not for me", icon: EyeOff },
  { type: "block_company", label: "Block", icon: Shield, destructive: true },
];

function messageFor(status: number): string {
  if (status === 401 || status === 410) {
    return "This link has expired — open the dashboard to give feedback.";
  }
  if (status === 404) {
    return "This job is no longer available for feedback.";
  }
  return "Couldn't save — try again.";
}

/**
 * One-tap feedback row for the email page. Optimum for thumbs: 44px+
 * targets, the pressed state survives refresh (server hydrates
 * `initialGiven` from the feedback table), and a duplicate tap is a
 * no-op both here and in the RPC.
 *
 * The optional note stays out of the way behind an "Add a note" toggle so
 * the one-tap path is untouched. Whatever's typed rides along with the next
 * reaction; if you've already reacted, "Save note" re-sends your most recent
 * reaction carrying the note (the RPC backfills it onto the existing row).
 */
export function FeedbackActions({
  token,
  jobResultId,
  company,
  initialGiven,
}: FeedbackActionsProps) {
  const [given, setGiven] = React.useState<ReadonlySet<string>>(
    () => new Set(initialGiven),
  );
  const [pending, setPending] = React.useState<EmailFeedbackType | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteSaved, setNoteSaved] = React.useState(false);
  // The reaction a later "Save note" should re-send to backfill the note.
  // Seed from the server-hydrated reactions so a note can be attached to a
  // reaction given on another device, not just one tapped in this session.
  // block_company is excluded — re-sending it would re-trigger the confirm.
  const [lastReaction, setLastReaction] =
    React.useState<EmailFeedbackType | null>(
      () =>
        (initialGiven.find(
          (t) => t !== "block_company",
        ) as EmailFeedbackType | undefined) ?? null,
    );

  async function submit(type: EmailFeedbackType, withNote: string | null) {
    if (type === "block_company" && !given.has(type)) {
      const confirmed = window.confirm(
        `Block ${company ?? "this company"}? Their postings stop appearing in your results.`,
      );
      if (!confirmed) return false;
    }
    setPending(type);
    setError(null);
    try {
      const res = await fetch("/api/email-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          job_result_id: jobResultId,
          feedback_type: type,
          note: withNote,
        }),
      });
      if (!res.ok) {
        setError(messageFor(res.status));
        return false;
      }
      setGiven((prev) => new Set(prev).add(type));
      setLastReaction(type);
      return true;
    } catch {
      setError("Network problem — try again.");
      return false;
    } finally {
      setPending(null);
    }
  }

  async function act(type: EmailFeedbackType) {
    if (pending || given.has(type)) return;
    const trimmed = note.trim();
    const ok = await submit(type, trimmed.length > 0 ? trimmed : null);
    if (ok && trimmed.length > 0) setNoteSaved(true);
  }

  // "Save note" after a reaction already landed: re-send the latest reaction
  // so the RPC backfills the note onto the existing (duplicate) row.
  async function saveNote() {
    if (pending) return;
    const trimmed = note.trim();
    if (trimmed.length === 0 || lastReaction == null) return;
    const ok = await submit(lastReaction, trimmed);
    if (ok) setNoteSaved(true);
  }

  const hasReacted = given.size > 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACTIONS.map(({ type, label, icon: Icon, destructive }) => {
          const done = given.has(type);
          const isPending = pending === type;
          return (
            <button
              key={type}
              type="button"
              disabled={done || pending !== null}
              aria-pressed={done}
              onClick={() => act(type)}
              className={cn(
                "flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium",
                "transition-colors duration-150 motion-safe:active:scale-[0.985]",
                done
                  ? "bg-[var(--success-400)]/12 text-[var(--success-400)] ring-1 ring-inset ring-[var(--success-400)]/40"
                  : destructive
                    ? "bg-[var(--surface-raised)] text-[var(--danger-400)] shadow-[var(--shadow-raised)]"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] shadow-[var(--shadow-raised)]",
                !done && pending !== null && "opacity-50",
              )}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : done ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {done && type === "applied" ? "Applied" : label}
            </button>
          );
        })}
      </div>

      {!noteOpen ? (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {noteSaved ? "Note added — edit" : "Add a note"}
        </button>
      ) : (
        <div className="mt-2">
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value.slice(0, MAX_NOTE_LENGTH));
              setNoteSaved(false);
            }}
            maxLength={MAX_NOTE_LENGTH}
            rows={2}
            placeholder="Why? This trains tomorrow's scoring (optional)."
            className={cn(
              "w-full resize-none rounded-lg bg-[var(--surface-recessed)] px-3 py-2 text-[13px] text-[var(--text-primary)]",
              "placeholder:text-[var(--text-tertiary)] shadow-[var(--shadow-recessed)]",
              "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            )}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {hasReacted
                ? "Tap a reaction above to attach it, or save it onto your last one."
                : "Sent with your next reaction tap."}
              {note.length > 0 && ` · ${note.length}/${MAX_NOTE_LENGTH}`}
            </span>
            {hasReacted && (
              <button
                type="button"
                onClick={saveNote}
                disabled={pending !== null || note.trim().length === 0}
                className={cn(
                  "ml-2 shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                  note.trim().length === 0 || pending !== null
                    ? "text-[var(--text-tertiary)]"
                    : "bg-[var(--accent-500)] text-white hover:bg-[var(--accent-400)]",
                )}
              >
                {pending !== null ? "Saving…" : noteSaved ? "Saved" : "Save note"}
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[var(--danger-400)]">
          {error}
        </p>
      )}
    </div>
  );
}
