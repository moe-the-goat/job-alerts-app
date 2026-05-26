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

  // After successful signup, swap form out for the "check your inbox" panel.
  if (state?.ok && state.message) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-overlay)] text-[var(--success-400)] ring-1 ring-inset ring-[var(--border-muted)]">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-medium text-[var(--text-primary)]">
          Check your inbox
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      <Input
        name="password"
        type="password"
        label="Password"
        placeholder="At least 8 characters"
        autoComplete="new-password"
        minLength={8}
        required
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
      {pending ? "Creating account…" : "Create account"}
      {!pending && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}
