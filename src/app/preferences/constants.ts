// Plain (non-"use server") module for values + types shared between the
// preferences server actions and the client components that render the form.
//
// These MUST NOT live in actions/preferences.ts: that file is "use server",
// which marks every export as a Server Action reference. A client component
// importing a constant array from there receives an action stub instead of
// the array — so `FREQUENCY_HOURS.includes(...)` throws
// "includes is not a function" at runtime. Keeping the constants here, in an
// ordinary module, lets both the client and the server action import the real
// values.

export type PrefState = {
  ok: boolean;
  error?: string;
  message?: string;
};

export const FREQUENCY_HOURS = [1, 24, 48, 168] as const;
export type FrequencyHours = (typeof FREQUENCY_HOURS)[number];

// Target seniority the user is aiming for. Drives the worker's per-user
// seniority filters (an entry-level user has senior roles filtered out; a
// mid/senior user keeps them) and the AI verdict prompt. Default "entry".
export const EXPERIENCE_LEVELS = ["entry", "mid", "senior"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

// Career paths / tracks the user targets (multi-select). From Tier 5b these
// drive scrape targeting, per-user role weighting, filtering, and the verdict
// prompt. Curated on purpose — each maps to known-good search terms + a role
// tier worker-side, so the list stays short and legible rather than exhaustive.
export const CAREER_PATHS = [
  { slug: "backend", label: "Backend", hint: "APIs, services, databases" },
  { slug: "frontend", label: "Frontend", hint: "Web UI, React / Vue" },
  { slug: "fullstack", label: "Full-Stack", hint: "End-to-end web" },
  { slug: "mobile", label: "Mobile", hint: "iOS / Android" },
  { slug: "ai_ml", label: "AI / ML", hint: "LLMs, models, GenAI" },
  { slug: "data_science", label: "Data Science", hint: "Modeling, analytics" },
  { slug: "data_analysis", label: "Data Analysis", hint: "BI, dashboards, SQL" },
  { slug: "data_engineering", label: "Data Engineering", hint: "Pipelines, warehouses" },
  { slug: "devops", label: "DevOps / SRE", hint: "Cloud, CI/CD, infra" },
  { slug: "qa", label: "QA / Test", hint: "Test automation" },
  { slug: "security", label: "Security", hint: "AppSec, infosec" },
  { slug: "embedded", label: "Embedded", hint: "Firmware, systems" },
  { slug: "game", label: "Game Dev", hint: "Engines, gameplay" },
] as const;
export type CareerPathSlug = (typeof CAREER_PATHS)[number]["slug"];
export const CAREER_PATH_SLUGS: readonly string[] = CAREER_PATHS.map((p) => p.slug);

// Curated search terms each path seeds (Tier 5c). Short on purpose — a handful
// of strong queries per path beats dozens of near-duplicates that just multiply
// scraping + embedding cost (see the cost analysis). The seeded set is deduped
// and capped at MAX_AUTO_SEARCHES total.
export const PATH_SEARCH_TERMS: Record<string, string[]> = {
  backend: ["Backend Developer", "Backend Engineer"],
  frontend: ["Frontend Developer", "React Developer"],
  fullstack: ["Full Stack Developer", "Full Stack Engineer"],
  mobile: ["Mobile Developer", "Android Developer", "iOS Developer"],
  ai_ml: ["Machine Learning Engineer", "AI Engineer"],
  data_science: ["Data Scientist"],
  data_analysis: ["Data Analyst"],
  data_engineering: ["Data Engineer"],
  devops: ["DevOps Engineer", "Site Reliability Engineer"],
  qa: ["QA Engineer", "Test Automation Engineer"],
  security: ["Security Engineer"],
  embedded: ["Embedded Software Engineer"],
  game: ["Game Developer"],
};
export const MAX_AUTO_SEARCHES = 6;

/** Deduped, capped list of search terms for the chosen paths (Tier 5c seeding).
 *  Curated over exhaustive — dedupe shared terms, cap the total. */
export function selectAutoSearchTerms(paths: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of paths) {
    for (const term of PATH_SEARCH_TERMS[slug] ?? []) {
      const key = term.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(term);
      }
    }
  }
  return out.slice(0, MAX_AUTO_SEARCHES);
}

export const JOB_BOARDS = [
  "linkedin",
  "indeed",
  "glassdoor",
  "zip_recruiter",
  "google",
] as const;
export type JobBoard = (typeof JOB_BOARDS)[number];

export const JOB_TYPES = [
  "fulltime",
  "internship",
  "contract",
  "parttime",
] as const;
export type JobType = (typeof JOB_TYPES)[number];
