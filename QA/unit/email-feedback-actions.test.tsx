/**
 * <FeedbackActions /> — the one-tap button row on the tokenized email page.
 * Locks: POST payload shape, pressed-state hydration from the server,
 * the block-company confirm gate, and the expired-link error message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FeedbackActions } from "@/app/f/[token]/_components/feedback-actions";

const TOKEN = "t".repeat(43);

const fetchMock = vi.fn();
const confirmMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  confirmMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", confirmMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(body: object = { ok: true, id: 1, duplicate: false }) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status: 200 }),
  );
}

function renderActions(initialGiven: string[] = []) {
  return render(
    <FeedbackActions
      token={TOKEN}
      jobResultId={42}
      company="Acme"
      initialGiven={initialGiven}
    />,
  );
}

describe("<FeedbackActions />", () => {
  it("posts the exact payload and marks the button as pressed", async () => {
    fetchMock.mockReturnValue(ok());
    renderActions();

    const applied = screen.getByRole("button", { name: "Applied" });
    expect(applied).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(applied);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Applied/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/email-feedback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          token: TOKEN,
          job_result_id: 42,
          feedback_type: "applied",
          note: null,
        }),
      }),
    );
  });

  it("hydrates already-given feedback as pressed and refuses to re-send it", () => {
    renderActions(["applied"]);
    const applied = screen.getByRole("button", { name: /Applied/ });
    expect(applied).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(applied);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for confirmation before blocking a company and aborts on cancel", () => {
    confirmMock.mockReturnValue(false);
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining("Acme"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks after an accepted confirm", async () => {
    confirmMock.mockReturnValue(true);
    fetchMock.mockReturnValue(ok());
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Block" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the expired-link message on 410 and does NOT mark the button", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 410 }));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Applied" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/expired/i),
    );
    expect(
      screen.getByRole("button", { name: "Applied" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a network error when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Not for me" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/network/i),
    );
  });

  it("keeps the note hidden by default — one-tap path is untouched", () => {
    renderActions();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add a note/i }),
    ).toBeInTheDocument();
  });

  it("sends a typed note along with the next reaction", async () => {
    fetchMock.mockReturnValue(ok());
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: /add a note/i }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  too senior for me  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Not for me" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/email-feedback",
      expect.objectContaining({
        body: JSON.stringify({
          token: TOKEN,
          job_result_id: 42,
          feedback_type: "not_relevant",
          // trimmed, blanks collapsed
          note: "too senior for me",
        }),
      }),
    );
  });

  it("backfills a note onto an already-given reaction via Save note", async () => {
    fetchMock.mockReturnValue(ok());
    // User already marked Applied (hydrated as pressed) → Save note re-sends it.
    renderActions(["applied"]);

    fireEvent.click(screen.getByRole("button", { name: /add a note/i }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "applied via referral" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/email-feedback",
      expect.objectContaining({
        body: JSON.stringify({
          token: TOKEN,
          job_result_id: 42,
          feedback_type: "applied",
          note: "applied via referral",
        }),
      }),
    );
  });
});
