/**
 * <AddFromResults /> — the Tracker's "Add from results" picker.
 * Locks: the picker offers the LATEST RUN's untracked jobs (with a dated
 * header + "N of M" count), filters by title/company, adds via the server
 * action, marks added rows, and shows the right empty-state copy for the
 * no-run / all-tracked / nothing-surfaced cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AddFromResults } from "@/app/dashboard/(workspace)/tracker/_components/add-from-results";
import type { BookmarkableJob } from "@/app/dashboard/(workspace)/tracker/_lib/types";

// Stable singleton router, per the project's other component tests.
const refresh = vi.fn();
const stableRouter = { push: vi.fn(), refresh };
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
}));

// The server action is replaced with a spy so no Supabase call is made.
const addBookmarkMock = vi.fn();
vi.mock("@/app/dashboard/(workspace)/tracker/actions", () => ({
  addBookmarkAction: (fd: FormData) => addBookmarkMock(fd),
}));

const RUN_AT = "2026-06-13T17:14:00.000Z";

function job(over: Partial<BookmarkableJob> = {}): BookmarkableJob {
  return {
    id: 1,
    title: "Senior Backend Engineer",
    company: "Acme",
    location: "Remote",
    match_percentage: 88,
    created_at: RUN_AT,
    ...over,
  };
}

function renderPicker(
  jobs: BookmarkableJob[],
  runStartedAt: string | null = RUN_AT,
  totalInRun = jobs.length,
) {
  const r = render(
    <AddFromResults jobs={jobs} runStartedAt={runStartedAt} totalInRun={totalInRun} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Add from results/ }));
  return r;
}

beforeEach(() => {
  refresh.mockReset();
  addBookmarkMock.mockReset();
  addBookmarkMock.mockResolvedValue({ ok: true });
});

describe("<AddFromResults />", () => {
  it("opens to the latest run's jobs with a dated header and N-of-M count", () => {
    renderPicker(
      [job({ id: 1, title: "Backend Engineer" }), job({ id: 2, title: "Data Engineer" })],
      RUN_AT,
      3, // one of the run's three valid jobs is already tracked
    );

    const dialog = screen.getByRole("dialog");
    // Header names the run and reads "2 of 3 to add".
    expect(within(dialog).getByText(/From your run on/)).toBeInTheDocument();
    expect(within(dialog).getByText(/2 of 3 to add/)).toBeInTheDocument();
    // Both untracked jobs are listed.
    expect(within(dialog).getByText("Backend Engineer")).toBeInTheDocument();
    expect(within(dialog).getByText("Data Engineer")).toBeInTheDocument();
  });

  it("filters the list by title or company", () => {
    renderPicker([
      job({ id: 1, title: "Backend Engineer", company: "Acme" }),
      job({ id: 2, title: "Frontend Developer", company: "Globex" }),
    ]);

    const filter = screen.getByPlaceholderText(/Filter by title or company/);
    fireEvent.change(filter, { target: { value: "globex" } });

    expect(screen.queryByText("Backend Engineer")).not.toBeInTheDocument();
    expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
  });

  it("adds a job through the server action and marks it Added", async () => {
    renderPicker([job({ id: 7, title: "Platform Engineer" })]);

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Added" })).toBeDisabled(),
    );
    expect(addBookmarkMock).toHaveBeenCalledTimes(1);
    const fd = addBookmarkMock.mock.calls[0][0] as FormData;
    expect(fd.get("job_result_id")).toBe("7");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the no-run empty state when the user has never run", () => {
    renderPicker([], null, 0);
    expect(
      screen.getByText(/They appear here once a run scores some jobs/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/first run hasn't produced results yet/i)).toBeInTheDocument();
  });

  it("shows the all-tracked empty state when the run's jobs are all bookmarked", () => {
    // A run that surfaced jobs (totalInRun > 0) but none remain to add.
    renderPicker([], RUN_AT, 5);
    expect(
      screen.getByText(/Every job from your latest run is already in your tracker/i),
    ).toBeInTheDocument();
  });

  it("shows the nothing-surfaced empty state when the run produced no jobs", () => {
    renderPicker([], RUN_AT, 0);
    expect(
      screen.getByText(/latest run didn't surface any jobs to add/i),
    ).toBeInTheDocument();
  });
});
