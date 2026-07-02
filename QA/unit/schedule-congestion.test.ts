/**
 * Pure congestion helpers behind the reschedule "this hour is busy" hint.
 */
import { describe, it, expect } from "vitest";
import {
  BUSY_THRESHOLD,
  congestionLevel,
  estimatedDelayMinutes,
  suggestClearHour,
  formatHour,
} from "@/app/dashboard/_lib/schedule-congestion";

describe("congestionLevel", () => {
  it("classifies clear / some / busy", () => {
    expect(congestionLevel(0)).toBe("clear");
    expect(congestionLevel(1)).toBe("some");
    expect(congestionLevel(BUSY_THRESHOLD - 1)).toBe("some");
    expect(congestionLevel(BUSY_THRESHOLD)).toBe("busy");
    expect(congestionLevel(20)).toBe("busy");
  });
});

describe("estimatedDelayMinutes", () => {
  it("is zero below the busy threshold", () => {
    expect(estimatedDelayMinutes(0)).toBe(0);
    expect(estimatedDelayMinutes(BUSY_THRESHOLD - 1)).toBe(0);
  });
  it("grows with the crowd but caps at 30", () => {
    expect(estimatedDelayMinutes(BUSY_THRESHOLD)).toBeGreaterThan(0);
    expect(estimatedDelayMinutes(100)).toBe(30);
  });
});

describe("suggestClearHour", () => {
  it("returns null when the slot isn't busy", () => {
    expect(suggestClearHour({ 9: 1 }, 9)).toBeNull();
  });

  it("nudges to the nearest empty hour, ascending on a distance tie", () => {
    const counts = { 9: 5 }; // every other hour is 0 (clearer)
    // Hours 8 and 10 are both empty and equidistant; 8 (lower) wins the tie.
    expect(suggestClearHour(counts, 9)).toBe(8);
  });

  it("lets a lower count win over a closer but busier hour", () => {
    const counts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) counts[h] = 4; // everything crowded
    counts[9] = 5; // current slot, busiest
    counts[10] = 3; // closer, but still fairly crowded
    counts[15] = 2; // farther, but clearer
    expect(suggestClearHour(counts, 9)).toBe(15);
  });

  it("returns null when every other hour is at least as crowded", () => {
    const counts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) counts[h] = 5;
    expect(suggestClearHour(counts, 9)).toBeNull();
  });
});

describe("formatHour", () => {
  it("renders an hour label and wraps at 24", () => {
    expect(formatHour(9)).toBe("9:00");
    expect(formatHour(14)).toBe("14:00");
    expect(formatHour(24)).toBe("0:00");
  });
});
