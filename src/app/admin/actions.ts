"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  approveRequest,
  rejectRequest,
  resendClaimEmail,
  type AccessRequestRow,
} from "@/lib/access-requests";
import { dispatchWorkerRun } from "@/app/actions/run";

export type AdminActionState = { ok: boolean; error?: string; message?: string };

// A valid UUID — admin actions take a user id from the page, so validate it
// before it reaches a query, even though the service-role client + admin gate
// already constrain who can call these.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True only for the configured admin (ADMIN_USER_ID env). Both the /admin page
 * and these actions call it — the email-link route uses token auth instead and
 * doesn't need a session.
 */
async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const adminUserId = process.env.ADMIN_USER_ID;
  if (!adminUserId) return { ok: false, error: "Admin not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== adminUserId) {
    return { ok: false, error: "Not authorized." };
  }
  return { ok: true };
}

async function decide(
  id: number,
  kind: "approve" | "reject",
): Promise<AdminActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createAdminClient();
  const { data: reqRow } = await admin
    .from("access_requests")
    .select("id, email, first_name, last_name, status, note, created_at")
    .eq("id", id)
    .maybeSingle<AccessRequestRow>();
  if (!reqRow) return { ok: false, error: "Request not found." };

  const result =
    kind === "approve" ? await approveRequest(reqRow) : await rejectRequest(reqRow);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin");
  return {
    ok: true,
    message: result.alreadyDecided
      ? "Already decided."
      : kind === "approve"
        ? `Approved ${reqRow.first_name} — invite sent.`
        : `Rejected ${reqRow.first_name}.`,
  };
}

export async function approveRequestAction(
  _prev: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Bad request id." };
  return decide(id, "approve");
}

export async function rejectRequestAction(
  _prev: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Bad request id." };
  return decide(id, "reject");
}

// ---------------------------------------------------------------------------
// Phase 2 — per-user admin actions (all gated by requireAdmin, service-role).
// ---------------------------------------------------------------------------

/** Pause or resume a user's pipeline by flipping preferences.is_active. */
export async function setUserActiveAction(
  formData: FormData,
): Promise<AdminActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const userId = String(formData.get("user_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!UUID_RE.test(userId)) return { ok: false, error: "Bad user id." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("preferences")
    .update({ is_active: active })
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, message: active ? "User resumed." : "User paused." };
}

/** Grant or revoke beta access by flipping profiles.is_whitelisted. */
export async function setUserWhitelistAction(
  formData: FormData,
): Promise<AdminActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const userId = String(formData.get("user_id") ?? "");
  const whitelisted = String(formData.get("whitelisted") ?? "") === "true";
  if (!UUID_RE.test(userId)) return { ok: false, error: "Bad user id." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_whitelisted: whitelisted })
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return {
    ok: true,
    message: whitelisted ? "User whitelisted." : "Whitelist revoked.",
  };
}

// How soon a "reschedule to now" nudge sets the next run. A tiny offset in the
// past so the very next worker tick picks the user up.
const ALLOWED_FREQ = new Set([1, 24, 48, 168]);

/** Set a user's next_run_at. With `when=now` the user is queued for the next
 *  tick; otherwise an explicit ISO timestamp is used. Optionally also update the
 *  cadence (frequency_hours) to one of the allowed values. */
export async function rescheduleUserAction(
  formData: FormData,
): Promise<AdminActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const userId = String(formData.get("user_id") ?? "");
  if (!UUID_RE.test(userId)) return { ok: false, error: "Bad user id." };

  const when = String(formData.get("when") ?? "now");
  let nextRunAt: string;
  if (when === "now") {
    // 1 minute in the past → eligible immediately, not skipped as "future".
    nextRunAt = new Date(Date.now() - 60_000).toISOString();
  } else {
    const t = new Date(when);
    if (Number.isNaN(t.getTime())) return { ok: false, error: "Bad date." };
    nextRunAt = t.toISOString();
  }

  const update: Record<string, unknown> = { next_run_at: nextRunAt };
  const freqRaw = formData.get("frequency_hours");
  if (freqRaw != null && String(freqRaw) !== "") {
    const freq = Number(freqRaw);
    if (!ALLOWED_FREQ.has(freq)) return { ok: false, error: "Bad cadence." };
    update.frequency_hours = freq;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("preferences").update(update).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin");
  return { ok: true, message: "Schedule updated." };
}

/** Re-send the account-setup ("claim") email to an approved user whose original
 *  invite was lost. Looks up their email/name, then re-issues the claim link. */
export async function resendInviteAction(
  formData: FormData,
): Promise<AdminActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const userId = String(formData.get("user_id") ?? "");
  if (!UUID_RE.test(userId)) return { ok: false, error: "Bad user id." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) {
    return { ok: false, error: "Couldn't find this user's email." };
  }
  const first = (data.user.user_metadata?.first_name as string | undefined) ?? "";
  const res = await resendClaimEmail(data.user.email, first);
  if (!res.ok) return { ok: false, error: res.error };

  return { ok: true, message: `Setup email re-sent to ${data.user.email}.` };
}

/** Permanently delete a user account and everything it owns. The auth user is
 *  removed; profiles/preferences/runs/job_results/feedback/etc. cascade via their
 *  FKs (on delete cascade). Irreversible — the UI double-confirms. */
export async function deleteUserAction(
  formData: FormData,
): Promise<AdminActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const userId = String(formData.get("user_id") ?? "");
  if (!UUID_RE.test(userId)) return { ok: false, error: "Bad user id." };
  // Never let the admin delete their own account from here.
  if (userId === process.env.ADMIN_USER_ID) {
    return { ok: false, error: "You can't delete the admin account." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, message: "Account deleted." };
}

/** Mark a stalled run (stuck in 'running') as failed so the user isn't blocked
 *  and the funnel/health stats stop counting a zombie. Only flips rows that are
 *  still 'running' — a race that already finished is left untouched. */
export async function resetStalledRunAction(
  formData: FormData,
): Promise<AdminActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const runId = Number(formData.get("run_id"));
  if (!Number.isInteger(runId) || runId <= 0) return { ok: false, error: "Bad run id." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("runs")
    .update({
      status: "failed",
      ended_at: new Date().toISOString(),
      error: "Marked failed by admin (stalled run).",
    })
    .eq("id", runId)
    .eq("status", "running"); // never clobber a run that finished in the meantime
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, message: "Stalled run cleared." };
}

/** Trigger a manual worker run for a specific user (admin override — no budget
 *  or cooldown check; the admin is explicitly forcing it). */
export async function adminTriggerRunAction(
  formData: FormData,
): Promise<AdminActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const userId = String(formData.get("user_id") ?? "");
  if (!UUID_RE.test(userId)) return { ok: false, error: "Bad user id." };

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return { ok: false, error: "Dispatch token not configured." };

  // Admin override: a forced run bypasses the worker's 2/day budget cap, so this
  // actually runs even for a user who's already at their daily limit (previously
  // the worker silently skipped it while the UI claimed success).
  const ok = await dispatchWorkerRun(userId, token, { adminOverride: true });
  if (!ok) return { ok: false, error: "Couldn't start the run. Try again." };

  revalidatePath("/admin");
  return { ok: true, message: "Forced run triggered — results in ~35-40 min." };
}
