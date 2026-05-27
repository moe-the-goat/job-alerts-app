"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, KanbanSquare } from "lucide-react";

const TABS = [
  { href: "/dashboard/feedback", label: "Feedback", icon: Inbox },
  { href: "/dashboard/tracker", label: "Tracker", icon: KanbanSquare },
] as const;

export function WorkspaceTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Workspace tabs"
      className="flex items-center gap-1 border-b border-[var(--border-subtle)]"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "relative inline-flex items-center gap-2 px-4 py-3 text-sm transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] rounded-t-md",
              active
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-px h-px bg-[var(--accent-500)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
