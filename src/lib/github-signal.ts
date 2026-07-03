// Pure helpers for the optional public-GitHub signal (Tier 6a). No network here
// — the server action fetches; these validate the handle and distill the repo
// list into a short text digest the worker appends to the CV for embedding +
// scoring. Kept framework-free so they're unit-testable.

// GitHub username rules: 1–39 chars, alphanumeric or single (non-consecutive)
// hyphens, no leading/trailing hyphen.
const USERNAME_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function isValidGithubUsername(username: string): boolean {
  return USERNAME_RE.test(username.trim());
}

export type GithubRepo = {
  name?: string;
  description?: string | null;
  language?: string | null;
  fork?: boolean;
  archived?: boolean;
  stargazers_count?: number;
};

export const GITHUB_SUMMARY_MAX_CHARS = 1500;
const MAX_REPOS = 8;

// Distill a repo list into a short digest: dominant languages, then the top
// ORIGINAL (non-fork, non-archived) projects with their blurbs. Returns "" when
// there's nothing worth adding, so the caller stores empty rather than noise.
export function buildGithubSummary(repos: GithubRepo[]): string {
  const original = repos.filter((r) => !r.fork && !r.archived);
  if (original.length === 0) return "";

  const langCounts = new Map<string, number>();
  for (const r of original) {
    const lang = (r.language ?? "").trim();
    if (lang) langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
  }
  const topLangs = [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([l]) => l);

  const topRepos = [...original]
    .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
    .slice(0, MAX_REPOS);

  const lines: string[] = [];
  if (topLangs.length) lines.push(`Languages: ${topLangs.join(", ")}.`);
  lines.push("Public projects:");
  for (const r of topRepos) {
    const name = (r.name ?? "").trim();
    if (!name) continue;
    const lang = (r.language ?? "").trim();
    const desc = (r.description ?? "").trim();
    let line = lang ? `- ${name} (${lang})` : `- ${name}`;
    if (desc) line += `: ${desc}`;
    lines.push(line);
  }

  return lines.join("\n").slice(0, GITHUB_SUMMARY_MAX_CHARS).trim();
}
