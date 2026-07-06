/**
 * <StatsStrip /> — the run-status strip at the top of the workspace.
 * Locks the three live states a manual run moves through:
 *   starting (dispatch fired, no runs row yet) → running (with elapsed
 *   time) → finished (absolute finish time + duration). A run the user
 *   triggers must be VISIBLE the whole way — this strip is that signal.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { StatsStrip } from "@/app/dashboard/(workspace)/_components/stats-strip";
import type { LastRun } from "@/app/dashboard/_lib/dashboard-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function run(over: Partial<LastRun> = {}): LastRun {
  return {
    id: 1,
    status: "success",
    started_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    ended_at: new Date(Date.now() - 2 * 3600_000 + 38 * 60_000).toISOString(),
    scraped: 120,
    filtered: 40,
    ai_evaluated: 30,
    approved: 6,
    lower_ranked: 10,
    ...over,
  };
}

describe("<StatsStrip />", () => {
  it("shows the 'starting' state as soon as a dispatch is pending, even over an old run", () => {
    const { container } = render(
      <StatsStrip
        lastRun={run()}
        nextRunAt={null}
        pendingDispatchAt={new Date(Date.now() - 3 * 60_000).toISOString()}
      />,
    );
    expect(container.textContent).toMatch(/Run starting/);
    expect(container.textContent).toMatch(/requested 3m ago/);
    expect(container.textContent).toMatch(/35–40 min/);
    // The old run's summary must NOT show — the fresh dispatch outranks it.
    expect(container.textContent).not.toMatch(/Last run/);
  });

  it("shows a live elapsed time while a run is in progress", () => {
    const { container } = render(
      <StatsStrip
        lastRun={run({
          status: "running",
          started_at: new Date(Date.now() - 12 * 60_000).toISOString(),
          ended_at: null,
        })}
        nextRunAt={null}
      />,
    );
    expect(container.textContent).toMatch(/Run in progress/);
    expect(container.textContent).toMatch(/running for 12m/);
  });

  it("shows when a finished run ended and how long it took", () => {
    const { container } = render(<StatsStrip lastRun={run()} nextRunAt={null} />);
    expect(container.textContent).toMatch(/Last run · Success/);
    // Time is Jerusalem-pinned; a weekday prefix appears if it crossed midnight.
    expect(container.textContent).toMatch(/finished .*?\d{2}:\d{2}/);
    expect(container.textContent).toMatch(/took 38m/);
  });

  it("keeps the waiting-for-first-run empty state", () => {
    const { container } = render(<StatsStrip lastRun={null} nextRunAt={null} />);
    expect(container.textContent).toMatch(/Waiting for the first run/);
  });
});
