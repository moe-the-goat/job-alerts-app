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
  it("returns the terms for a single path", () => {
    expect(selectAutoSearchTerms(["backend"])).toEqual(PATH_SEARCH_TERMS.backend);
  });

  it("dedupes terms shared across paths (case-insensitive)", () => {
    // data_science and ai_ml both include Machine Learning Engineer.
    const terms = selectAutoSearchTerms(["ai_ml", "data_science"]);
    const lower = terms.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length); // no dupes
    expect(lower).toContain("machine learning engineer");
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
