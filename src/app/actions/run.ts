"use server";

// Manual run controls for the dashboard Quick Actions (Stage 2 of the
// "Run now" / 2-runs-a-day feature). Two server actions:
//
//   * triggerManualRunAction — dispatches the worker's multi_user.yml workflow
//     for THIS user via the GitHub REST API, after re-checking the daily budget
//     and that no run is already in flight. The worker enforces the real cap
//     (migration 0014 + MAX_RUNS_PER_DAY); these checks are defense-in-depth so
//     we don't waste a dispatch the worker would just skip.
//
//   * rescheduleRunAction — writes preferences.next_run_at so the user can move
//     their next scheduled run. RLS scopes the write to the caller's own row.
//
// The GitHub PAT lives in GH_DISPATCH_TOKEN (server-only env, set in Vercel).
// It needs only Actions:write on the worker repo.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_RUNS_PER_DAY,
  resolvePendingDispatch,
} from "@/app/dashboard/_lib/dashboard-state";

export type RunActionState = { ok: boolean; error?: string; message?: string };

// The worker repo + workflow the dispatch targets. Hard-coded rather than
// env-driven: there's exactly one worker, and baking it in keeps a misconfig
// from silently dispatching to the wrong place.
const WORKER_OWNER = "moe-the-goat";
const WORKER_REPO = "Automated-AI-Job-Intelligence-System";
const WORKFLOW_FILE = "multi_user.yml";
// The worker runs on `main`; workflow_dispatch requires a ref that contains
// the workflow file.
const WORKFLOW_REF = "main";

// How long a manual dispatch "holds" the lock. Long enough to cover the gap
// before the worker creates its runs row (then the runs-status check takes
// over), short enough that a genuinely failed dispatch doesn't lock the user
// out for long. The claim is rolled back immediately on a failed dispatch, so
// this mainly bounds the worst case.
const MANUAL_DISPATCH_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Low-level workflow_dispatch for one user. Returns true on a 204 (accepted).
 * Shared by the user-facing "Run now" and the admin "trigger run for a user"
 * action, so the dispatch shape lives in exactly one place. Caller handles
 * auth, budgets, and locks — this just fires the dispatch.
 */
