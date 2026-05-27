import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";

describe("<Input />", () => {
  it("links label to input via htmlFor / id", () => {
    render(<Input label="Email" placeholder="you@x.com" />);
    const input = screen.getByLabelText("Email");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("uses a caller-supplied id when given", () => {
    render(<Input id="explicit-id" label="Email" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "explicit-id");
  });

  it("renders a hint", () => {
    render(<Input label="Email" hint="Use your work address." />);
    expect(screen.getByText("Use your work address.")).toBeInTheDocument();
  });

  it("renders an error and marks the input as invalid", () => {
    render(<Input label="Email" error="Required." />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Required.")).toBeInTheDocument();
  });

  it("wires aria-describedby to the hint/error message", () => {
    render(<Input label="Email" error="Required." />);
    const input = screen.getByLabelText("Email");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent("Required.");
  });
});
