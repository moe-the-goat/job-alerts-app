import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
  /**
   * "default" renders the wordmark in the primary text color (for light
   * surfaces); "onMast" renders it in the masthead foreground so it reads on
   * the navy masthead. The mark itself is fixed brand color in both tones.
   */
  tone?: "default" | "onMast";
}

export function Logo({
  size = "md",
  href = "/",
  className,
  tone = "default",
}: LogoProps) {
  const sizes = {
    sm: { mark: "h-5 w-5", text: "text-sm" },
    md: { mark: "h-6 w-6", text: "text-[15px]" },
    lg: { mark: "h-7 w-7", text: "text-base" },
  } as const;
  const s = sizes[size];

  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight",
        tone === "onMast"
          ? "text-[var(--mast-fg)]"
          : "text-[var(--text-primary)]",
        s.text,
        className,
      )}
    >
      <LogoMark className={s.mark} />
      <span>Job Alerts</span>
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
 * The mark: the "horizon tile" — a sun half-risen over a navy horizon inside a
 * rounded app tile. It literalizes the product story (results delivered at
 * sunrise) and reads at every size, from favicon to email avatar. Its brand
 * colors are fixed literals in both themes — a logo is constant — so the navy
 * tile and amber sun do NOT read from tokens. The horizon band is drawn as a
 * path with rounded bottom corners so it never pokes past the tile's radius.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      fill="none"
    >
      {/* sky tile */}
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="#1f3a5f" />
      {/* the rising sun — its lower half is hidden by the horizon band below */}
      <circle cx="12" cy="13.5" r="4.2" fill="#e0801f" />
      {/* horizon band: square top, bottom corners rounded to the tile radius */}
      <path
        d="M2 13.5 L22 13.5 L22 16.5 A5.5 5.5 0 0 1 16.5 22 L7.5 22 A5.5 5.5 0 0 1 2 16.5 Z"
        fill="#0d1b30"
      />
    </svg>
  );
}
