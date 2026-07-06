/**
 * selectAutoSearchTerms — the curated, deduped, capped term list that paths
 * seed searches from (Tier 5c).
 */
import { describe, it, expect } from "vitest";
import {
  MAX_AUTO_SEARCHES,
  selectAutoSearchTerms,
  PATH_SEARCH_TERMS,
} from "@/app/preferences/constants";

describe("selectAutoSearchTerms", () => {
  it("returns the full curated list for a single path", () => {
    expect(selectAutoSearchTerms(["backend"])).toEqual(PATH_SEARCH_TERMS.backend);
  });

  it("dedupes terms shared across paths (case-insensitive)", () => {
    // backend and fullstack both seed the generic "Software Engineer".
    const terms = selectAutoSearchTerms(["backend", "fullstack"]);
    const lower = terms.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length); // no dupes
    expect(lower).toContain("software engineer");
  });

  it("covers EVERY chosen path before any path gets a second term (round-robin)", () => {
    // The old sequential fill gave 5-path users zero searches for the later
    // paths — the exact "my paths aren't covered" bug. Each path's strongest
    // term must survive the cap.
    const paths = ["backend", "ai_ml", "data_engineering", "data_science", "data_analysis"];
    const terms = selectAutoSearchTerms(paths).map((t) => t.toLowerCase());
    for (const slug of paths) {
      expect(terms).toContain(PATH_SEARCH_TERMS[slug][0].toLowerCase());
    }
  });

  it("caps the total at MAX_AUTO_SEARCHES (curated, not exhaustive)", () => {
    const all = selectAutoSearchTerms([
      "backend",
      "frontend",
      "fullstack",
      "mobile",
      "ai_ml",
      "devops",
      "qa",
    ]);
    expect(all.length).toBe(MAX_AUTO_SEARCHES);
  });

  it("ignores unknown slugs and returns [] for none", () => {
    expect(selectAutoSearchTerms(["not_a_path"])).toEqual([]);
    expect(selectAutoSearchTerms([])).toEqual([]);
  });
});
