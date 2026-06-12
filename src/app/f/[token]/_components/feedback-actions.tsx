"use client";

import * as React from "react";
import { Bookmark, Check, EyeOff, Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type EmailFeedbackType =
  | "applied"
  | "bookmarked"
  | "not_relevant"
  | "block_company";

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

  async function act(type: EmailFeedbackType) {
    if (pending || given.has(type)) return;
    if (type === "block_company") {
      const confirmed = window.confirm(
        `Block ${company ?? "this company"}? Their postings stop appearing in your results.`,
      );
      if (!confirmed) return;
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
        }),
      });
      if (!res.ok) {
        setError(messageFor(res.status));
        return;
      }
      setGiven((prev) => new Set(prev).add(type));
    } catch {
      setError("Network problem — try again.");
    } finally {
      setPending(null);
    }
  }

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
                  ? "bg-[var(--sage-400)]/12 text-[var(--sage-400)] ring-1 ring-inset ring-[var(--sage-400)]/40"
                  : destructive
                    ? "bg-[var(--surface-raised)] text-[var(--terracotta-400)] shadow-[var(--shadow-raised)]"
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
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[var(--terracotta-400)]">
          {error}
        </p>
      )}
    </div>
  );
}
