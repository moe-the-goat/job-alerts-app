"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, KanbanSquare, LineChart } from "lucide-react";

const TABS = [
  { href: "/dashboard/feedback", label: "Feedback", icon: Inbox },
  { href: "/dashboard/tracker", label: "Tracker", icon: KanbanSquare },
  { href: "/dashboard/insights", label: "Insights", icon: LineChart },
] as const;

export function WorkspaceTabs() {
  const pathname = usePathname();
  const activeIndex = Math.max(
    0,
    TABS.findIndex(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
    ),
  );

  return (
    <nav
      aria-label="Workspace tabs"
      className="relative inline-grid grid-cols-3 items-center rounded-[10px] bg-[var(--surface-recessed)] p-1"
    >
      {/* The sliding thumb — a white pill that glides under the active tab. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 rounded-[7px] bg-[var(--bg-elevated)] shadow-[var(--shadow-raised)]"
        style={{
          width: "calc((100% - 0.5rem) / 3)",
          transform: `translateX(calc(${activeIndex} * 100%))`,
          transition:
            "transform var(--motion-base) var(--ease-spring)",
        }}
      />
      {TABS.map(({ href, label, icon: Icon }, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "relative z-10 inline-flex items-center justify-center gap-2 rounded-[7px] px-4 py-2 text-sm transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
              active
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
