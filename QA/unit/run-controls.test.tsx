/**
 * <RunControls /> — the Quick Actions Run now + Reschedule buttons.
 * Locks: the "N/2 left" badge, disabled-when-exhausted, disabled-while-running,
 * the confirm dialog copy (approx minutes + cancels scheduled run), and that a
 * successful trigger calls the action + refreshes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RunControls } from "@/app/dashboard/(workspace)/_components/run-controls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const triggerMock = vi.fn();
const rescheduleMock = vi.fn();
const slotCountsMock = vi.fn();
vi.mock("@/app/actions/run", () => ({
  triggerManualRunAction: () => triggerMock(),
  rescheduleRunAction: (fd: FormData) => rescheduleMock(fd),
  getScheduleSlotCountsAction: () => slotCountsMock(),
}));

beforeEach(() => {
  refresh.mockReset();
  triggerMock.mockReset();
  rescheduleMock.mockReset();
  slotCountsMock.mockReset();
  slotCountsMock.mockResolvedValue({ ok: true, counts: {} });
});

function renderControls(over: Partial<React.ComponentProps<typeof RunControls>> = {}) {
  return render(
    <RunControls
      runsUsedToday={0}
      maxRunsPerDay={2}
      lastRunStatus={null}
      nextRunAt={null}
      {...over}
    />,
  );
}

describe("<RunControls />", () => {
  it("shows the remaining-runs badge", () => {
    renderControls({ runsUsedToday: 1, maxRunsPerDay: 2 });
    expect(screen.getByText("1/2 left")).toBeInTheDocument();
  });

  it("disables Run now when the budget is exhausted", () => {
    renderControls({ runsUsedToday: 2, maxRunsPerDay: 2 });
    const btn = screen.getByRole("button", { name: /Run now/ });
    expect(btn).toBeDisabled();
  });

  it("disables Run now and shows 'running' while a run is in flight", () => {
    renderControls({ lastRunStatus: "running" });
    const btn = screen.getByRole("button", { name: /Run now/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("disables Run now and shows 'starting' while a dispatch is warming up", () => {
    renderControls({ pendingDispatchAt: new Date().toISOString() });
    const btn = screen.getByRole("button", { name: /Run now/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText("starting")).toBeInTheDocument();
  });

  it("opens a confirm dialog with the cost/quota copy", () => {
    renderControls({ runsUsedToday: 0, maxRunsPerDay: 2 });
    fireEvent.click(screen.getByRole("button", { name: /Run now/ }));
    const dialog = screen.getByRole("dialog", { name: "Run now" });
    expect(within(dialog).getByText(/35–40 minutes/)).toBeInTheDocument();
    expect(within(dialog).getByText(/cancels today/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/2 of 2/)).toBeInTheDocument();
  });

  it("triggers the run and refreshes on success", async () => {
    triggerMock.mockResolvedValue({ ok: true, message: "Run started" });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: /Run now/ }));
    const dialog = screen.getByRole("dialog", { name: "Run now" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Run now$/ }));
    await waitFor(() => expect(triggerMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the server error and keeps the dialog open on failure", async () => {
    triggerMock.mockResolvedValue({ ok: false, error: "You've used all 2 of today's runs." });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: /Run now/ }));
    const dialog = screen.getByRole("dialog", { name: "Run now" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Run now$/ }));
    await waitFor(() =>
      expect(screen.getByText(/used all 2/i)).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("opens the reschedule dialog and saves a chosen time", async () => {
    rescheduleMock.mockResolvedValue({ ok: true });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: /Reschedule run/ }));
    const dialog = screen.getByRole("dialog", { name: "Reschedule next run" });
    // datetime-local input — set a future local time.
    const input = within(dialog).getByLabelText(/Next run/i);
    fireEvent.change(input, { target: { value: "2026-12-01T09:00" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save time/ }));
    await waitFor(() => expect(rescheduleMock).toHaveBeenCalledTimes(1));
    const fd = rescheduleMock.mock.calls[0][0] as FormData;
    expect(typeof fd.get("next_run_at")).toBe("string");
  });

  it("warns and offers a clearer hour when the chosen slot is busy", async () => {
    slotCountsMock.mockResolvedValue({ ok: true, counts: { 9: 5, 8: 0 } });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: /Reschedule run/ }));
    const dialog = screen.getByRole("dialog", { name: "Reschedule next run" });
    const input = within(dialog).getByLabelText(/Next run/i);
    fireEvent.change(input, { target: { value: "2026-12-01T09:00" } });
    // The busy caution + a "Try …— clearer" nudge appear once counts load.
    await waitFor(() =>
      expect(within(dialog).getByText(/may arrive up to/i)).toBeInTheDocument(),
    );
    expect(
      within(dialog).getByRole("button", { name: /clearer/i }),
    ).toBeInTheDocument();
  });
});
