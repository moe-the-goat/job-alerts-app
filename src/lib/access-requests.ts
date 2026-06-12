import "server-only";

import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-smtp";

/**
 * Shared logic for the closed-beta access gate. Both surfaces — the one-click
 * Approve/Reject links in the admin email (/api/access-decision) and the
 * /admin dashboard buttons — funnel through approveRequest / rejectRequest
 * here, so the two paths can never drift.
 *
 * Tokens follow the email_feedback_tokens pattern: a random secret goes in the
 * link, only its sha256 hex is stored. Comparison is hash-to-hash.
 */

export const ADMIN_EMAIL = "mohaabuhijleh@gmail.com";

export interface AccessRequestRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

/** Canonical app origin for links in emails. */
export function siteOrigin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  return (env ?? "").replace(/\/$/, "");
}

type DecisionResult = { ok: boolean; error?: string; alreadyDecided?: boolean };

/**
 * Approve a pending request: create the account via an invite (the user sets
 * their password + verifies through the invite link), whitelist them so the
 * worker will process them, and email them the good news. Idempotent on an
 * already-decided request (returns alreadyDecided).
 */
export async function approveRequest(
  reqRow: AccessRequestRow,
): Promise<DecisionResult> {
  if (reqRow.status !== "pending") {
    return { ok: true, alreadyDecided: true };
  }
  const admin = createAdminClient();
  const origin = siteOrigin();

  // Invite: Supabase emails a link that lets them set a password and lands on
  // /auth/callback, finishing verification + sign-in in one step.
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    reqRow.email,
    {
      data: { first_name: reqRow.first_name, last_name: reqRow.last_name },
      redirectTo: origin ? `${origin}/auth/callback?next=/dashboard` : undefined,
    },
  );
  if (inviteErr) {
    return { ok: false, error: `Invite failed: ${inviteErr.message}` };
  }

  const newUserId = invited?.user?.id ?? null;

  // Whitelist so the worker stops skipping them (closed-beta gate). The
  // handle_new_user trigger created the profiles row at invite time.
  if (newUserId) {
    const { error: wlErr } = await admin
      .from("profiles")
      .update({ is_whitelisted: true })
      .eq("user_id", newUserId);
    if (wlErr) {
      // Account exists but isn't whitelisted — surface it so you can fix the
      // flag manually; don't pretend it fully succeeded.
      return {
        ok: false,
        error: `Account created but whitelist failed: ${wlErr.message}`,
      };
    }
  }

  await admin
    .from("access_requests")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      created_user_id: newUserId,
    })
    .eq("id", reqRow.id);

  // Courtesy heads-up (the actual actionable link is Supabase's invite email).
  await sendEmail({
    to: reqRow.email,
    subject: "You're in — set up your Job Alerts account",
    html: approvedEmailHtml(reqRow.first_name),
    text: approvedEmailText(reqRow.first_name),
  });

  return { ok: true };
}

/** Reject a pending request: mark it + email a polite decline. */
export async function rejectRequest(
  reqRow: AccessRequestRow,
): Promise<DecisionResult> {
  if (reqRow.status !== "pending") {
    return { ok: true, alreadyDecided: true };
  }
  const admin = createAdminClient();

  await admin
    .from("access_requests")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", reqRow.id);

  await sendEmail({
    to: reqRow.email,
    subject: "About your Job Alerts access request",
    html: rejectedEmailHtml(reqRow.first_name),
    text: rejectedEmailText(reqRow.first_name),
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Email bodies
// ---------------------------------------------------------------------------

export function adminNotificationHtml(
  reqRow: Pick<AccessRequestRow, "first_name" | "last_name" | "email" | "note">,
  approveUrl: string,
  rejectUrl: string,
): string {
  const note = reqRow.note
    ? `<p style="margin:8px 0;color:#444;"><b>Note:</b> ${escapeHtml(reqRow.note)}</p>`
    : "";
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;">
      <h2 style="margin:0 0 4px;">New access request</h2>
      <p style="margin:8px 0;color:#444;">Someone asked to join the closed beta.</p>
      <table style="border-collapse:collapse;margin:12px 0;font-size:14px;">
        <tr><td style="padding:2px 12px 2px 0;color:#777;">Name</td><td>${escapeHtml(reqRow.first_name)} ${escapeHtml(reqRow.last_name)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#777;">Email</td><td>${escapeHtml(reqRow.email)}</td></tr>
      </table>
      ${note}
      <p style="margin:16px 0;">
        <a href="${approveUrl}" style="background:#3b82e0;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:600;">Approve</a>
        &nbsp;&nbsp;
        <a href="${rejectUrl}" style="background:#e5534b;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:600;">Reject</a>
      </p>
      <p style="margin:8px 0;color:#999;font-size:12px;">Approving sends them an invite link to set a password. No password is ever shown to you.</p>
    </div>`;
}

function approvedEmailHtml(firstName: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;">
      <h2>You're in, ${escapeHtml(firstName)} 🎉</h2>
      <p>Your access to Job Alerts has been approved. We've just emailed you a
      separate <b>invite link</b> — click it to set your password and verify your
      email, then you'll be taken straight to your dashboard.</p>
      <p style="color:#777;font-size:13px;">If you don't see the invite, check spam.</p>
    </div>`;
}

function approvedEmailText(firstName: string): string {
  return `You're in, ${firstName}! Your Job Alerts access is approved. Check your inbox for a separate invite link to set your password and verify your email, then you'll reach your dashboard.`;
}

function rejectedEmailHtml(firstName: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;">
      <h2>About your request, ${escapeHtml(firstName)}</h2>
      <p>Thanks for your interest in Job Alerts. We're a small closed beta right
      now and can't add your account at this time.</p>
      <p style="color:#777;font-size:13px;">We may open up more spots later — feel free to try again then.</p>
    </div>`;
}

function rejectedEmailText(firstName: string): string {
  return `Hi ${firstName} — thanks for your interest in Job Alerts. We're a small closed beta and can't add your account right now. We may open more spots later.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
