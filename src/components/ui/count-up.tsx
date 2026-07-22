"use client";

import * as React from "react";

// Layout effect on the client (runs before paint, so no flash of the final
// number), plain effect on the server (never runs) to avoid the SSR warning.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * Counts a number up from 0 to `value` once on mount (~800ms, ease-out). SSR
 * and the no-JS state render the final value, so it degrades cleanly; reduced
 * motion jumps straight to the final value.
 */
export function CountUp({
  value,
  className,
  durationMs = 800,
}: {
  value: number;
  className?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = React.useState(value);

  useIsoLayoutEffect(() => {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduce || value <= 0) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    setDisplay(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Count once on mount; a changed value just re-runs the count.
  }, [value, durationMs]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
