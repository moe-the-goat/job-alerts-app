import { Masthead } from "@/components/layout/masthead";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, footer, children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Masthead variant="back" />

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

          <div className="mt-8 rounded-xl border border-[var(--border-muted)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-raised)]">
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
