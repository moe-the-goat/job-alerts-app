import * as React from "react";
import { cn } from "@/lib/utils";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /** Keys to render, e.g. ["G", "R"] renders two caps joined by "then". */
  keys: string[];
  /** "then" renders a sequence (G then R); "+" renders a chord (Ctrl+K). */
  join?: "then" | "+";
}

/**
 * Physical-keycap badge. Shown next to actions in menus and tooltips so
 * shortcuts are taught ambiently — no tutorial overlay.
 */
export function Kbd({ keys, join = "+", className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn("inline-flex items-center gap-1 align-middle", className)}
      {...props}
    >
      {keys.map((key, i) => (
        <React.Fragment key={`${key}-${i}`}>
          {i > 0 && (
            <span className="text-[9px] text-[var(--text-tertiary)]">
              {join === "then" ? "then" : "+"}
            </span>
          )}
          <span
            className={cn(
              "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1",
              "bg-[var(--bg-overlay)] font-mono text-[10px] font-medium text-[var(--text-secondary)]",
              "ring-1 ring-inset ring-[var(--border-muted)]",
              "shadow-[0_1px_0_0_rgba(205,217,229,0.08)_inset,0_1.5px_0_0_rgba(0,0,0,0.5)]",
            )}
          >
            {key}
          </span>
        </React.Fragment>
      ))}
    </kbd>
  );
}