export async function dispatchWorkerRun(
  userId: string,
  token: string,
  opts: { adminOverride?: boolean } = {},
): Promise<boolean> {
  const url = `https://api.github.com/repos/${WORKER_OWNER}/${WORKER_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: WORKFLOW_REF,
        inputs: {
          dry_run: "false",
          user_id: userId,
          skip_due_check: "true",
          manual: "true",
          // Admin forced run bypasses the worker's 2/day budget cap. Only the
          // admin trigger sets this; the user-facing Run-now never does.
          admin_override: opts.adminOverride ? "true" : "false",
        },
      }),
      cache: "no-store",
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

/** Release the manual-dispatch lock (clear last_manual_dispatch_at) so a failed
 *  dispatch doesn't lock the user out for the cooldown. Best-effort. */
async function releaseDispatchClaim(
  supabase: Awaited<ReturnType<typeof authedClient>>["supabase"],
  userId: string,
): Promise<void> {
  await supabase
    .from("preferences")
    .update({ last_manual_dispatch_at: null })
    .eq("user_id", userId);
}

/**
 * Fire a one-off manual run for the signed-in user. Returns a friendly state
 * object; never throws to the client. On success the workflow is queued (it
 * starts within ~30s and the run itself takes ~35-40 min).
 */
export async function triggerManualRunAction(): Promise<RunActionState> {
  const { supabase, user } = await authedClient();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    // Misconfiguration — surface a clear message rather than a silent no-op.
    return {
      ok: false,
      error: "Manual runs aren't configured on the server yet. Try again later.",
    };
  }

  // Defense in depth: don't spend a dispatch the worker would just reject.
  // 1. Daily budget.
  const { data: usedRaw, error: usedErr } = await supabase.rpc("runs_used_today", {
    p_user_id: user.id,
  });
  if (usedErr) {
    return { ok: false, error: "Couldn't check your run budget. Try again." };
  }
  const used = typeof usedRaw === "number" ? usedRaw : 0;
  if (used >= MAX_RUNS_PER_DAY) {
    return {
      ok: false,
      error: `You've used all ${MAX_RUNS_PER_DAY} of today's runs. The budget resets at midnight.`,
    };
  }

  // 2. No run already in flight (avoid double-dispatch / racing job_results).
  const { data: lastRun } = await supabase
    .from("runs")
    .select("status, started_at")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ status: string; started_at: string }>();
  if (lastRun?.status === "running") {
    return { ok: false, error: "A run is already in progress. Give it a few minutes." };
  }

  // 2b. No dispatch still warming up. The worker doesn't create its runs row
  // until after boot + the shared local scrape (~10-15 min), so the check
  // above is blind to a run dispatched in that window — including an admin
  // forced run, which stamps the same column. Without this, a second dispatch
  // "succeeds" here and slips past the budget (its row doesn't exist yet to
  // be counted), only for the worker to silently skip or double-run it.
  const { data: prefsRow } = await supabase
    .from("preferences")
    .select("last_manual_dispatch_at")
    .eq("user_id", user.id)
    .maybeSingle<{ last_manual_dispatch_at: string | null }>();
  if (
    resolvePendingDispatch(
      prefsRow?.last_manual_dispatch_at ?? null,
      lastRun?.started_at ?? null,
    )
  ) {
    return {
      ok: false,
      error:
        "A run is already starting — it shows up at the top of your dashboard within a few minutes.",
    };
  }

  // 3. Atomic dispatch lock (fixes the double-press bug). The runs-status check
  // above can't catch a fast double-press: the worker doesn't create the runs
  // row until it boots (~30s), so a second press in that gap also passes. So we
  // CLAIM the user here with a conditional UPDATE on last_manual_dispatch_at —
  // it succeeds (returns a row) only when the last dispatch is null or older
  // than the cooldown. Two racing requests serialize on the single-row lock;
  // exactly one gets the row, the other updates zero rows and is rejected.
  const cooldownAgo = new Date(Date.now() - MANUAL_DISPATCH_COOLDOWN_MS).toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from("preferences")
    .update({ last_manual_dispatch_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .or(`last_manual_dispatch_at.is.null,last_manual_dispatch_at.lt.${cooldownAgo}`)
    .select("user_id")
    .maybeSingle<{ user_id: string }>();
  if (claimErr) {
    return { ok: false, error: "Couldn't start the run. Try again." };
  }
  if (!claimed) {
    // Another dispatch just claimed the slot (double-press / second tab).
    return { ok: false, error: "A run was just started. Give it a few minutes." };
  }

  // Dispatch the workflow for exactly this user, skipping the due-check and
  // marking it manual so the worker stamps run_trigger + cancels today's
  // scheduled tick.
  const url = `https://api.github.com/repos/${WORKER_OWNER}/${WORKER_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: WORKFLOW_REF,
        inputs: {
          dry_run: "false",
          user_id: user.id,
          skip_due_check: "true",
          manual: "true",
        },
      }),
      cache: "no-store",
    });
  } catch {
    // Dispatch never left the building — release the claim so the user can retry
    // immediately instead of waiting out the cooldown.
    await releaseDispatchClaim(supabase, user.id);
    return { ok: false, error: "Couldn't reach the run service. Try again." };
  }

  // GitHub returns 204 No Content on a successful dispatch.
  if (res.status !== 204) {
    await releaseDispatchClaim(supabase, user.id);
    return {
      ok: false,
      error: "The run couldn't be started right now. Try again in a moment.",
    };
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: "Run started — fresh matches land in ~35–40 minutes.",
  };
}

// Reschedule guardrails: the next run must be in the future and not absurdly
// far out. 1 minute floor (avoids "schedule in the past"), 30-day ceiling.
const MIN_LEAD_MS = 60 * 1000;
const MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Move the user's next scheduled run to a chosen time. Expects an ISO 8601
 * datetime in form field `next_run_at`. RLS confines the write to the caller.
 */
export async function rescheduleRunAction(
  formData: FormData,
): Promise<RunActionState> {
  const raw = String(formData.get("next_run_at") ?? "").trim();
  if (!raw) return { ok: false, error: "Pick a date and time." };

  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, error: "That doesn't look like a valid date/time." };
  }

  const delta = when.getTime() - Date.now();
  if (delta < MIN_LEAD_MS) {
    return { ok: false, error: "Choose a time in the future." };
  }
  if (delta > MAX_LEAD_MS) {
    return { ok: false, error: "Choose a time within the next 30 days." };
  }

  const { supabase, user } = await authedClient();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const { error } = await supabase
    .from("preferences")
    .update({ next_run_at: when.toISOString() })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/preferences");
  return { ok: true, message: "Next run rescheduled." };
}

/**
 * Aggregate, privacy-safe count of active users scheduled per hour-of-day
 * (Asia/Jerusalem), for the reschedule congestion hint. Returns a { hour: count }
 * map. Degrades to {} (no hint shown) if the RPC isn't present yet — so the
 * reschedule dialog keeps working before migration 0024 is applied.
 */
export async function getScheduleSlotCountsAction(): Promise<{
  ok: boolean;
  counts: Record<number, number>;
}> {
  const { supabase, user } = await authedClient();
  if (!user) return { ok: false, counts: {} };
  const { data, error } = await supabase.rpc("schedule_slot_counts");
  if (error || !Array.isArray(data)) return { ok: true, counts: {} };
  const counts: Record<number, number> = {};
  for (const row of data as { slot_hour: number; user_count: number }[]) {
    if (typeof row?.slot_hour === "number") {
      counts[row.slot_hour] = Number(row.user_count) || 0;
    }
  }
  return { ok: true, counts };
}
