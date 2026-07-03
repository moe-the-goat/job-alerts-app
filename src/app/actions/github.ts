"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  buildGithubSummary,
  isValidGithubUsername,
  type GithubRepo,
} from "@/lib/github-signal";

export type GithubState = { ok: boolean; error?: string; message?: string };

/**
 * Connect (or disconnect) the user's public GitHub. On connect we fetch their
 * public repos ONCE, distill a short digest, and store it on the profile so the
 * worker can append it to the CV without hitting GitHub per run. Opt-in; public
 * data only; graceful if migration 0027 isn't applied yet.
 */
export async function saveGithubAction(
  _prev: GithubState | undefined,
  formData: FormData,
): Promise<GithubState> {
  const username = String(formData.get("github_username") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  // Empty input → disconnect (clear both fields).
  if (!username) {
    const { error } = await supabase
      .from("profiles")
      .update({ github_username: null, github_summary: null })
      .eq("user_id", user.id);
    if (error && /github_/i.test(error.message)) {
      return { ok: false, error: "GitHub isn't available yet — apply the latest update." };
    }
    if (error) return { ok: false, error: error.message };
    revalidatePath("/preferences");
    return { ok: true, message: "GitHub disconnected." };
  }

  if (!isValidGithubUsername(username)) {
    return { ok: false, error: "That doesn't look like a valid GitHub username." };
  }

  // Fetch the user's public repos (owned, most-recently-pushed first).
  let repos: GithubRepo[] = [];
  try {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=30&type=owner`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "job-alerts-app",
        },
        cache: "no-store",
      },
    );
    if (res.status === 404) {
      return { ok: false, error: `No public GitHub user "${username}" found.` };
    }
    if (!res.ok) {
      return { ok: false, error: "Couldn't reach GitHub right now. Try again in a moment." };
    }
    const data = await res.json();
    repos = Array.isArray(data) ? (data as GithubRepo[]) : [];
  } catch {
    return { ok: false, error: "Couldn't reach GitHub right now. Try again in a moment." };
  }

  const summary = buildGithubSummary(repos);

  const { error } = await supabase
    .from("profiles")
    .update({ github_username: username, github_summary: summary || null })
    .eq("user_id", user.id);
  if (error && /github_/i.test(error.message)) {
    return { ok: false, error: "GitHub isn't available yet — apply the latest update." };
  }
  if (error) return { ok: false, error: error.message };

  revalidatePath("/preferences");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: summary
      ? `Connected @${username} — ${repos.length} public repo${repos.length === 1 ? "" : "s"} scanned.`
      : `Connected @${username}, but found no public projects to add.`,
  };
}
