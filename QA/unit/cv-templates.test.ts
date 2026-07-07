/**
 * cv-templates — the structured-CV parser, plain-text serializer, and the
 * HTML template renderers. These turn one tailored-CV JSON into copyable text
 * and a print-ready document, so the locks here are: robust parsing, faithful
 * text, valid HTML per template, HTML-escaping of real data, and link safety.
 */
import { describe, it, expect } from "vitest";
import {
  CV_TEMPLATES,
  SAMPLE_CV,
  cvToText,
  parseTailoredCv,
  renderCvHtml,
  type TailoredCv,
} from "@/lib/cv-templates";

const GOOD: TailoredCv = {
  name: "Jordan Lee",
  headline: "Backend Engineer",
  contact: {
    location: "Remote",
    email: "jordan@example.com",
    links: [{ label: "github.com/jl", url: "https://github.com/jl" }],
  },
  summary: "Ships tested services end to end.",
  sections: [
    { kind: "skills", heading: "Skills", skills: [{ label: "Languages", value: "Python, Go" }] },
    {
      kind: "entries",
      heading: "Projects",
      entries: [
        { title: "Pipeline X", date: "2026", tech: "Python", bullets: ["Did a real thing"] },
      ],
    },
    { kind: "list", heading: "Certifications", items: ["Some Cert 2025"] },
  ],
};

describe("parseTailoredCv", () => {
  it("parses a clean JSON object", () => {
    const cv = parseTailoredCv(JSON.stringify(GOOD));
    expect(cv?.name).toBe("Jordan Lee");
    expect(cv?.sections).toHaveLength(3);
  });

  it("strips a ```json code fence", () => {
    const cv = parseTailoredCv("```json\n" + JSON.stringify(GOOD) + "\n```");
    expect(cv?.name).toBe("Jordan Lee");
  });

  it("tolerates prose around the JSON object", () => {
    const cv = parseTailoredCv("Here is your CV:\n" + JSON.stringify(GOOD) + "\nHope it helps!");
    expect(cv?.name).toBe("Jordan Lee");
  });

  it("returns null for non-JSON or wrong shape", () => {
    expect(parseTailoredCv("not json at all")).toBeNull();
    expect(parseTailoredCv(JSON.stringify({ name: "x" }))).toBeNull(); // no sections
    expect(parseTailoredCv(JSON.stringify({ sections: [] }))).toBeNull(); // no name
  });

  it("drops malformed sections but keeps valid ones", () => {
    const mixed = {
      name: "A",
      sections: [
        { kind: "skills", heading: "S", skills: "nope" }, // invalid
        { kind: "list", heading: "Certs", items: ["ok"] }, // valid
      ],
    };
    const cv = parseTailoredCv(JSON.stringify(mixed));
    expect(cv?.sections).toHaveLength(1);
    expect(cv?.sections[0].heading).toBe("Certs");
  });
});

describe("cvToText", () => {
  it("renders name, headings, and bullets as readable text", () => {
    const text = cvToText(GOOD);
    expect(text).toContain("Jordan Lee");
    expect(text).toContain("PROJECTS");
    expect(text).toContain("Did a real thing");
    expect(text).toContain("Languages: Python, Go");
  });
});

describe("renderCvHtml", () => {
  it("produces a full HTML document per template, carrying the data", () => {
    for (const t of CV_TEMPLATES) {
      const html = renderCvHtml(t.id, GOOD);
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).toContain("Jordan Lee");
      expect(html).toContain("Pipeline X");
      expect(html).toContain("@page"); // print sizing present
    }
  });

  it("HTML-escapes real data so it can't break the markup", () => {
    const nasty: TailoredCv = {
      ...GOOD,
      name: "Eve <script>alert(1)</script>",
    };
    const html = renderCvHtml("classic", nasty);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not render a non-http link as a clickable href", () => {
    const cv: TailoredCv = {
      ...GOOD,
      contact: { links: [{ label: "evil", url: "javascript:alert(1)" }] },
    };
    const html = renderCvHtml("modern", cv);
    expect(html).not.toContain("javascript:alert(1)");
    expect(html).toContain("evil"); // shown as plain text
  });

  it("falls back to the classic template for an unknown id", () => {
    // @ts-expect-error — exercising the runtime fallback path
    const html = renderCvHtml("does-not-exist", GOOD);
    expect(html).toContain("Jordan Lee");
  });
});

describe("SAMPLE_CV (picker placeholder)", () => {
  it("ships no real personal data", () => {
    expect(SAMPLE_CV.name).toBe("Your Name");
    expect(SAMPLE_CV.contact.email).toBe("you@example.com");
  });
});
