/**
 * Locks the run-selection logic that decides which run /dashboard/feedback
 * shows by default. The priority is intentional:
 *   1. Honor an explicit ?run=<id> if the user owns it.
 *   2. Most-recent successful run with approved > 0 (the meaningful default).
 *   3. Any most-recent run (so failed / running / empty states still render).
 *   4. null when the user has never had a run.
 */
import { describe, it, expect } from "vitest";
import { pickActiveRun } from "@/app/dashboard/(workspace)/feedback/_lib/feedback-data";
import type { RunSummary } from "@/app/dashboard/(workspace)/feedback/_lib/types";

function run(over: Partial<RunSummary>): RunSummary {
  return {
    id: 1,
    status: "success",
    started_at: "2026-05-27T09:00:00Z",
    approved: 5,
    ...over,
  };
}

describe("pickActiveRun", () => {
  it("returns null when there are no runs", () => {
    expect(pickActiveRun([], null)).toBeNull();
    expect(pickActiveRun([], 42)).toBeNull();
  });

  it("honors a requested id when it matches a run the user owns", () => {
    const runs = [run({ id: 3 }), run({ id: 2 }), run({ id: 1 })];
    expect(pickActiveRun(runs, 2)?.id).toBe(2);
  });

  it("falls back when the requested id doesn't match (e.g., guessing in the URL)", () => {
    const runs = [run({ id: 3, approved: 4 })];
    expect(pickActiveRun(runs, 999)?.id).toBe(3);
  });

  it("prefers the most recent success-with-approved over more recent failures", () => {
    const runs: RunSummary[] = [
      run({ id: 10, status: "failed", approved: 0, started_at: "2026-05-27T10:00:00Z" }),
      run({ id: 9, status: "success", approved: 0, started_at: "2026-05-27T09:00:00Z" }),
      run({ id: 8, status: "success", approved: 7, started_at: "2026-05-27T08:00:00Z" }),
    ];
    expect(pickActiveRun(runs, null)?.id).toBe(8);
  });

  it("returns the most recent run when no success-with-approved exists (so failed-state still renders)", () => {
    const runs: RunSummary[] = [
      run({ id: 2, status: "failed", approved: 0, started_at: "2026-05-27T10:00:00Z" }),
      run({ id: 1, status: "running", approved: 0, started_at: "2026-05-27T09:00:00Z" }),
    ];
    expect(pickActiveRun(runs, null)?.id).toBe(2);
  });
});
