"use server";

// Per-job CV tailoring (Tier 6b). Button-triggered ONLY — never automatic. Two
// modes: "suggestions" (cheap gap check) and "recreate" (full text-first CV
// draft). Cost controls, in order of cheapness:
//   1. CACHE by (user, job, mode, cv-hash) — a re-click is a DB read, not an
//      LLM call, until the CV actually changes.
//   2. DAILY CAPS per mode, resetting at Jerusalem midnight like the run budget.
//   3. A dedicated free Groq account (GROQ_TAILOR_API_KEY) so this never eats
//      the worker's fallback quota.
// Runs with the user's session (RLS-scoped) — no service-role here.

import { createClient } from "@/lib/supabase/server";
import {
  MAX_RECREATES_PER_DAY,
  MAX_SUGGESTIONS_PER_DAY,
  RECREATE_MAX_TOKENS,
  SUGGESTIONS_MAX_TOKENS,
  buildRecreateStructuredPrompt,
  buildSuggestionsPrompt,
  callTailorLlm,
  cvHash,
  jerusalemMidnightUtcIso,
} from "@/lib/cv-tailor";

export type TailorState = {
  ok: boolean;
  error?: string;
  content?: string;
  /** true when served from cache (didn't spend a call or budget) */
  cached?: boolean;
  /** generations left today for this mode (after this one) */
  remaining?: number;
};

type TailorMode = "suggestions" | "recreate";

export async function tailorCvAction(
  _prev: TailorState | undefined,
  formData: FormData,
): Promise<TailorState> {
  const mode = String(formData.get("mode") ?? "") as TailorMode;
  const jobResultId = Number(formData.get("job_result_id"));
  if ((mode !== "suggestions" && mode !== "recreate") || !Number.isInteger(jobResultId) || jobResultId <= 0) {
    return { ok: false, error: "Invalid tailoring request." };
  }

  const apiKey = process.env.GROQ_TAILOR_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "CV tailoring isn't configured on the server yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  // The job being tailored for — RLS + explicit user_id scope.
  const { data: job } = await supabase
    .from("job_results")
    .select("id, title, company, description_excerpt, ai_verdict")
    .eq("id", jobResultId)
    .eq("user_id", user.id)
    .maybeSingle<{
      id: number;
      title: string | null;
      company: string | null;
      description_excerpt: string | null;
      ai_verdict: string | null;
    }>();
  if (!job) {
    return { ok: false, error: "Couldn't find that job on your account." };
  }

  // The CV (+ optional GitHub digest — same enrichment the scorer sees).
  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_text, github_summary")
    .eq("user_id", user.id)
    .maybeSingle<{ cv_text: string | null; github_summary: string | null }>();
  const cvText = (profile?.cv_text ?? "").trim();
  if (!cvText) {
    return { ok: false, error: "Upload your CV first — there's nothing to tailor yet." };
  }
  const github = (profile?.github_summary ?? "").trim();
  const fullCv = github
    ? `${cvText}\n\n=== PUBLIC GITHUB PROJECTS ===\n${github}`
    : cvText;
  const hash = cvHash(fullCv);

  // 1. Cache: same job + mode + CV content → serve the stored result for free.
  const cacheRes = await supabase
    .from("cv_tailor_results")
    .select("content")
    .eq("user_id", user.id)
    .eq("job_result_id", jobResultId)
    .eq("mode", mode)
    .eq("cv_hash", hash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ content: string }>();
  if (cacheRes.error && /cv_tailor_results/i.test(cacheRes.error.message)) {
    return { ok: false, error: "CV tailoring isn't available yet — apply the latest update." };
  }
  if (cacheRes.data?.content) {
    return { ok: true, content: cacheRes.data.content, cached: true };
  }

  // 2. Daily cap for this mode (Jerusalem midnight, like the run budget).
  const cap = mode === "recreate" ? MAX_RECREATES_PER_DAY : MAX_SUGGESTIONS_PER_DAY;
  const { count } = await supabase
    .from("cv_tailor_results")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("mode", mode)
    .gte("created_at", jerusalemMidnightUtcIso());
  const used = count ?? 0;
  if (used >= cap) {
    return {
      ok: false,
      error: `You've used today's ${cap} ${mode === "recreate" ? "CV rebuilds" : "gap checks"}. The budget resets at midnight.`,
    };
  }

  // 3. The one real LLM call.
  const tailorJob = {
    title: job.title ?? "Untitled role",
    company: job.company ?? "Unknown company",
    description: job.description_excerpt ?? "",
    verdict: job.ai_verdict ?? "",
  };
  // recreate → structured JSON the templates render; suggestions → plain text.
  let content: string;
  try {
    content =
      mode === "recreate"
        ? await callTailorLlm(buildRecreateStructuredPrompt(fullCv, tailorJob), apiKey, RECREATE_MAX_TOKENS)
        : await callTailorLlm(buildSuggestionsPrompt(fullCv, tailorJob), apiKey, SUGGESTIONS_MAX_TOKENS);
  } catch {
    return { ok: false, error: "The tailoring service is busy right now. Try again in a minute." };
  }

  // Persist for the cache + the cap counter. Best-effort: the user still gets
  // their result even if the write hiccups (it just won't be cached).
  await supabase.from("cv_tailor_results").insert({
    user_id: user.id,
    job_result_id: jobResultId,
    mode,
    cv_hash: hash,
    content,
  });

  return { ok: true, content, remaining: Math.max(0, cap - used - 1) };
}
