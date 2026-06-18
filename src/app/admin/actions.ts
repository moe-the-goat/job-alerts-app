"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  approveRequest,
  rejectRequest,
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

  const ok = await dispatchWorkerRun(userId, token);
  if (!ok) return { ok: false, error: "Couldn't start the run. Try again." };

  revalidatePath("/admin");
  return { ok: true, message: "Run triggered — results in ~35-40 min." };
}
