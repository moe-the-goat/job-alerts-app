import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Kbd } from "@/components/ui/kbd";

describe("<Kbd />", () => {
  it("renders a single keycap", () => {
    render(<Kbd keys={["A"]} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("joins a chord with +", () => {
    render(<Kbd keys={["Ctrl", "K"]} />);
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
    expect(screen.getByText("+")).toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it('joins a sequence with "then"', () => {
    render(<Kbd keys={["G", "R"]} join="then" />);
    expect(screen.getByText("then")).toBeInTheDocument();
  });
});
