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
  // NOTE: we deliberately do NOT pre-send the one-time code here. Doing so
  // produced a code with nowhere to enter it — /claim opens on its email step
  // and offers to send a fresh code, so the pre-sent one was just confusing.
  // The user requests the code themselves from /claim, which also means they
  // have to open this email — and rescuing it from spam is what teaches their
  // provider to trust the address the daily digest comes from.
  await sendEmail({
    to: reqRow.email,
    // Plain and transactional. "You're in 🎉" reads as promotional, and Gmail
    // is unforgiving about hype in a message that also carries a sign-up link.
    subject: "Set up your Job Alerts account",
    html: approvedEmailHtml(reqRow.first_name, claimUrl),
    text: approvedEmailText(reqRow.first_name, claimUrl),
  });

  return { ok: true };
}


/** Re-send the account-setup ("claim") email to an already-approved user — for
 *  when the original lands in spam or gets lost. Does NOT re-approve or touch the
 *  account; just re-issues the same token-less /claim link. */
export async function resendClaimEmail(
  email: string,
  firstName: string,
): Promise<DecisionResult> {
  if (!email) return { ok: false, error: "No email on file for this user." };
  const origin = siteOrigin();
  const claimUrl = origin
    ? `${origin}/claim?email=${encodeURIComponent(email)}`
    : "";
  try {
    await sendEmail({
      to: email,
      subject: "Set up your Job Alerts account",
      html: approvedEmailHtml(firstName || "there", claimUrl),
      text: approvedEmailText(firstName || "there", claimUrl),
    });
  } catch (e) {
    return { ok: false, error: `Couldn't send the email: ${(e as Error).message}` };
  }
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
  return emailShell(
    `<h1 style="margin:0 0 4px;font-size:20px;">New access request</h1>
      <p style="margin:8px 0;color:#4c5a70;">Someone asked to join the closed beta.</p>
      <table style="border-collapse:collapse;margin:12px 0;font-size:14px;">
        <tr><td style="padding:2px 12px 2px 0;color:#8b95a5;">Name</td><td>${escapeHtml(reqRow.first_name)} ${escapeHtml(reqRow.last_name)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#8b95a5;">Email</td><td>${escapeHtml(reqRow.email)}</td></tr>
      </table>
      ${note}
      <p style="margin:16px 0;">
        <a href="${approveUrl}" style="background:#12233a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;display:inline-block;">Approve</a>
        &nbsp;&nbsp;
        <a href="${rejectUrl}" style="background:#b3372b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;display:inline-block;">Reject</a>
      </p>
      <p style="margin:8px 0;color:#8b95a5;font-size:12px;">Approving emails them a setup link. No password is ever shown to you.</p>`,
    `${reqRow.first_name} ${reqRow.last_name} asked to join the beta.`,
  );
}

/**
 * Wraps an email body in a complete, mobile-friendly HTML document.
 *
 * A bare `<div>` fragment (no doctype/head/body) is treated as malformed by
 * spam filters — one of the reasons the very first email a new user gets was
 * landing in their junk folder. `preheader` is the hidden preview line clients
 * show beside the subject; without one they scrape whatever text comes first.
 */
function emailShell(bodyHtml: string, preheader: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Job Alerts</title></head>
<body style="margin:0;padding:24px 16px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#131c2a;line-height:1.55;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 26px;">
${bodyHtml}
</div>
</body></html>`;
}

/** Shared sign-off. Saying WHY the message arrived is standard practice for
 *  legitimate transactional mail and reads as trustworthy to filters and to
 *  the person reading it. */
function whyYouGotThis(extra = ""): string {
  return `<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e6eaf0;color:#8b95a5;font-size:12px;">
    You're receiving this because you requested access to Job Alerts with this
    email address.${extra ? ` ${extra}` : ""}</p>`;
}

function approvedEmailHtml(firstName: string, claimUrl: string): string {
  // The link is shown as readable text as well as a button: a single mystery
  // button with no visible destination is the shape of a phishing email, and
  // both filters and cautious humans treat it that way.
  const action = claimUrl
    ? `<p style="margin:22px 0 10px;">
         <a href="${claimUrl}" style="background:#12233a;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;display:inline-block;">Set up your account</a>
       </p>
       <p style="margin:0 0 4px;color:#4c5a70;font-size:13px;">Or open this link:</p>
       <p style="margin:0;font-size:13px;word-break:break-all;"><a href="${claimUrl}" style="color:#1f3a5f;">${escapeHtml(claimUrl)}</a></p>`
    : `<p style="margin:22px 0;">Open the app and choose &ldquo;Set up your account&rdquo; to finish.</p>`;
  return emailShell(
    `<h1 style="margin:0 0 12px;font-size:20px;">Your access is approved, ${escapeHtml(firstName)}</h1>
     <p style="margin:0 0 10px;color:#4c5a70;">Job Alerts scores job listings against your CV and emails you the ones that match. Your request to join the beta has been approved.</p>
     <p style="margin:0;color:#4c5a70;">Open the page below and enter your email — we'll send you a 6-digit code to confirm it's you, then you choose a password.</p>
     ${action}
     ${whyYouGotThis("If it wasn't you, you can ignore this message — the account stays inactive until setup is completed.")}`,
    `Set up your Job Alerts account — one 6-digit code and a password.`,
  );
}

function approvedEmailText(firstName: string, claimUrl: string): string {
  const where = claimUrl ? `\n\nSet up your account:\n${claimUrl}\n` : "\n";
  return (
    `Your access is approved, ${firstName}.\n\n` +
    `Job Alerts scores job listings against your CV and emails you the ones that match. ` +
    `Your request to join the beta has been approved.\n\n` +
    `Open the page below and enter your email — we'll send you a 6-digit code ` +
    `to confirm it's you, then you choose a password.${where}` +
    `\n--\nYou're receiving this because you requested access to Job Alerts with ` +
    `this email address. If it wasn't you, ignore this message — the account ` +
    `stays inactive until setup is completed.\n`
  );
}

function rejectedEmailHtml(firstName: string): string {
  return emailShell(
    `<h1 style="margin:0 0 12px;font-size:20px;">About your request, ${escapeHtml(firstName)}</h1>
     <p style="margin:0 0 10px;color:#4c5a70;">Thanks for your interest in Job Alerts. We're a small closed beta right now and can't add your account at this time.</p>
     <p style="margin:0;color:#4c5a70;">We may open up more spots later — feel free to try again then.</p>
     ${whyYouGotThis()}`,
    "An update on your Job Alerts access request.",
  );
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
