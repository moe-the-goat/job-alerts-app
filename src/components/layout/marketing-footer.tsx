import { Logo } from "@/components/brand/logo";

export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-[var(--border-subtle)]">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6 text-xs text-[var(--text-tertiary)]">
        <Logo size="sm" />
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--success-400)]" />
          Private beta · invite-only
        </div>
      </div>
    </footer>
  );
}
