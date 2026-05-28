"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bookmark,
  Check,
  EyeOff,
  Loader2,
  MapPinOff,
  MoreHorizontal,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { FEEDBACK_TYPES, type FeedbackType } from "../_lib/types";

interface FeedbackButtonsProps {
  jobResultId: number;
  submitted: FeedbackType[];
}

interface ChipMeta {
  type: FeedbackType;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
}

const CHIPS: ChipMeta[] = [
  { type: "applied", label: "Applied", icon: Check },
  { type: "bookmarked", label: "Bookmark", icon: Bookmark },
  { type: "not_relevant", label: "Not for me", icon: EyeOff },
  { type: "block_company", label: "Block company", icon: Shield, destructive: true },
  { type: "wrong_location", label: "Wrong location", icon: MapPinOff },
  { type: "other", label: "Other", icon: MoreHorizontal },
];

export function FeedbackButtons({
  jobResultId,
  submitted,
}: FeedbackButtonsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimistic, addOptimistic] = useOptimistic<FeedbackType[], FeedbackType>(
    submitted,
    (state, next) => (state.includes(next) ? state : [...state, next]),
  );
  const [activeChip, setActiveChip] = useState<FeedbackType | null>(null);

  function send(type: FeedbackType) {
    if (optimistic.includes(type)) return; // append-only — re-clicking a sent type is a no-op
    setError(null);
    setActiveChip(type);
    startTransition(async () => {
      addOptimistic(type);
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_result_id: jobResultId,
            feedback_type: type,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        // Re-fetch the server state so the optimistic value is replaced by
        // the real one (and any side-effects like the bookmark land too).
        router.refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Something went wrong.";
        setError(message);
      } finally {
        setActiveChip(null);
      }
    });
  }

  // Sanity check: catch any drift between the buttons we render and the
  // enum the API will accept. Throws at module load, never at runtime.
  if (CHIPS.length !== FEEDBACK_TYPES.length) {
    throw new Error(
      `FeedbackButtons CHIPS (${CHIPS.length}) and FEEDBACK_TYPES (${FEEDBACK_TYPES.length}) drifted.`,
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {CHIPS.map(({ type, label, icon: Icon, destructive }) => {
          const isActive = optimistic.includes(type);
          const isLoading = pending && activeChip === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => send(type)}
              disabled={isActive || isLoading}
              aria-pressed={isActive}
              className={[
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
                "disabled:cursor-default",
                isActive
                  ? destructive
                    ? "bg-[var(--danger-400)]/15 text-[var(--danger-400)] ring-1 ring-inset ring-[var(--danger-400)]/30"
                    : "bg-[var(--accent-500)]/15 text-[var(--accent-300)] ring-1 ring-inset ring-[var(--accent-500)]/30"
                  : "bg-[var(--bg-overlay)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)] hover:text-[var(--text-primary)] hover:ring-[var(--border-strong)]",
              ].join(" ")}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              {label}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="inline-flex items-center gap-1 text-[10.5px] text-[var(--danger-400)]">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}
