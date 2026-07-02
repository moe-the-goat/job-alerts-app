// Pure helpers for the reschedule slot-congestion hint (Tier 7). Framework-free
// so they're unit-testable and shared between the dialog and its tests.
//
// The recurring schedule is anchored to an hour-of-day (Asia/Jerusalem), so a
// "slot" is an hour 0–23. When many users land on the same hour their runs
// queue behind the shared tick and the last emails arrive a little later, so we
// warn on a crowded slot and nudge toward a clearer one — advice, never an
// automatic reassignment.

// At/above this many users on one hour we treat the slot as busy.
export const BUSY_THRESHOLD = 3;

export type Congestion = "clear" | "some" | "busy";

export function congestionLevel(count: number): Congestion {
  if (count >= BUSY_THRESHOLD) return "busy";
  if (count > 0) return "some";
  return "clear";
}

// Rough delay band for a busy hour — a couple of minutes per extra user, capped.
// Deliberately fuzzy: it sets honest expectations without pretending precision.
export function estimatedDelayMinutes(count: number): number {
  if (count < BUSY_THRESHOLD) return 0;
  return Math.min(30, count * 3);
}

// Nearest hour that's meaningfully clearer than `fromHour`. Returns null when
// the current slot isn't busy or nothing is clearer. Count dominates the choice;
// ties break toward the closest hour, wrapping around midnight.
export function suggestClearHour(
  counts: Record<number, number>,
  fromHour: number,
): number | null {
  const here = counts[fromHour] ?? 0;
  if (here < BUSY_THRESHOLD) return null;
  let best: number | null = null;
  let bestScore = Infinity;
  for (let h = 0; h < 24; h++) {
    if (h === fromHour) continue;
    const c = counts[h] ?? 0;
    if (c >= here) continue; // must actually be clearer
    const dist = Math.min(Math.abs(h - fromHour), 24 - Math.abs(h - fromHour));
    const score = c * 100 + dist; // count first, then closeness
    if (score < bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

// "9:00", "14:00" — a compact label for an hour slot.
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${h}:00`;
}
