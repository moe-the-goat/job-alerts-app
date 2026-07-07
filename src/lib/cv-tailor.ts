// CV-tailoring core (Tier 6b): prompt builders, caps, day boundary, CV hashing,
// and the Groq call. Everything except callTailorLlm is pure/deterministic so
// it's unit-testable; the server action in app/actions/tailor.ts does the auth,
// cache, and cap orchestration.
//
// Model: Groq openai/gpt-oss-120b on a DEDICATED free account
// (GROQ_TAILOR_API_KEY in Vercel) so this feature never eats the worker's
// fallback quota. Groq's 8K TPM pre-counts prompt + max output, so the CV
// excerpts and output budgets below are sized to keep every call under it.

import { createHash } from "crypto";

export const TAILOR_MODEL = "openai/gpt-oss-120b";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

// Daily caps per user, resetting at Jerusalem midnight (same day boundary as
// the run budget). Recreate is the expensive one; suggestions are one short
// call so the cap is looser. Cache hits don't count against either.
export const MAX_RECREATES_PER_DAY = 3;
export const MAX_SUGGESTIONS_PER_DAY = 10;

// Prompt-size guards (chars, ~4 chars/token). CV + job excerpt + template must
// leave room for the output budget under Groq's 8K TPM.
const SUGGESTIONS_CV_CHARS = 6000;
const RECREATE_CV_CHARS = 10000;
const JOB_DESC_CHARS = 1200;
export const SUGGESTIONS_MAX_TOKENS = 1024;
export const RECREATE_MAX_TOKENS = 4096;

/** Stable short hash of the CV content (plus GitHub digest) — the cache key
 *  ingredient that auto-invalidates tailoring results when the CV changes. */
export function cvHash(text: string): string {
  return createHash("sha256").update(text ?? "", "utf8").digest("hex").slice(0, 16);
}

/** UTC instant (ISO) of the most recent Jerusalem local-midnight — the daily
 *  cap counts rows created at/after this. Mirrors the worker's budget day. */
export function jerusalemMidnightUtcIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // Jerusalem wall-clock "now" re-read as if it were UTC; the difference to real
  // UTC is the zone offset (rounded to 15 min to absorb second-level jitter).
  const wallAsUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"),
  );
  const offsetMs = Math.round((wallAsUtc - now.getTime()) / 900_000) * 900_000;
  const localMidnightAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"));
  return new Date(localMidnightAsUtc - offsetMs).toISOString();
}

export type TailorJob = {
  title: string;
  company: string;
  description: string;
  verdict: string;
};

// Both prompts share the grounding rule that runs through the whole product:
// never invent experience — only reorganize and surface what's really there.

export function buildSuggestionsPrompt(cvText: string, job: TailorJob): string {
  return `You are a precise CV coach. Compare the candidate's CV against ONE job posting and point out what to fix.

CANDIDATE CV (may include a PUBLIC GITHUB PROJECTS section):
${(cvText ?? "").slice(0, SUGGESTIONS_CV_CHARS)}

JOB:
- Title: ${job.title}
- Company: ${job.company}
- Posting excerpt: ${(job.description ?? "").slice(0, JOB_DESC_CHARS)}
- Screening verdict on this candidate: ${(job.verdict ?? "").slice(0, 600)}

Write 4-7 short bullet points, most impactful first:
- GAPS the posting cares about that the CV doesn't show — and if the CV or the GitHub section actually contains the evidence (a project, a skill), say exactly where and suggest a concrete bullet line to add, quoting the real project name.
- REWRITES: at most 2 existing CV lines that should be reworded to speak this posting's language, with the improved line.
- CUTS: anything taking space that this posting doesn't care about.

HARD RULE: never invent experience, projects, numbers, or tools that are not in the CV/GitHub text above. If the candidate simply lacks something, say so honestly instead of fabricating it.
Output plain text bullets only — no headers, no markdown tables, no preamble.`;
}

