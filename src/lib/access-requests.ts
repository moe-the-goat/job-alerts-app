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

  // Create the account directly (confirmed, no password yet) instead of
  // inviteUserByEmail. The invite path emails a single-use link that corporate
  // mail scanners pre-consume (→ otp_expired on the real click); we replace it
  // with our own token-less /claim page where the user requests a one-time
  // code themselves. email_confirm:true means no Supabase email is sent here
  // and the account is immediately eligible for OTP login.
  const { data: invited, error: inviteErr } = await admin.auth.admin.createUser({
    email: reqRow.email,
    email_confirm: true,
    user_metadata: { first_name: reqRow.first_name, last_name: reqRow.last_name },
  });
  if (inviteErr) {
    return { ok: false, error: `Account creation failed: ${inviteErr.message}` };
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

  // Send them to the token-less /claim page on our own domain. They request a
  // one-time code there themselves — a flow email scanners can't pre-consume
  // (unlike Supabase's invite link, which corporate mail servers auto-fetch
  // and burn before the human clicks → otp_expired). See app/claim.
  const claimUrl = origin
    ? `${origin}/claim?email=${encodeURIComponent(reqRow.email)}`
    : "";
  await sendEmail({
    to: reqRow.email,
    subject: "You're in — set up your Job Alerts account",
    html: approvedEmailHtml(reqRow.first_name, claimUrl),
    text: approvedEmailText(reqRow.first_name, claimUrl),
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

function approvedEmailHtml(firstName: string, claimUrl: string): string {
  const button = claimUrl
    ? `<p style="margin:16px 0;">
         <a href="${claimUrl}" style="background:#3b82e0;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Set up your account</a>
       </p>
       <p style="color:#777;font-size:13px;">On that page, enter your email and we'll send you a one-time code to finish setting up and choose a password.</p>`
    : `<p>Head to the app and use “Set up your account” to finish.</p>`;
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;">
      <h2>You're in, ${escapeHtml(firstName)} 🎉</h2>
      <p>Your access to Job Alerts has been approved. Click below to set up your
      account — we'll email you a quick one-time code to verify it's you, then
      you'll choose a password and land in your dashboard.</p>
      ${button}
      <p style="color:#777;font-size:13px;">If the button doesn't work, the link is also safe to copy into your browser.</p>
    </div>`;
}

function approvedEmailText(firstName: string, claimUrl: string): string {
  const where = claimUrl ? `\n\nSet up your account: ${claimUrl}` : "";
  return `You're in, ${firstName}! Your Job Alerts access is approved. Set up your account, verify with a one-time code we'll email you, choose a password, and you'll reach your dashboard.${where}`;
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
