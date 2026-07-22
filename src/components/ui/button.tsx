import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium " +
    "transition-all duration-150 ease-out outline-none " +
    "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] " +
    "disabled:opacity-50 disabled:pointer-events-none select-none " +
    // Quiet press feedback — a hair of scale, only when the user
    // hasn't asked for reduced motion. No glow, no elevation games.
    "motion-safe:active:scale-[0.985]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--mast)] text-white " +
          "hover:bg-[var(--accent-600)] motion-safe:hover:-translate-y-px " +
          "active:translate-y-0 active:bg-[var(--accent-700)]",
        secondary:
          "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-muted)] shadow-[var(--shadow-raised)] " +
          "hover:bg-[var(--bg-overlay)] hover:border-[var(--border-strong)] " +
          "active:shadow-[var(--shadow-recessed)]",
        // Sunrise-amber CTA — the delivery signal, reserved for marketing.
        highlight:
          "bg-[var(--highlight-400)] text-[#231303] " +
          "hover:brightness-[1.05] motion-safe:hover:-translate-y-px " +
          "active:translate-y-0 active:brightness-95",
        ghost:
          "bg-transparent text-[var(--text-secondary)] " +
          "hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
        link:
          "bg-transparent text-[var(--accent-400)] underline-offset-4 " +
          "hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-[9px]",
        md: "h-10 px-4 text-sm rounded-[10px]",
        lg: "h-11 px-5 text-[15px] rounded-[11px]",
        xl: "h-12 px-6 text-base rounded-[11px]",
      },
      width: {
        auto: "",
        full: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      width: "auto",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, width, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonStyles({ variant, size, width }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
