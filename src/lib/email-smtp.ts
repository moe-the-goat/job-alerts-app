import "server-only";

import nodemailer from "nodemailer";

/**
 * Gmail-SMTP sender for the web app's transactional mail (admin access-request
 * notices + applicant decision emails). Mirrors the worker's
 * pipeline/core_email_smtp.py: same SENDER_EMAIL / EMAIL_APP_PASSWORD secrets,
 * same implicit-TLS port 465, same redaction style — so both halves of the
 * system send mail the same way and from the same address.
 *
 * Never throws on a send failure: returns { ok, error } so a caller (a server
 * action approving a user) isn't taken down by a transient SMTP hiccup. The
 * account/decision still lands; only the courtesy email is lost.
 *
 * `server-only` guards against this module ever being pulled into a client
 * bundle (it reads the app password from env).
 */

const SMTP_HOST = process.env.SMTP_SERVER || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

/** Friendly sender name; matches the worker's SENDER_DISPLAY_NAME. */
const SENDER_DISPLAY_NAME = "Job Alerts";

/**
 * Last-resort text/plain rendering, so a caller that forgets `text` still
 * sends multipart rather than HTML-only. Keeps link targets visible — a text
 * part whose links vanished is useless to whoever reads it.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href, label) => `${String(label).replace(/<[^>]+>/g, "").trim()} (${href})`,
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<SendResult> {
  const sender = process.env.SENDER_EMAIL ?? "";
  const appPassword = process.env.EMAIL_APP_PASSWORD ?? "";

  if (!sender || !appPassword) {
    console.error(
      "[email-smtp] SENDER_EMAIL / EMAIL_APP_PASSWORD not set — skipping email to",
      redactEmail(to),
    );
    return { ok: false, error: "SENDER_EMAIL or EMAIL_APP_PASSWORD not set" };
  }
  if (!to || !to.includes("@")) {
    console.error("[email-smtp] refusing to send to invalid address:", to);
    return { ok: false, error: `invalid recipient: ${to}` };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // implicit TLS on 465
    auth: { user: sender, pass: appPassword },
  });

  try {
    await transporter.sendMail({
      // Display name + Reply-To: a bare address reads as machine-generated
      // bulk to spam filters, and these are the emails that carry the invite
      // link — they cannot afford to land in a junk folder.
      from: { name: SENDER_DISPLAY_NAME, address: sender },
      replyTo: sender,
      to,
      subject,
      // Always send a text/plain alternative alongside the HTML: HTML-only
      // mail is a long-standing spam signal.
      text: text ?? htmlToText(html),
      html,
      headers: { "Auto-Submitted": "auto-generated" },
    });
    console.info("[email-smtp] OK ->", redactEmail(to));
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email-smtp] send failed to", redactEmail(to), "-", msg);
    return { ok: false, error: msg };
  }
}

/** `mohaabuhijleh@gmail.com` -> `m***h@gmail.com`. Matches the worker's redactor. */
export function redactEmail(email: string): string {
  if (!email || !email.includes("@")) return "<invalid>";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local.slice(0, 1)}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
