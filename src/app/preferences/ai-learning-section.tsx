"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Save, Sparkles } from "lucide-react";
import { savePreferenceNoteAction } from "@/app/actions/preferences";
import type { PrefState } from "./constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "./section-heading";

const MAX_NOTE_LENGTH = 1000;

interface AiLearningSectionProps {
  /** Auto-derived summary of what the AI inferred from this user's feedback
   *  (preferences.candidate_preferences). Read-only; regenerated each cycle. */
  learnedSummary: string;
  /** The user's own steering note (preferences.preference_note). Editable. */
  initialNote: string;
}

export function AiLearningSection({ learnedSummary, initialNote }: AiLearningSectionProps) {
  const [state, action] = useActionState<PrefState | undefined, FormData>(
    savePreferenceNoteAction,
    undefined,
  );
  const [note, setNote] = useState(initialNote);
  const summary = learnedSummary.trim();

  return (
    <section className="animate-fade-in-up" style={{ animationDelay: "120ms" }}>
      <SectionHeading
        step="4"
        title="How the AI scores you"
        subtitle="What it has learned from your feedback — and your own steering."
      />

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-6 space-y-6">
        {/* Read-only: what the AI learned from feedback */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-400)]" />
            What we&apos;ve learned about you
          </div>
          {summary ? (
            <p className="whitespace-pre-line rounded-lg bg-[var(--surface-recessed)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)] shadow-[var(--shadow-recessed)]">
              {summary}
            </p>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--border-muted)] px-3 py-3 text-[12.5px] leading-relaxed text-[var(--text-tertiary)]">
              Nothing yet. As you react to jobs (applied / not-for-me / block), the
              AI builds a picture of what you want and shows it here.
            </p>
          )}
        </div>

        {/* Editable: the user's own steering note */}
        <form action={action} className="space-y-3">
          <Textarea
            name="preference_note"
            label="Your note to the AI"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
            rows={4}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="e.g. Prioritize internships and junior roles. Avoid crypto and commission-only sales. I strongly prefer fully-remote."
            hint="Plain language. This is folded into every job's score on the next run."
          />

          {state?.error && <Feedback variant="error" message={state.error} />}
          {state?.ok && state.message && <Feedback variant="success" message={state.message} />}

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {note.length}/{MAX_NOTE_LENGTH}
            </span>
            <SaveButton saved={Boolean(state?.ok)} />
          </div>
        </form>
      </div>
    </section>
  );
}

function SaveButton({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  const showSaved = saved && !pending;
  return (
    <Button
      type="submit"
      loading={pending}
      size="md"
      className={
        showSaved
          ? "ring-2 ring-[var(--success-400)]/50 ring-offset-2 ring-offset-[var(--bg-base)]"
          : undefined
      }
    >
      {!pending &&
        (showSaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />)}
      {pending ? "Saving…" : showSaved ? "Saved" : "Save note"}
    </Button>
  );
}

function Feedback({ variant, message }: { variant: "error" | "success"; message: string }) {
  const Icon = variant === "error" ? AlertCircle : CheckCircle2;
  const color =
    variant === "error" ? "text-[var(--danger-400)]" : "text-[var(--success-400)]";
  return (
    <p className={`flex items-start gap-1.5 text-xs leading-relaxed ${color}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
