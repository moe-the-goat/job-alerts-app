import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
}

export function Logo({ size = "md", href = "/", className }: LogoProps) {
  const sizes = {
    sm: { mark: "h-5 w-5", text: "text-sm" },
    md: { mark: "h-6 w-6", text: "text-[15px]" },
    lg: { mark: "h-7 w-7", text: "text-base" },
  } as const;
  const s = sizes[size];

  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight text-[var(--text-primary)]",
        s.text,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-block",
          s.mark,
          "rounded-md bg-gradient-to-br from-[var(--accent-400)] via-[var(--accent-500)] to-[#a855f7]",
          "shadow-[0_0_24px_-4px_rgba(99,102,241,0.6)]",
        )}
      >
        <span className="absolute inset-0 rounded-md ring-1 ring-inset ring-white/10" />
      </span>
      <span>
        job<span className="text-[var(--text-secondary)]">·</span>alerts
      </span>
    </span>
  );

  if (!href) return inner;
  return (
    <Link
      href={href}
      className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-md"
    >
      {inner}
    </Link>
  );
}
