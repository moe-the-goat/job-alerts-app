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
 * The mark: a lowercase "j" whose dot is a rising sun — a monogram for
 * job·alerts that reads as a letter and a sunrise at once, echoing the amber
 * "·" in the wordmark. Navy stem, one warm amber sun. Scales to a favicon.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      fill="none"
    >
      {/* the rising-sun dot */}
      <circle cx="14" cy="6" r="2.35" fill="var(--highlight-400)" />
      <g stroke="var(--highlight-400)" strokeWidth="1.3" strokeLinecap="round">
        <line x1="14" y1="1.9" x2="14" y2="2.9" />
        <line x1="10.7" y1="2.9" x2="11.5" y2="3.7" />
        <line x1="17.3" y1="2.9" x2="16.5" y2="3.7" />
      </g>
      {/* the "j" stem + hook */}
      <path
        d="M14 10 V16.8 A4.2 4.2 0 0 1 5.6 16.8"
        fill="none"
        stroke="var(--accent-500)"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
