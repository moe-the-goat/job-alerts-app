"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Mail, Save } from "lucide-react";
import { savePreferencesAction } from "@/app/actions/preferences";
import {
  EXPERIENCE_LEVELS,
  FREQUENCY_HOURS,
  type ExperienceLevel,
  type FrequencyHours,
  type PrefState,
} from "./constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SectionHeading } from "./section-heading";

interface PreferencesSectionProps {
  initialEmail: string;
  initialFrequency: number;
  initialActive: boolean;
  initialMinMatch: number;
  initialExperienceLevel: string;
  nextRunAt: string | null;
}

// Target seniority the user is aiming for. Entry keeps the aggressive junior
// filter; mid/senior let senior roles through for the AI to score.
const EXPERIENCE_PRESETS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "entry", label: "Entry", hint: "Intern / junior" },
  { value: "mid", label: "Mid", hint: "2–5 years" },
  { value: "senior", label: "Senior", hint: "5+ / lead" },
];

// Preset minimum-match floors for the email digest. 0 = send everything that
// passed AI scoring; higher = quieter inbox, only the strongest matches.
const MIN_MATCH_PRESETS: { value: number; label: string; hint: string }[] = [
  { value: 0, label: "Off", hint: "All matches" },
  { value: 50, label: "50%+", hint: "Light filter" },
  { value: 65, label: "65%+", hint: "Balanced" },
  { value: 80, label: "80%+", hint: "Top only" },
];

function nearestPreset(n: number): number {
  // Snap an arbitrary stored value to the closest preset so the UI always
  // reflects a chip even if the value was set elsewhere.
  let best = MIN_MATCH_PRESETS[0].value;
  let bestDist = Infinity;
  for (const p of MIN_MATCH_PRESETS) {
    const d = Math.abs(p.value - n);
    if (d < bestDist) {
      bestDist = d;
      best = p.value;
    }
  }
  return best;
}

export function PreferencesSection({
  initialEmail,
  initialFrequency,
  initialActive,
  initialMinMatch,
  initialExperienceLevel,
  nextRunAt,
}: PreferencesSectionProps) {
  const [state, action] = useActionState<PrefState | undefined, FormData>(
    savePreferencesAction,
    undefined,
  );

  const safeInitialFreq = FREQUENCY_HOURS.includes(initialFrequency as FrequencyHours)
    ? (initialFrequency as FrequencyHours)
    : 24;
  const safeInitialLevel = EXPERIENCE_LEVELS.includes(
    initialExperienceLevel as ExperienceLevel,
  )
    ? (initialExperienceLevel as ExperienceLevel)
    : "entry";

  const [frequency, setFrequency] = useState<FrequencyHours>(safeInitialFreq);
  const [active, setActive] = useState(initialActive);
  const [minMatch, setMinMatch] = useState<number>(nearestPreset(initialMinMatch));
  const [level, setLevel] = useState<ExperienceLevel>(safeInitialLevel);

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

        <div>
          <div className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
            Minimum match
          </div>
          <p className="mb-2 text-[11px] text-[var(--text-tertiary)]">
            Only email jobs scoring at or above this. Quieter inbox, fewer
            borderline matches. Your dashboard still shows everything.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MIN_MATCH_PRESETS.map((p) => (
              <MinMatchCard
                key={p.value}
                label={p.label}
                hint={p.hint}
                selected={minMatch === p.value}
                onSelect={() => setMinMatch(p.value)}
              />
            ))}
          </div>
          <input type="hidden" name="min_match_percentage" value={minMatch} />
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
            Experience level
          </div>
          <p className="mb-2 text-[11px] text-[var(--text-tertiary)]">
            The seniority you&apos;re targeting. Entry keeps senior roles out; mid
            or senior let them through and score them against your CV.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {EXPERIENCE_PRESETS.map((p) => (
              <MinMatchCard
                key={p.value}
                label={p.label}
                hint={p.hint}
                selected={level === p.value}
                onSelect={() => setLevel(p.value)}
              />
            ))}
          </div>
          <input type="hidden" name="experience_level" value={level} />
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
          <SaveButton saved={Boolean(state?.ok)} />
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

function MinMatchCard({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
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
          selected ? "text-[var(--accent-300)]" : "text-[var(--text-primary)]",
        ].join(" ")}
      >
        {label}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{hint}</div>
    </button>
  );
}

const FREQ_META: Record<number, { label: string; hint: string }> = {
  1: { label: "Hourly", hint: "Debug only" },
  24: { label: "Daily", hint: "Recommended" },
  48: { label: "Every 2 days", hint: "Lower volume" },
  168: { label: "Weekly", hint: "Quietest" },
};

function SaveButton({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  // Kinetic save: Save → Saving… → Saved ✓ (success ring) so the user sees
  // the write land, not just a toast off to the side.
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
      {pending ? "Saving…" : showSaved ? "Saved" : "Save preferences"}
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
