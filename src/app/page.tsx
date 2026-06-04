import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { EmailPreview } from "@/components/marketing/email-preview";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { buttonStyles } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  // Already signed in? Send them to the dashboard instead of the public
  // marketing view — otherwise landing on "/" (e.g. via the logo) looks like
  // being logged out even though the session is intact.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />

      <main className="relative flex-1 overflow-hidden">
        <div className="sunrise" aria-hidden />

        <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-10 pb-20 sm:pt-16 sm:pb-24">
          {/* Pitch — centered, single visual focal point */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="animate-fade-in inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              <span className="h-px w-6 bg-[var(--accent-500)]" />
              Private beta
            </p>

            <h1
              className="animate-fade-in-up mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-[52px] lg:text-[60px]"
              style={{ animationDelay: "80ms" }}
            >
              Read{" "}
              <span className="text-[var(--accent-400)]">four</span> jobs a
              morning, not four hundred.
            </h1>

            <p
              className="animate-fade-in-up mx-auto mt-6 max-w-xl text-balance text-[15.5px] leading-relaxed text-[var(--text-secondary)] sm:text-base"
              style={{ animationDelay: "160ms" }}
            >
              Every morning, an AI scores nine job boards against your CV. The
              handful that match land in your inbox{" "}
              <span className="text-[var(--text-primary)]">and</span> on your
              personal dashboard — where you react and the model learns.
            </p>

            <div
              className="animate-fade-in-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href="/signup"
                className={buttonStyles({ variant: "primary", size: "lg" })}
              >
                Get my morning
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className={buttonStyles({ variant: "ghost", size: "lg" })}
              >
                I have an account
              </Link>
            </div>
          </div>

          {/* The dual artifact — same picks, two surfaces */}
          <div
            className="animate-fade-in-up relative mt-16 grid grid-cols-1 gap-8 sm:mt-20 lg:grid-cols-2 lg:gap-6"
            style={{ animationDelay: "340ms" }}
          >
            <SurfaceLabel
              eyebrow="In your inbox"
              caption="9:14 AM, every morning"
            >
              <EmailPreview />
            </SurfaceLabel>

            <SurfaceLabel
              eyebrow="And on your dashboard"
              caption="React, bookmark, track applications"
            >
              <DashboardPreview />
            </SurfaceLabel>
          </div>

          {/* Quiet footnote — one factual line, no logos / no fake quotes */}
          <p className="animate-fade-in mx-auto mt-14 max-w-xl text-center text-[12.5px] leading-relaxed text-[var(--text-tertiary)]">
            Built by one engineer for friends in the same hunt. Currently
            scoring{" "}
            <span className="font-mono text-[var(--text-secondary)]">~400</span>{" "}
            jobs/day across LinkedIn, Indeed, YC, and six ATS platforms.
          </p>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

function SurfaceLabel({
  eyebrow,
  caption,
  children,
}: {
  eyebrow: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <div className="text-[13px] font-medium text-[var(--text-primary)]">
          {eyebrow}
        </div>
        <div className="text-[11.5px] text-[var(--text-tertiary)]">
          {caption}
        </div>
      </div>
      {children}
    </div>
  );
}
