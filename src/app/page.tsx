import Link from "next/link";
import { ArrowRight, Mail, Sparkles, Filter } from "lucide-react";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { buttonStyles } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="relative flex-1 overflow-hidden">
        <div className="ambient-glow" aria-hidden />
        <div className="grid-texture" aria-hidden />

        <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 lg:pt-32 lg:pb-40">
          {/* Eyebrow */}
          <div className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-[var(--border-muted)] bg-[var(--bg-elevated)]/60 px-3 py-1 text-xs text-[var(--text-secondary)] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-400)]" />
            Now in private beta
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-in-up mt-6 max-w-3xl text-center text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Finally,{" "}
            <span className="text-gradient">jobs that fit</span> you.
          </h1>

          {/* Sub-headline */}
          <p
            className="animate-fade-in-up mt-5 max-w-xl text-center text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg"
            style={{ animationDelay: "160ms" }}
          >
            An AI scores nine job boards against your CV every morning and
            emails you the handful that genuinely match. No noise. No
            re-reading the same listings. One quiet inbox.
          </p>

          {/* CTAs */}
          <div
            className="animate-fade-in-up mt-9 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animationDelay: "240ms" }}
          >
            <Link
              href="/signup"
              className={buttonStyles({ variant: "primary", size: "lg" })}
            >
              Request early access
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className={buttonStyles({ variant: "ghost", size: "lg" })}
            >
              I already have an account
            </Link>
          </div>

          {/* Feature trio — answers the "why is this different" question */}
          <div
            className="animate-fade-in-up mt-20 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3"
            style={{ animationDelay: "360ms" }}
          >
            <FeatureCard
              icon={<Filter className="h-4 w-4" />}
              title="9 sources, one inbox"
              body="LinkedIn, Indeed, six ATS platforms, plus YC. Deduped automatically."
            />
            <FeatureCard
              icon={<Sparkles className="h-4 w-4" />}
              title="Scored against your CV"
              body="Each job gets a tech / experience / logistics fit rating. Misses are hidden."
            />
            <FeatureCard
              icon={<Mail className="h-4 w-4" />}
              title="One email a day"
              body="Sent on your schedule. Reply with feedback — the AI learns what you actually want."
            />
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 text-left backdrop-blur transition-all duration-200 hover:border-[var(--border-muted)] hover:bg-[var(--bg-elevated)]">
      <div className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-medium text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
        {body}
      </p>
    </div>
  );
}
