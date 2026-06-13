"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Account claim via a USER-INITIATED one-time code.
 *
 * Why not the Supabase invite link? Invite/verify links carry a single-use
 * token in the URL. University / corporate mail servers (Microsoft Defender,
 * Proofpoint, etc.) auto-fetch links in incoming email to scan them, which
 * CONSUMES the token before the human clicks — the click then fails with
 * otp_expired. A code the user explicitly requests on this page can't be
 * pre-consumed by a scanner: the scanner can't fill a form or type a 6-digit
 * code. So this is robust across every email provider.
 *
 * Flow: enter email → signInWithOtp emails a code → enter code → verifyOtp
 * establishes the session → /auth/reset-password to set a password → dashboard.
 */
export function ClaimForm({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [email, setEmail] = React.useState(initialEmail);
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError("Enter the email address your invite was sent to.");
      return;
    }
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      // shouldCreateUser:false — the account already exists (created on
      // approval). This sends a one-time login code to an existing user only.
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: false },
      });
      if (otpErr) {
        setError(
          /not found|no user|signups not allowed/i.test(otpErr.message)
            ? "We couldn't find an approved account for that email. Make sure it matches the address you requested access with."
            : otpErr.message,
        );
        return;
      }
      setStep("code");
      setInfo(`We sent a verification code to ${addr}. It expires shortly.`);
    } catch {
      setError("Something went wrong sending the code. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    // Supabase's OTP length is configurable (6–10 digits); don't assume 6.
    if (token.length < 6) {
      setError("Enter the code from your email.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (vErr) {
        setError(
          /expired|invalid/i.test(vErr.message)
            ? "That code is wrong or expired. Request a new one."
            : vErr.message,
        );
        return;
      }
      // Session is live in the browser now — go set a password.
      router.push("/auth/reset-password");
    } catch {
      setError("Couldn't verify the code. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="space-y-4">
        <Input
          name="email"
          type="email"
          label="Your email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
          required
        />
        <Button type="submit" loading={pending} size="lg" width="full">
          {pending ? "Sending code…" : "Send me a code"}
          {!pending && <ArrowRight className="h-4 w-4" />}
        </Button>
        {info && (
          <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
            {info}
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="space-y-4">
      <Input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        label="Verification code"
        placeholder="Code from your email"
        value={code}
        // Strip non-digits; cap at 10 (Supabase's max OTP length) so we never
        // truncate a valid code — the earlier 6-cap chopped 8-digit codes.
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
        error={error ?? undefined}
        hint={info ?? undefined}
        required
      />
      <Button type="submit" loading={pending} size="lg" width="full">
        {pending ? "Verifying…" : "Verify and continue"}
        {!pending && <ArrowRight className="h-4 w-4" />}
      </Button>
      <button
        type="button"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
          setInfo(null);
        }}
        className="w-full text-center text-xs text-[var(--text-tertiary)] underline-offset-4 hover:text-[var(--text-secondary)] hover:underline"
      >
        Use a different email or resend a code
      </button>
    </form>
  );
}
