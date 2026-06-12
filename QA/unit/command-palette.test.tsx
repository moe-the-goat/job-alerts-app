import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  CommandPalette,
  fuzzyScore,
} from "@/components/workspace/command-palette";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";

// Stable singleton, matching the real useRouter contract — see the note
// in results-grid.test.tsx.
const push = vi.fn();
const stableRouter = { push, refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
}));

afterEach(() => push.mockClear());

describe("fuzzyScore", () => {
  it("matches everything with an empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("ranks substring matches by start position", () => {
    expect(fuzzyScore("track", "Go to Tracker")).toBe(6);
    expect(fuzzyScore("go", "Go to Tracker")).toBe(0);
  });

  it("falls back to scattered subsequence matches", () => {
    const score = fuzzyScore("gtt", "Go to Tracker");
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(100); // ranked below substrings
  });

  it("returns null when letters are missing or out of order", () => {
    expect(fuzzyScore("xyz", "Go to Tracker")).toBeNull();
    expect(fuzzyScore("rt", "tr")).toBeNull();
  });
});

describe("<CommandPalette />", () => {
  function renderPalette() {
    return render(
      <WorkspaceProvider>
        <CommandPalette />
      </WorkspaceProvider>,
    );
  }

  it("stays unmounted until Ctrl+K", () => {
    renderPalette();
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("opens on Ctrl+K and closes on Escape", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search commands"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("lists navigation commands and runs one on Enter", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByText("Go to Results")).toBeInTheDocument();
    const input = screen.getByLabelText("Search commands");
    fireEvent.change(input, { target: { value: "tracker" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/dashboard/tracker");
    // Palette closes after running a command.
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("shows an honest empty state for unmatched queries", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByLabelText("Search commands"), {
      target: { value: "zzzzqqq" },
    });
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it("navigates with the G-then-R compound shortcut", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "r" });
    expect(push).toHaveBeenCalledWith("/dashboard/feedback");
  });

  it("does not hijack G when typing in an input", () => {
    render(
      <WorkspaceProvider>
        <input aria-label="some field" />
        <CommandPalette />
      </WorkspaceProvider>,
    );
    const field = screen.getByLabelText("some field");
    field.focus();
    fireEvent.keyDown(field, { key: "g" });
    fireEvent.keyDown(field, { key: "r" });
    expect(push).not.toHaveBeenCalled();
  });
});
