"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  approveRequest,
  rejectRequest,
  type AccessRequestRow,
} from "@/lib/access-requests";

export type AdminActionState = { ok: boolean; error?: string; message?: string };

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
