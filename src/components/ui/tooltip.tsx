"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  /** Tooltip body. Strings get default styling; nodes render as-is. */
  content: React.ReactNode;
  children: React.ReactElement;
  /** Where the bubble floats relative to the trigger. */
  side?: "top" | "bottom";
  /** Hover intent delay before showing, in ms. */
  delay?: number;
  className?: string;
}

/**
 * Headless tooltip — no positioning library. The trigger is wrapped in an
 * inline-flex span that owns hover/focus state; the bubble floats above it
 * with the overlay shadow token for clear z-separation.
 *
 * Shows on hover (after a short intent delay) and on keyboard focus
 * immediately. Hidden from the accessibility tree only while closed;
 * announced via aria-describedby while open.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  delay = 250,
  className,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = React.useId();

  const show = React.useCallback(
    (immediate: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      if (immediate) {
        setOpen(true);
      } else {
        timer.current = setTimeout(() => setOpen(true), delay);
      }
    },
    [delay],
  );

  const hide = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") hide();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, hide]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "row-detail-enter pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            "rounded-md bg-[var(--bg-overlay)]/95 px-2 py-1 text-[11px] leading-snug text-[var(--text-secondary)]",
            "shadow-[var(--shadow-overlay)] backdrop-blur-sm",
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
