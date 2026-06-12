import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import {
  groupByOrigin,
  ResultsGrid,
} from "@/app/dashboard/(workspace)/feedback/_components/results-grid";
import type { JobWithFeedback } from "@/app/dashboard/(workspace)/feedback/_lib/types";

// The mock router must be a STABLE singleton, exactly like the real
// next/navigation useRouter. A fresh object per render cascades through
// sendFeedback → adapter registration → provider state → re-render and
// loops forever.
const refresh = vi.fn();
const stableRouter = { push: vi.fn(), refresh };
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
}));

function job(overrides: Partial<JobWithFeedback> = {}): JobWithFeedback {
  return {
    id: 1,
    run_id: 10,
    title: "Frontend Engineer",
    company: "Acme",
    location: "Remote",
    job_url: "https://example.com/job/1",
    match_percentage: 91,
    tech_fit: 90,
    experience_fit: 85,
    logistics_fit: 95,
    ai_verdict: "Strong React overlap with the CV.",
    description_excerpt: "We are hiring a frontend engineer…",
    compensation: null,
    effort: "low",
    suspicious: false,
    pre_flagged_low_quality: false,
    pre_flagged_trusted: false,
    similarity: 0.91,
    created_at: "2026-06-12T06:00:00Z",
    feedback: [],
    ...overrides,
  };
}

function renderGrid(jobs: JobWithFeedback[]) {
  return render(
    <WorkspaceProvider>
      <ResultsGrid jobs={jobs} />
    </WorkspaceProvider>,
  );
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 99 }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("groupByOrigin", () => {
  it("returns a single untitled-origin section before W1 data exists", () => {
    const sections = groupByOrigin([job({ id: 1 }), job({ id: 2 })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].jobs).toHaveLength(2);
  });

  it("splits local and global once origin is persisted", () => {
    const sections = groupByOrigin([
      job({ id: 1, origin: "global" }),
      job({ id: 2, origin: "local" }),
      job({ id: 3, origin: "local" }),
    ]);
    expect(sections.map((s) => s.label)).toEqual([
      "Local (Palestinian)",
      "Global / Remote",
    ]);
    expect(sections[0].jobs).toHaveLength(2);
    expect(sections[1].jobs).toHaveLength(1);
  });

  it("keeps untagged rows with the global section when a split exists", () => {
    const sections = groupByOrigin([
      job({ id: 1, origin: "local" }),
      job({ id: 2 }), // pre-W1 row
    ]);
    const global = sections.find((s) => s.label === "Global / Remote");
    expect(global?.jobs).toHaveLength(1);
  });
});

describe("<ResultsGrid />", () => {
  it("renders one row per job with title and company", () => {
    renderGrid([job(), job({ id: 2, title: "Data Engineer", company: "Beta" })]);
    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Data Engineer")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("expands a row in place on click, revealing the AI verdict", () => {
    renderGrid([job()]);
    expect(screen.queryByTestId("row-detail-1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Frontend Engineer"));
    const detail = screen.getByTestId("row-detail-1");
    expect(detail).toHaveTextContent("Strong React overlap with the CV.");
    expect(detail).toHaveTextContent("We are hiring a frontend engineer…");
    // Second click collapses.
    fireEvent.click(screen.getByText("Frontend Engineer"));
    expect(screen.queryByTestId("row-detail-1")).not.toBeInTheDocument();
  });

  it("moves focus with J and posts feedback with A", async () => {
    renderGrid([job(), job({ id: 2, title: "Data Engineer" })]);
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "a" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ job_result_id: 1, feedback_type: "applied" }),
      }),
    );
    // Optimistic chip lands without waiting for the server.
    expect(await screen.findByText("applied")).toBeInTheDocument();
  });

  it("asks for confirmation before blocking a company", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderGrid([job()]);
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "b" });
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("rolls the optimistic chip back when the server rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 })),
    );
    renderGrid([job()]);
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "a" });
    expect(await screen.findByText("nope")).toBeInTheDocument();
    expect(screen.queryByText("applied")).not.toBeInTheDocument();
  });

  it("flags suspicious rows with the severity badge", () => {
    renderGrid([job({ suspicious: true })]);
    expect(screen.getByText("Suspicious")).toBeInTheDocument();
  });

  it("toggles full-screen focus mode", () => {
    renderGrid([job()]);
    const grid = screen.getByTestId("results-grid");
    expect(grid.className).not.toContain("fixed");
    fireEvent.click(screen.getByRole("button", { name: "Focus mode" }));
    expect(screen.getByTestId("results-grid").className).toContain("fixed");
    fireEvent.click(screen.getByRole("button", { name: "Exit focus mode" }));
    expect(screen.getByTestId("results-grid").className).not.toContain("fixed");
  });
});
