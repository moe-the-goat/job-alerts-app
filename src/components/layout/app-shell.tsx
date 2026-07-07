import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { SignOutButton } from "@/app/dashboard/sign-out-button";

interface AppShellProps {
  email: string | null | undefined;
  children: React.ReactNode;
}

export function AppShell({ email, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          {/* Logo links itself to /dashboard. Previously this was wrapped in an
              outer <Link href="/dashboard"> while Logo also rendered its own
              <Link href="/"> — nested anchors (invalid HTML) where the inner "/"
              won, bouncing logged-in users to the public marketing page. */}
          <Logo href="/dashboard" />
          <div className="flex items-center gap-2">
            {email && (
              <span className="hidden sm:inline text-sm text-[var(--text-secondary)]">
                {email}
              </span>
            )}
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12">
        {children}
      </main>
    </div>
  );
}
