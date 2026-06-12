import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MatchScore } from "@/components/ui/match-score";

describe("<MatchScore />", () => {
  it("renders an em dash for unscored rows", () => {
    render(<MatchScore score={null} />);
    expect(screen.getByLabelText("Not scored")).toHaveTextContent("—");
  });

  it("renders a 0 score with no filled segments", () => {
    render(<MatchScore score={0} />);
    const gauge = screen.getByRole("img", { name: "Match 0%" });
    expect(gauge).toBeInTheDocument();
    expect(gauge.querySelectorAll('[data-filled="true"]')).toHaveLength(0);
  });

  it("renders a 100 score with every segment filled", () => {
    render(<MatchScore score={100} />);
    const gauge = screen.getByRole("img", { name: "Match 100%" });
    expect(gauge.querySelectorAll('[data-filled="true"]')).toHaveLength(5);
  });

  it("clamps out-of-range scores into 0–100", () => {
    render(<MatchScore score={140} />);
    expect(screen.getByRole("img", { name: "Match 100%" })).toBeInTheDocument();
  });

  it("shows the sub-score breakdown when present", () => {
    render(
      <MatchScore score={88} tech={90} experience={80} logistics={70} />,
    );
    // Tooltip opens immediately on keyboard focus (no hover delay).
    fireEvent.focus(screen.getByRole("img", { name: "Match 88%" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Tech");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Experience");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Logistics");
  });
});
