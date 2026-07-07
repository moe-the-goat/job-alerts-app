import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { buttonStyles } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="relative z-20 w-full">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden sm:inline-flex h-9 items-center rounded-md px-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Sign in
          </Link>
          <Link href="/signup" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Request access
          </Link>
        </nav>
      </div>
    </header>
  );
}
