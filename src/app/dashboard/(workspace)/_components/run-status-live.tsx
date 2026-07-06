"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side helpers that make the run-status strip live while a run is
 * starting or in progress. Kept tiny so the strip itself stays a server
 * component — these only tick a label and re-pull server data.
 */

/** Renders nothing; refreshes the route data on an interval so the strip
 *  moves through starting → running → finished without a manual reload. */
export function AutoRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

/** A live "Xm" / "Xh Ym" elapsed-since label that ticks every 30s. */
export function ElapsedSince({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  const label =
    min < 1 ? "under a minute" : min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
  // Server and client render moments differ by a hair — same minute, but
  // don't let React flag it.
  return <span suppressHydrationWarning>{label}</span>;
}
