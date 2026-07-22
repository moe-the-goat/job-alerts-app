import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { SignOutButton } from "@/app/dashboard/sign-out-button";

type MastheadVariant = "marketing" | "back" | "app";

interface MastheadProps {
  variant: MastheadVariant;
  email?: string | null;
}

/**
 * The one navy masthead, shared by every shell so the brand keeps a fixed
 * anchor across route transitions. Full-width --mast bar; content aligns to the
 * same max-w-6xl column the pages use. The theme toggle lives here on every
 * screen. The right side changes by variant, but every existing control
 * (sign-in, home, sign-out) is preserved.
 */
export function Masthead({ variant, email }: MastheadProps) {
  return (
    <header className="w-full bg-[var(--mast)]">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Logo href={variant === "app" ? "/dashboard" : "/"} tone="onMast" />
        <nav className="flex items-center gap-1.5">
          {variant === "marketing" && (
            <>
              <ThemeToggle tone="onMast" />
              <Link
                href="/login"
                className="hidden h-9 items-center rounded-md px-3 text-sm text-[var(--mast-fg-dim)] outline-none transition-colors hover:text-[var(--mast-fg)] focus-visible:ring-2 focus-visible:ring-white/40 sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-9 items-center rounded-[10px] bg-[var(--highlight-400)] px-3.5 text-sm font-medium text-[#231303] outline-none transition-all duration-150 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white/50 motion-safe:active:scale-[0.985]"
              >
                Request access
              </Link>
            </>
          )}

          {variant === "back" && (
            <>
              <ThemeToggle tone="onMast" />
              <Link
                href="/"
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-[var(--mast-fg-dim)] outline-none transition-colors hover:text-[var(--mast-fg)] focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Home
              </Link>
            </>
          )}

          {variant === "app" && (
            <>
              {email && (
                <span className="hidden text-sm text-[var(--mast-fg-dim)] sm:inline">
                  {email}
                </span>
              )}
              <ThemeToggle tone="onMast" />
              <SignOutButton tone="onMast" />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
