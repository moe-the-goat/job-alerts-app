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
      <LogoMark className={s.mark} />
      <span>
        job<span className="text-[var(--highlight-400)]">·</span>alerts
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

/**
 * The mark: a sun rising over an inbox tray — "your morning, delivered".
 * The tray + horizon are drawn in the navy accent; the sun is the one warm
 * amber note. Scales cleanly down to a 16px favicon.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      fill="none"
    >
      {/* rising sun */}
      <circle cx="12" cy="11" r="3.1" fill="var(--highlight-400)" />
      <g
        stroke="var(--highlight-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <line x1="12" y1="4.4" x2="12" y2="5.9" />
        <line x1="6.7" y1="5.7" x2="7.7" y2="6.8" />
        <line x1="16.3" y1="5.7" x2="15.3" y2="6.8" />
      </g>
      {/* inbox tray catching it */}
      <path
        d="M4 13.5h4l1.4 2.1h5.2L16 13.5h4v4.2a1.3 1.3 0 0 1-1.3 1.3H5.3A1.3 1.3 0 0 1 4 17.7z"
        fill="none"
        stroke="var(--accent-500)"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
