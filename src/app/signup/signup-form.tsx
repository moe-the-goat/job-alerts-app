"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { signupAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthState | undefined = undefined;

export function SignupForm() {
  const [state, formAction] = useActionState(signupAction, initialState);

  // After a successful request, swap the form for a "request received" panel.
  if (state?.ok && state.message) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-overlay)] text-[var(--success-400)] ring-1 ring-inset ring-[var(--border-muted)]">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-medium text-[var(--text-primary)]">
          Request received
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
        Job Alerts is in a small closed beta. Request access below — we&rsquo;ll
        review it and, if approved, email you an invite to finish setting up.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Input
          name="first_name"
          type="text"
          label="First name"
          placeholder="Ada"
          autoComplete="given-name"
          required
        />
        <Input
          name="last_name"
          type="text"
          label="Last name"
          placeholder="Lovelace"
          autoComplete="family-name"
          required
        />
      </div>
      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      <Input
        name="note"
        type="text"
        label="Anything we should know? (optional)"
        placeholder="A line about why you'd like access"
        maxLength={500}
      />
      {state?.error && (
        <p className="text-xs leading-relaxed text-[var(--danger-400)]">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} size="lg" width="full">
      {pending ? "Sending request…" : "Request access"}
      {!pending && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}
