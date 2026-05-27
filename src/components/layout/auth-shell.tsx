import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, footer, children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Subtle ambient backdrop — single off-center glow, much softer than landing */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(246,183,59,0.45), transparent 70%)",
          }}
        />
      </div>

      <header className="relative z-10 flex h-16 items-center px-6">
        <Logo />
        <Link
          href="/"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Home
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] animate-fade-in-up">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>

          <div className="mt-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 p-6 backdrop-blur shadow-[0_24px_48px_-24px_rgba(0,0,0,0.5)]">
            {children}
          </div>

          {footer && (
            <div className="mt-6 text-center text-sm text-[var(--text-secondary)]">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
