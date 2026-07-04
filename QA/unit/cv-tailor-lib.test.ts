/**
 * Pure CV-tailoring helpers (Tier 6b): hashing, the Jerusalem day boundary,
 * prompt builders (grounding + truncation), and the Groq call wrapper.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cvHash,
  jerusalemMidnightUtcIso,
  buildSuggestionsPrompt,
  buildRecreatePrompt,
  callTailorLlm,
  TAILOR_MODEL,
} from "@/lib/cv-tailor";

const JOB = {
  title: "Backend Engineer",
  company: "Acme",
  description: "We need Django and PostgreSQL experience.",
  verdict: "MATCH: solid Python. GAP: no Postgres shown.",
};

describe("cvHash", () => {
  it("is stable for the same text and differs for different text", () => {
    expect(cvHash("cv A")).toBe(cvHash("cv A"));
    expect(cvHash("cv A")).not.toBe(cvHash("cv B"));
    expect(cvHash("cv A")).toHaveLength(16);
  });
});

describe("jerusalemMidnightUtcIso", () => {
  it("returns the UTC instant of Jerusalem local midnight (21/22:00 UTC prior day)", () => {
    // 2026-07-15 12:00 UTC → Jerusalem is UTC+3 (summer) → local midnight
    // was 2026-07-14T21:00:00Z.
    const iso = jerusalemMidnightUtcIso(new Date("2026-07-15T12:00:00Z"));
    expect(iso).toBe("2026-07-14T21:00:00.000Z");
  });

  it("handles winter time (UTC+2)", () => {
    const iso = jerusalemMidnightUtcIso(new Date("2026-01-15T12:00:00Z"));
    expect(iso).toBe("2026-01-14T22:00:00.000Z");
  });

  it("is always at or before now", () => {
    const now = new Date();
    expect(new Date(jerusalemMidnightUtcIso(now)).getTime()).toBeLessThanOrEqual(
      now.getTime(),
    );
  });
});

describe("prompt builders", () => {
  it("suggestions prompt carries the CV, the job, and the grounding rule", () => {
    const p = buildSuggestionsPrompt("MY CV with FastAPI", JOB);
    expect(p).toContain("MY CV with FastAPI");
    expect(p).toContain("Backend Engineer");
    expect(p).toContain("Acme");
    expect(p).toContain("Django");
    expect(p).toContain("never invent");
  });

  it("recreate prompt keeps structure rules and the one-page constraint", () => {
    const p = buildRecreatePrompt("MY CV", JOB);
    expect(p).toContain("ONE PAGE");
    expect(p).toContain("section order");
    expect(p).toContain("never invent");
  });

  it("truncates an oversized CV so the prompt stays within the token budget", () => {
    const huge = "x".repeat(60000);
    expect(buildSuggestionsPrompt(huge, JOB).length).toBeLessThan(12000);
    expect(buildRecreatePrompt(huge, JOB).length).toBeLessThan(16000);
  });
});

describe("callTailorLlm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to Groq with the tailor model and returns the content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "  TAILORED  " } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await callTailorLlm("prompt", "gk_test", 1024);
    expect(out).toBe("TAILORED");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("api.groq.com");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe(TAILOR_MODEL);
    expect(body.max_tokens).toBe(1024);
    expect(body.reasoning_effort).toBe("low");
  });

  it("throws on an HTTP error and on an empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(callTailorLlm("p", "k", 512)).rejects.toThrow("429");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }),
    );
    await expect(callTailorLlm("p", "k", 512)).rejects.toThrow("empty");
  });
});
