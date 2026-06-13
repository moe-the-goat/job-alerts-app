import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback for every email-link flow Supabase sends us:
 *
 *   - OAuth / PKCE        → ?code=...            → exchangeCodeForSession
 *   - Invite / recovery / → ?token_hash=...&type → verifyOtp
 *     signup confirm / magic link / email change
 *
 * The invite + recovery links (the "Accept invitation" / "Reset password"
 * emails) use the token_hash form, NOT ?code — so handling only ?code left
 * those links dead with "sign-in link is invalid or has expired". Both forms
 * establish a session here; we then route by intent:
 *
 *   - invite / recovery → /auth/reset-password so the user sets a password
 *     (an invited account has none yet; a recovery is explicitly changing it)
 *   - everything else   → ?next (default /dashboard)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  // Flow 1: PKCE / OAuth — a short-lived code we exchange for a session.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Flow 2: email OTP links (invite, recovery, signup, magiclink, email
  // change). verifyOtp consumes the token_hash and establishes the session.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      // Invite + recovery must land on the set-password page — an invited
      // account has no password yet, and recovery is a deliberate change.
      const dest =
        type === "invite" || type === "recovery"
          ? "/auth/reset-password"
          : next;
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  // Nothing usable / expired — back to login with a hint.
  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
