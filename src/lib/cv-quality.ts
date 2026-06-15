/**
 * Deterministic CV quality gate, run at upload time after parsing.
 *
 * Two jobs:
 *   1. BLOCK a CV that is genuinely unusable for job scoring (almost no signal),
 *      with a specific message telling the user what to add.
 *   2. PASS a usable CV but surface non-blocking GAPS ("this would score better
 *      with a skills section / dates on your experience").
 *
 * Heuristic, not AI, on purpose: the block decision must be PREDICTABLE and must
 * never wrongly reject a real candidate by hallucinating. We detect the presence
 * of the sections a CV needs to be scoreable; we never judge their quality.
 *
 * The platform serves Palestinian students and new grads, so the bar is
 * deliberately low: a CV needs identity + (skills OR experience OR projects OR
 * education). We only block when there's essentially nothing to score against.
 */

export interface CvQualityResult {
  /** False only when the CV is genuinely unusable — the caller blocks the upload. */
  usable: boolean;
  /** User-facing reason shown when usable=false. */
  blockingReason?: string;
  /** Non-blocking gaps shown as advice when usable=true but something's thin. */
  gaps: string[];
}

// Section signals — generous synonym lists so we don't miss a real section just
// because the user titled it differently. Matched case-insensitively as whole-ish
// words against the normalized CV text.
const SIGNALS = {
  skills: [
    "skill", "technolog", "tech stack", "proficien", "languages",
    "frameworks", "tools", "competenc",
  ],
  experience: [
    "experience", "employment", "work history", "professional", "intern",
    "internship", "worked at", "position", "role at",
  ],
  projects: ["project", "portfolio", "built", "developed", "implemented"],
  education: [
    "education", "university", "college", "bachelor", "b.sc", "bsc",
    "degree", "diploma", "gpa", "major", "coursework",
  ],
  contact: ["@", "email", "phone", "linkedin", "github", "tel:", "mobile"],
} as const;

function has(text: string, needles: readonly string[]): boolean {
  return needles.some((n) => text.includes(n));
}

// Floor for "is this even a document". Deliberately low — a real one-page CV can
// be terse, and we must NOT reject real candidates. This only catches a stray
// sentence or two. The capability-signal check below does the real work.
const MIN_WORDS = 25;

export function assessCvQuality(rawText: string): CvQualityResult {
  const text = (rawText || "").toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const found = {
    skills: has(text, SIGNALS.skills),
    experience: has(text, SIGNALS.experience),
    projects: has(text, SIGNALS.projects),
    education: has(text, SIGNALS.education),
    contact: has(text, SIGNALS.contact),
  };

  // The core scoreability signal: can we tell what this person can DO?
  const hasCapabilitySignal = found.skills || found.experience || found.projects;

  // BLOCK only when there's essentially nothing to score against: either it's
  // barely any text, OR it has no skills/experience/projects signal at all.
  if (wordCount < MIN_WORDS || !hasCapabilitySignal) {
    const missingBits: string[] = [];
    if (!found.skills) missingBits.push("a skills section");
    if (!found.experience && !found.projects)
      missingBits.push("your experience, internships, or projects");
    const what =
      missingBits.length > 0
        ? missingBits.join(" and ")
        : "more detail about your background";
    return {
      usable: false,
      blockingReason:
        `We couldn't find enough to score this CV against jobs. Please add ${what}, ` +
        `then upload again — or paste your CV text manually below.`,
      gaps: [],
    };
  }

  // PASS, but collect non-blocking gaps as friendly advice.
  const gaps: string[] = [];
  if (!found.skills)
    gaps.push("Add a clear skills/technologies section — it sharpens matching.");
  if (!found.experience && found.projects)
    gaps.push(
      "No work/internship experience detected — that's fine for a student profile; " +
        "your projects will be weighed instead.",
    );
  if (!found.education)
    gaps.push("Consider adding your education (degree, university, expected graduation).");
  if (!found.contact)
    gaps.push("Add contact details (email / LinkedIn / GitHub) so recruiters can reach you.");

  return { usable: true, gaps };
}
