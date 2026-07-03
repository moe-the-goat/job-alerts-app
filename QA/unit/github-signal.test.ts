/**
 * Pure github-signal helpers (Tier 6a): username validation + repo→digest.
 */
import { describe, it, expect } from "vitest";
import {
  isValidGithubUsername,
  buildGithubSummary,
  type GithubRepo,
} from "@/lib/github-signal";

describe("isValidGithubUsername", () => {
  it("accepts valid handles", () => {
    for (const u of ["moe-the-goat", "octocat", "a", "a1-b2-c3"]) {
      expect(isValidGithubUsername(u)).toBe(true);
    }
  });
  it("rejects invalid handles", () => {
    for (const u of ["", "-lead", "trail-", "has space", "a--b", "x".repeat(40), "under_score"]) {
      expect(isValidGithubUsername(u)).toBe(false);
    }
  });
});

describe("buildGithubSummary", () => {
  it("summarizes languages and top original projects", () => {
    const repos: GithubRepo[] = [
      { name: "rag-engine", language: "Python", description: "RAG over docs", stargazers_count: 40 },
      { name: "portfolio", language: "TypeScript", description: "personal site", stargazers_count: 3 },
      { name: "py-utils", language: "Python", description: "", stargazers_count: 1 },
    ];
    const out = buildGithubSummary(repos);
    expect(out).toContain("Languages:");
    expect(out).toContain("Python");
    // Highest-starred original repo leads and carries its description.
    expect(out).toContain("rag-engine (Python): RAG over docs");
  });

  it("ignores forks and archived repos", () => {
    const repos: GithubRepo[] = [
      { name: "forked-thing", language: "Go", fork: true, stargazers_count: 999 },
      { name: "archived-thing", language: "C", archived: true, stargazers_count: 999 },
      { name: "mine", language: "Rust", description: "real project", stargazers_count: 2 },
    ];
    const out = buildGithubSummary(repos);
    expect(out).toContain("mine (Rust)");
    expect(out).not.toContain("forked-thing");
    expect(out).not.toContain("archived-thing");
  });

  it("returns empty when there are no original repos", () => {
    expect(buildGithubSummary([{ name: "f", fork: true }])).toBe("");
    expect(buildGithubSummary([])).toBe("");
  });
});
