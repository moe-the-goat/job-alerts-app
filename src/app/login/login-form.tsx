"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { loginAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthState | undefined = undefined;

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const errorToShow = state?.error ?? initialError;

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
      <div>
        <Input
          name="password"
          type="password"
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          required
        />
        <div className="mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      {errorToShow && (
        <p className="text-xs leading-relaxed text-[var(--danger-400)]">
          {errorToShow}
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
      {pending ? "Signing in…" : "Sign in"}
      {!pending && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}
