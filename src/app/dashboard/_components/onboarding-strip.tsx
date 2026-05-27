import Link from "next/link";
import { ArrowRight, CheckCircle2, Hammer } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import type { DashboardState } from "../_lib/dashboard-state";

interface OnboardingStripProps {
  state: DashboardState;
}

export function OnboardingStrip({ state }: OnboardingStripProps) {
  const { user, hasCv, hasPrefs, activeSearches } = state;
  const step = !hasCv ? "cv" : !hasPrefs || activeSearches === 0 ? "prefs" : "ready";

  return (
    <>
      <div className="animate-fade-in-up max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-muted)] bg-[var(--bg-elevated)]/60 px-3 py-1 text-xs text-[var(--text-secondary)]">
          <Hammer className="h-3 w-3 text-[var(--accent-400)]" />
          Getting set up
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Welcome,{" "}
          <span className="text-[var(--accent-400)]">
            {user.email?.split("@")[0]}
          </span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
          Two quick steps and the morning email turns on. You can come back and
          change any of this later.
        </p>
      </div>

      <div
        className="animate-fade-in-up mt-10 space-y-3"
        style={{ animationDelay: "60ms" }}
      >
        <OnboardingStep
          index={1}
          title="Upload your CV"
          body="We score every job we find against this. Required."
          done={hasCv}
          active={step === "cv"}
          href="/onboarding/cv"
          ctaLabel={hasCv ? "Update" : "Upload CV"}
        />
        <OnboardingStep
          index={2}
          title="Set your preferences"
          body="Where to send the email, how often it runs, and what to search for."
          done={hasPrefs && activeSearches > 0}
          active={step === "prefs"}
          href="/preferences"
          ctaLabel={
            hasPrefs && activeSearches > 0
              ? "Edit"
              : hasPrefs
                ? "Add a search"
                : "Set preferences"
          }
        />
      </div>
    </>
  );
}

function OnboardingStep({
  index,
  title,
  body,
  done,
  active,
  href,
  ctaLabel,
}: {
  index: number;
  title: string;
  body: string;
  done: boolean;
  active: boolean;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-4 rounded-xl border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between",
        done
          ? "border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40"
          : active
            ? "border-[var(--accent-500)]/30 bg-gradient-to-br from-[var(--accent-500)]/10 to-[var(--bg-elevated)]/60"
            : "border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            done
              ? "bg-[var(--success-400)]/10 text-[var(--success-400)] ring-[var(--success-400)]/30"
              : active
                ? "bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-[var(--accent-500)]/30"
                : "bg-[var(--bg-overlay)] text-[var(--text-tertiary)] ring-[var(--border-muted)]",
          ].join(" ")}
        >
          {done ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <span className="font-mono text-[12px] font-medium">{index}</span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-medium text-[var(--text-primary)]">
              {title}
            </div>
            {done && (
              <span className="rounded-md bg-[var(--success-400)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--success-400)]">
                Done
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
            {body}
          </p>
        </div>
      </div>
      <Link
        href={href}
        className={buttonStyles({
          variant: done ? "ghost" : active ? "primary" : "secondary",
          size: "md",
        })}
      >
        {ctaLabel}
        {!done && <ArrowRight className="h-4 w-4" />}
      </Link>
    </div>
  );
}
