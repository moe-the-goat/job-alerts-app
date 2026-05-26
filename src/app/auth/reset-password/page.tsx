import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Set a new password",
};

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reset links create a temporary session via /auth/callback. Without one,
  // there's nothing valid to reset — send them back to start the flow over.
  if (!user) redirect("/forgot-password");

  return (
    <AuthShell
      title="Set a new password"
      subtitle="This will replace your existing password."
    >
      <ResetForm />
    </AuthShell>
  );
}
