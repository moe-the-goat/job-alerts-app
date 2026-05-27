import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { EmailPreview } from "@/components/marketing/email-preview";
import { buttonStyles } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />

      <main className="relative flex-1 overflow-hidden">
        <div className="sunrise" aria-hidden />

        <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-12 pb-20 sm:pt-20 sm:pb-28 lg:pt-24">
          <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-12">
            {/* Left — the pitch */}
            <div className="lg:col-span-6">
              <p
                className="animate-fade-in inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]"
              >
                <span className="h-px w-6 bg-[var(--accent-500)]" />
                Private beta
              </p>

              <h1
                className="animate-fade-in-up mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-[56px]"
                style={{ animationDelay: "80ms" }}
              >
                Read{" "}
                <span className="text-[var(--accent-400)]">four</span> jobs a
                morning,{" "}
                <span className="whitespace-nowrap">not four hundred.</span>
              </h1>

              <p
                className="animate-fade-in-up mt-6 max-w-md text-[15.5px] leading-relaxed text-[var(--text-secondary)] sm:text-base"
                style={{ animationDelay: "160ms" }}
              >
                Every morning, an AI scores nine job boards against your CV and
                emails you the handful that actually fit. The rest never reach
                your inbox.
              </p>

              <div
                className="animate-fade-in-up mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center"
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

              {/* Tiny meta row — one factual line, no logos / no fake quotes */}
              <p
                className="animate-fade-in mt-10 max-w-md text-[12.5px] leading-relaxed text-[var(--text-tertiary)]"
                style={{ animationDelay: "320ms" }}
              >
                Built by one engineer for friends in the same hunt.
                Currently scoring{" "}
                <span className="font-mono text-[var(--text-secondary)]">~400</span>{" "}
                jobs/day across LinkedIn, Indeed, YC, and six ATS platforms.
              </p>
            </div>

            {/* Right — the artifact */}
            <div
              className="animate-fade-in-up lg:col-span-6"
              style={{ animationDelay: "200ms" }}
            >
              <EmailPreview />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
