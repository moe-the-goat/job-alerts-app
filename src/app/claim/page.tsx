import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = {
  title: "Set up your account",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the approval email's "Set up your account" link. Carries no
 * token — it's safe for email scanners to pre-fetch. The user requests a
 * one-time code here themselves, sidestepping the invite-link-consumed-by-
 * scanner problem (see claim-form.tsx).
 *
 * ?email=<addr> just pre-fills the field as a convenience; it's not trusted as
 * auth — the code sent to that inbox is the only credential.
 */
export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthShell
      title="Set up your account"
      subtitle="You're approved. Enter your email and we'll send you a one-time code to finish setting up."
    >
      <ClaimForm initialEmail={email ?? ""} />
    </AuthShell>
  );
}
