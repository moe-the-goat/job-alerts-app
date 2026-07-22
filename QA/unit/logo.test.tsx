import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "@/components/brand/logo";

describe("<Logo />", () => {
  it("links to / by default", () => {
    render(<Logo />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/");
  });

  it("accepts a custom href", () => {
    render(<Logo href="/dashboard" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/dashboard");
  });

  it("renders without a link wrapper when href is empty", () => {
    render(<Logo href="" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the wordmark", () => {
    render(<Logo />);
    // Daybreak wordmark is the title-case "Job Alerts".
    expect(screen.getByText("Job Alerts")).toBeInTheDocument();
  });
});
