"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Mail, Save } from "lucide-react";
import {
  FREQUENCY_HOURS,
  savePreferencesAction,
  type FrequencyHours,
  type PrefState,
} from "@/app/actions/preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SectionHeading } from "./section-heading";

interface PreferencesSectionProps {
  initialEmail: string;
  initialFrequency: number;
  initialActive: boolean;
  nextRunAt: string | null;
}

export function PreferencesSection({
  initialEmail,
  initialFrequency,
  initialActive,
  nextRunAt,
}: PreferencesSectionProps) {
  const [state, action] = useActionState<PrefState | undefined, FormData>(
    savePreferencesAction,
    undefined,
  );

  const safeInitialFreq = FREQUENCY_HOURS.includes(initialFrequency as FrequencyHours)
    ? (initialFrequency as FrequencyHours)
    : 24;

  const [frequency, setFrequency] = useState<FrequencyHours>(safeInitialFreq);
  const [active, setActive] = useState(initialActive);

  return (
    <section className="animate-fade-in-up" style={{ animationDelay: "60ms" }}>
      <SectionHeading
        step="1"
        title="Delivery"
        subtitle="Where the morning email lands and how often it runs."
      />

      <form
        action={action}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-6 space-y-6"
      >
        <Input
          name="notification_email"
          type="email"
          label="Notification email"
          defaultValue={initialEmail}
          autoComplete="email"
          placeholder="you@example.com"
          rightSlot={<Mail className="h-3.5 w-3.5" />}
          required
        />

        <div>
          <div className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
            Frequency
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FREQUENCY_HOURS.map((hrs) => (
              <FrequencyCard
                key={hrs}
                hours={hrs}
                selected={frequency === hrs}
                onSelect={() => setFrequency(hrs)}
              />
            ))}
          </div>
          <input type="hidden" name="frequency_hours" value={frequency} />
        </div>

        <Switch
          name="is_active"
          checked={active}
          onCheckedChange={setActive}
          label={active ? "Active" : "Paused"}
          description={
            active
              ? "The pipeline runs on schedule and your inbox keeps receiving the morning email."
              : "Nothing runs. Flip this back on whenever you want alerts to resume."
          }
        />

        {state?.error && (
          <FormFeedback variant="error" message={state.error} />
        )}
        {state?.ok && state.message && (
          <FormFeedback variant="success" message={state.message} />
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-5">
          <p className="text-xs text-[var(--text-tertiary)]">
            {nextRunAt
              ? `Next run scheduled for ${formatLocal(nextRunAt)}.`
              : "First run starts the next cron tick after you save."}
          </p>
          <SaveButton />
        </div>
      </form>
    </section>
  );
}

function FrequencyCard({
  hours,
  selected,
  onSelect,
}: {
  hours: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = FREQ_META[hours];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "group flex flex-col items-start rounded-lg border px-3 py-3 text-left transition-all duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
        selected
          ? "border-[var(--accent-500)]/60 bg-[var(--accent-500)]/10 ring-1 ring-[var(--accent-500)]/30"
          : "border-[var(--border-muted)] bg-[var(--bg-elevated)]/60 hover:border-[var(--border-strong)] hover:bg-[var(--bg-overlay)]/80",
      ].join(" ")}
    >
      <div
        className={[
          "text-[13.5px] font-medium",
          selected
            ? "text-[var(--accent-300)]"
            : "text-[var(--text-primary)]",
        ].join(" ")}
      >
        {meta.label}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
        {meta.hint}
      </div>
    </button>
  );
}

const FREQ_META: Record<number, { label: string; hint: string }> = {
  1: { label: "Hourly", hint: "Debug only" },
  24: { label: "Daily", hint: "Recommended" },
  48: { label: "Every 2 days", hint: "Lower volume" },
  168: { label: "Weekly", hint: "Quietest" },
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} size="md">
      {!pending && <Save className="h-4 w-4" />}
      {pending ? "Saving…" : "Save preferences"}
    </Button>
  );
}

function FormFeedback({
  variant,
  message,
}: {
  variant: "error" | "success";
  message: string;
}) {
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

function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
