import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { CvForm } from "./cv-form";

export const metadata: Metadata = {
  title: "Upload your CV",
};

export default async function CvOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_text, cv_file_path, cv_uploaded_at")
    .eq("user_id", user.id)
    .single();

  return (
    <AppShell email={user.email}>
      <div className="mb-8 animate-fade-in-up">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Your CV
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--text-secondary)]">
          We score every job we find against your CV. Upload a PDF or DOCX, or
          paste the text directly. You can update it any time.
        </p>
      </div>

      <CvForm
        initialText={profile?.cv_text ?? ""}
        initialPath={profile?.cv_file_path ?? null}
        initialUploadedAt={profile?.cv_uploaded_at ?? null}
      />
    </AppShell>
  );
}
