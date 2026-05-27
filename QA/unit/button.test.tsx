import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("<Button />", () => {
  it("renders its children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("disables itself while loading and renders a spinner", () => {
    render(<Button loading>Sending</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    // Spinner has the `animate-spin` class from Loader2.
    expect(btn.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("respects the disabled prop independently of loading", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("forwards arbitrary props to the underlying button", () => {
    render(
      <Button type="submit" data-testid="x">
        Go
      </Button>,
    );
    const btn = screen.getByTestId("x");
    expect(btn).toHaveAttribute("type", "submit");
  });
});
