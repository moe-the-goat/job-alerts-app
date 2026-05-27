import Link from "next/link";
import { Logo } from "@/components/brand/logo";
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
          <Link href="/dashboard" className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-md">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            {email && (
              <span className="hidden sm:inline text-sm text-[var(--text-secondary)]">
                {email}
              </span>
            )}
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
