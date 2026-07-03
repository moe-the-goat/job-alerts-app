"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { savePathsAction } from "@/app/actions/preferences";
import { CAREER_PATHS, type PrefState } from "./constants";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "./section-heading";

interface PathsSectionProps {
  initialPaths: string[];
}

export function PathsSection({ initialPaths }: PathsSectionProps) {
  const [state, action] = useActionState<PrefState | undefined, FormData>(
    savePathsAction,
    undefined,
  );
  const valid = new Set<string>(CAREER_PATHS.map((p) => p.slug));
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialPaths.filter((p) => valid.has(p))),
  );

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <section className="animate-fade-in-up" style={{ animationDelay: "90ms" }}>
      <SectionHeading
        step="2"
        title="Career paths"
        subtitle="The tracks you want jobs for. Pick as many as fit — they steer what we scrape and how we score."
      />

      <form
        action={action}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-6 space-y-5"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CAREER_PATHS.map((p) => (
            <PathChip
              key={p.slug}
              label={p.label}
              hint={p.hint}
              selected={selected.has(p.slug)}
              onToggle={() => toggle(p.slug)}
            />
          ))}
        </div>

        <input
          type="hidden"
          name="paths"
          value={Array.from(selected).join(",")}
        />

        {state?.error && <Feedback variant="error" message={state.error} />}
        {state?.ok && state.message && (
          <Feedback variant="success" message={state.message} />
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {selected.size === 0
              ? "No paths selected yet."
              : `${selected.size} selected`}
          </span>
          <SaveButton saved={Boolean(state?.ok)} />
        </div>
      </form>
    </section>
  );
}

function PathChip({
  label,
  hint,
  selected,
  onToggle,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={[
        "group flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-all duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
        selected
          ? "border-[var(--accent-500)]/60 bg-[var(--accent-500)]/10 ring-1 ring-[var(--accent-500)]/30"
          : "border-[var(--border-muted)] bg-[var(--bg-elevated)]/60 hover:border-[var(--border-strong)] hover:bg-[var(--bg-overlay)]/80",
      ].join(" ")}
    >
      <div
        className={[
          "text-[13px] font-medium",
          selected ? "text-[var(--accent-300)]" : "text-[var(--text-primary)]",
        ].join(" ")}
      >
        {label}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{hint}</div>
    </button>
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
        (showSaved ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        ))}
      {pending ? "Saving…" : showSaved ? "Saved" : "Save paths"}
    </Button>
  );
}

function Feedback({
  variant,
  message,
}: {
  variant: "error" | "success";
  message: string;
}) {
  const Icon = variant === "error" ? AlertCircle : CheckCircle2;
  const color =
    variant === "error"
      ? "text-[var(--danger-400)]"
      : "text-[var(--success-400)]";
  return (
    <p className={`flex items-start gap-1.5 text-xs leading-relaxed ${color}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