export function buildRecreatePrompt(cvText: string, job: TailorJob): string {
  return `You are a precise CV writer. Rebuild the candidate's CV CONTENT so it targets ONE specific job, using ONLY what is already in their CV.

CANDIDATE CV (may include a PUBLIC GITHUB PROJECTS section):
${(cvText ?? "").slice(0, RECREATE_CV_CHARS)}

TARGET JOB:
- Title: ${job.title}
- Company: ${job.company}
- Posting excerpt: ${(job.description ?? "").slice(0, JOB_DESC_CHARS)}

Rules:
1. KEEP the candidate's section order and overall structure; this is a re-emphasis, not a redesign.
2. ONE PAGE of content: tighten wording, lead each section with what THIS job cares about, drop or compress what it doesn't.
3. Rephrase bullets to mirror the posting's terminology where the CV genuinely supports it.
4. You may promote a relevant project from the GitHub section into the projects section.
5. HARD RULE: never invent experience, employers, dates, numbers, tools, or projects not present above. Nothing new — only reorder, reword, tighten.
6. Output plain text only (section headings + bullets), ready to paste into their document. No commentary before or after.`;
}

// Structured variant of the recreate prompt: same grounding rules, but the
// model returns a JSON CV that our templates render (see cv-templates.ts).
// Keeping the shape explicit in the prompt is what makes the templates
// interchangeable — one generation, any template.
export function buildRecreateStructuredPrompt(cvText: string, job: TailorJob): string {
  return `You are a precise CV writer. Rebuild the candidate's CV as STRUCTURED JSON, targeting ONE specific job, using ONLY what is already in their CV.

CANDIDATE CV (may include a PUBLIC GITHUB PROJECTS section):
${(cvText ?? "").slice(0, RECREATE_CV_CHARS)}

TARGET JOB:
- Title: ${job.title}
- Company: ${job.company}
- Posting excerpt: ${(job.description ?? "").slice(0, JOB_DESC_CHARS)}

Return ONLY a JSON object (no markdown, no prose) with EXACTLY this shape:
{
  "name": "string",
  "headline": "short professional title, e.g. the target role — only if the CV supports it",
  "contact": { "location": "string?", "phone": "string?", "email": "string?",
               "links": [ { "label": "e.g. github.com/you", "url": "https://..." } ] },
  "summary": "one or two sentences, tailored to this job, drawn only from real experience",
  "sections": [
    { "kind": "skills", "heading": "Technical Skills",
      "skills": [ { "label": "Languages", "value": "Python, ..." } ] },
    { "kind": "entries", "heading": "Projects",
      "entries": [ { "title": "string", "subtitle": "employer/school?", "meta": "location/GPA?",
                     "date": "string?", "tech": "tech stack line?", "bullets": ["string"] } ] },
    { "kind": "list", "heading": "Certifications", "items": ["string"] }
  ]
}

RULES:
1. Preserve the candidate's real section order and structure (summary, skills, projects/experience, education, certifications — include only the ones they actually have).
2. Fit ONE PAGE of content: tighten wording, lead each section and bullet with what THIS job cares about, drop or compress what it doesn't.
3. Rephrase to mirror the posting's terminology ONLY where the CV genuinely supports it.
4. HARD RULE: never invent experience, employers, dates, numbers, tools, links, or projects that are not in the CV text above. Copy real details faithfully; if something isn't there, leave the field out.
5. Output must be valid JSON and nothing else.`;
}

/**
 * One Groq chat call. Throws on transport/HTTP errors; returns the text.
 *
 * gpt-oss-120b is a REASONING model. By default Groq returns its chain-of-
 * thought INSIDE message.content (wrapped in <think> tags) — which pollutes
 * the answer with stray prose and braces and truncates the real output. So we
 * force `reasoning_format: "hidden"`: the model still reasons (kept minimal via
 * `reasoning_effort: "low"`) but message.content is only the final answer.
 * With `jsonMode`, we also switch on JSON mode so the draft comes back as clean,
 * parseable JSON (Groq requires reasoning_format to be hidden/parsed for that).
 */
export async function callTailorLlm(
  prompt: string,
  apiKey: string,
  maxTokens: number,
  jsonMode = false,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: TAILOR_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: maxTokens,
    reasoning_effort: "low",
    reasoning_format: "hidden",
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Groq ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Groq returned an empty response");
  return content;
}
