"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-smtp";
import {
  ADMIN_EMAIL,
  adminNotificationHtml,
  mintToken,
  siteOrigin,
} from "@/lib/access-requests";

export type AuthState = {
  ok: boolean;
  error?: string;
  message?: string;
};

function siteUrl(): string {
  // Resolve the canonical app URL the user is currently on, so links in
  // verification emails point back here regardless of preview / prod.
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "";
}

async function resolveOriginFromHeaders(): Promise<string> {
  const h = await headers();
  const fromEnv = siteUrl();
  if (fromEnv) return fromEnv;

  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Closed-beta signup is REQUEST-FIRST: it does NOT create a Supabase account.
 * It files a pending access_request and emails the admin Approve/Reject links.
 * The real account is created only on approval (via invite — see
 * lib/access-requests.approveRequest). So no password is collected here.
 */
export async function signupAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const noteRaw = String(formData.get("note") ?? "").trim();
  const note = noteRaw.length > 0 ? noteRaw.slice(0, 500) : null;

  if (!firstName || !lastName) {
    return { ok: false, error: "Please enter your first and last name." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "Sign-ups aren't available right now. Please try again later.",
    };
  }

  // Already approved + has an account? Point them at login instead of filing
  // a duplicate request. (Best-effort; ignore lookup errors.)
  const { data: existing } = await admin
    .from("access_requests")
    .select("id, status")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number; status: string }>();
  if (existing?.status === "approved") {
    return {
      ok: false,
      error: "This email is already approved — try logging in instead.",
    };
  }
  if (existing?.status === "pending") {
    return {
      ok: true,
      message:
        "You've already requested access — we'll email you once it's reviewed.",
    };
  }

  const { raw: token, hash: tokenHash } = mintToken();

  const { data: inserted, error: insertErr } = await admin
    .from("access_requests")
    .insert({
      email,
      first_name: firstName,
      last_name: lastName,
      note,
      decision_token_hash: tokenHash,
    })
    .select("id")
    .single<{ id: number }>();

  if (insertErr || !inserted) {
    return {
      ok: false,
      error: "Couldn't submit your request. Please try again.",
    };
  }

  // Email the admin with one-click decision links. Failure to send doesn't
  // lose the request — it's in the table and visible on /admin.
  const origin = siteOrigin() || (await resolveOriginFromHeaders());
  const approveUrl = `${origin}/api/access-decision?token=${token}&action=approve`;
  const rejectUrl = `${origin}/api/access-decision?token=${token}&action=reject`;
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `Access request: ${firstName} ${lastName}`,
    html: adminNotificationHtml(
      { first_name: firstName, last_name: lastName, email, note },
      approveUrl,
      rejectUrl,
    ),
    text: `New access request from ${firstName} ${lastName} <${email}>. Approve: ${approveUrl}  Reject: ${rejectUrl}`,
  });

  return {
    ok: true,
    message:
      "Request received! We'll review it and email you. If approved, you'll get an invite to finish setting up your account.",
  };
}

export async function loginAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, error: "Please enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { ok: false, error: error.message };
  redirect("/dashboard");
}

export async function forgotPasswordAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Please enter your email." };

  const supabase = await createClient();
  const origin = await resolveOriginFromHeaders();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    message:
      "If that email is registered, a reset link is on its way. Check your inbox.",
  };
}

export async function resetPasswordAction(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "This reset link has expired. Please request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
