"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, GitBranch, Save } from "lucide-react";
import { saveGithubAction, type GithubState } from "@/app/actions/github";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "./section-heading";

interface GithubSectionProps {
  initialUsername: string;
}

export function GithubSection({ initialUsername }: GithubSectionProps) {
  const [state, action] = useActionState<GithubState | undefined, FormData>(
    saveGithubAction,
    undefined,
  );

  return (
    <section className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
      <SectionHeading
        step="5"
        title="GitHub (optional)"
        subtitle="Connect your public GitHub and we fold your projects and languages into how jobs are matched to you."
      />

      <form
        action={action}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-6 space-y-4"
      >
        <Input
          name="github_username"
          label="GitHub username"
          defaultValue={initialUsername}
          placeholder="e.g. octocat"
          rightSlot={<GitBranch className="h-3.5 w-3.5" />}
          hint="Public repositories only. Clear the field and save to disconnect."
          autoComplete="off"
          spellCheck={false}
        />

        {state?.error && <Feedback variant="error" message={state.error} />}
        {state?.ok && state.message && (
          <Feedback variant="success" message={state.message} />
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {initialUsername ? `Connected as @${initialUsername}.` : "Not connected."}
          </span>
          <SaveButton saved={Boolean(state?.ok)} />
        </div>
      </form>
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
      {pending ? "Saving…" : showSaved ? "Saved" : "Save GitHub"}
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
