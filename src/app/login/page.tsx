import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link:
    "That sign-in link is invalid or has expired. Try signing in below or request a new link.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError = params.error ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see today's matches."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="font-medium text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm initialError={initialError} />
    </AuthShell>
  );
}
