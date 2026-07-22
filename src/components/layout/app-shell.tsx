import { Masthead } from "@/components/layout/masthead";

interface AppShellProps {
  email: string | null | undefined;
  children: React.ReactNode;
}

export function AppShell({ email, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Masthead variant="app" email={email} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12">
        {children}
      </main>
    </div>
  );
}
