/**
 * htmlToText — the plain-text fallback for transactional mail.
 *
 * These emails carry the invite/claim link, so they must never go out
 * HTML-only (a long-standing spam signal) and the links must survive into the
 * text part, or a plain-text reader gets a message they can't act on.
 */
import { describe, it, expect } from "vitest";
import { htmlToText, redactEmail } from "@/lib/email-smtp";

describe("htmlToText", () => {
  it("keeps the words and surfaces link targets", () => {
    const out = htmlToText(
      '<h2>You\'re in</h2><p>Set up your account <a href="https://app.test/claim?c=1">here</a>.</p>',
    );
    expect(out).toContain("You're in");
    expect(out).toContain("here (https://app.test/claim?c=1)");
  });

  it("strips every tag and decodes entities", () => {
    const out = htmlToText("<p>Tom &amp; Jerry &lt;3</p><style>p{color:red}</style>");
    expect(out).toContain("Tom & Jerry <3");
    expect(out).not.toContain("<p>");
    expect(out).not.toContain("color:red"); // style block dropped, not inlined
  });

  it("turns block ends into line breaks instead of running text together", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
  });

  it("handles empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});

describe("redactEmail", () => {
  it("hides the local-part in logs", () => {
    expect(redactEmail("mohaabuhijleh@gmail.com")).toBe("m***h@gmail.com");
    expect(redactEmail("ab@x.com")).toBe("a***@x.com");
    expect(redactEmail("nonsense")).toBe("<invalid>");
  });
});
