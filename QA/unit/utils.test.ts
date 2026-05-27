import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn()", () => {
  it("joins multiple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("merges conflicting Tailwind classes — last one wins", () => {
    // The whole reason we use tailwind-merge over clsx alone.
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", "text-base")).toBe("text-base");
  });

  it("handles arrays and conditional objects", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});
