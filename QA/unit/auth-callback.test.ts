/**
 * Locks the redirect contract of /auth/callback so a future refactor can't
 * silently change where verification / reset / invite links land.
 *
 *   PKCE (?code):
 *     - exchange OK   → `next` (default /dashboard)
 *     - exchange fails → /login?error=invalid_link
 *   Email OTP (?token_hash&type — invite/recovery/signup/magiclink):
 *     - invite|recovery verify OK → /auth/reset-password (set a password)
 *     - other type verify OK      → `next`
 *     - verify fails              → /login?error=invalid_link
 *   Neither code nor token_hash → /login?error=invalid_link
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: exchangeMock,
      verifyOtp: verifyOtpMock,
    },
  }),
}));

import { GET } from "@/app/auth/callback/route";

function makeRequest(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

describe("/auth/callback", () => {
  beforeEach(() => {
    exchangeMock.mockReset();
    verifyOtpMock.mockReset();
  });

  // ---- PKCE / ?code flow ----------------------------------------------------
  it("redirects to `next` after a successful exchange", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest("https://x.test/auth/callback?code=abc&next=/dashboard"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://x.test/dashboard");
  });

  it("defaults `next` to /dashboard when omitted", async () => {
    exchangeMock.mockResolvedValue({ error: null });
    const res = await GET(makeRequest("https://x.test/auth/callback?code=abc"));
    expect(res.headers.get("location")).toBe("https://x.test/dashboard");
  });

  it("sends to /login?error=invalid_link when exchange fails", async () => {
    exchangeMock.mockResolvedValue({ error: { message: "bad" } });
    const res = await GET(makeRequest("https://x.test/auth/callback?code=abc"));
    expect(res.headers.get("location")).toBe(
      "https://x.test/login?error=invalid_link",
    );
  });

  // ---- Email OTP / ?token_hash flow (invite, recovery, …) -------------------
  it("verifies an invite link and routes to the set-password page", async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest(
        "https://x.test/auth/callback?token_hash=h1&type=invite&next=/dashboard",
      ),
    );
    expect(verifyOtpMock).toHaveBeenCalledWith({
      type: "invite",
      token_hash: "h1",
    });
    // Invite ignores `next` — it must set a password first.
    expect(res.headers.get("location")).toBe(
      "https://x.test/auth/reset-password",
    );
  });

  it("routes a recovery link to the set-password page too", async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest("https://x.test/auth/callback?token_hash=h2&type=recovery"),
    );
    expect(res.headers.get("location")).toBe(
      "https://x.test/auth/reset-password",
    );
  });

  it("routes a non-invite OTP (e.g. magiclink) to `next`", async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest(
        "https://x.test/auth/callback?token_hash=h3&type=magiclink&next=/dashboard",
      ),
    );
    expect(res.headers.get("location")).toBe("https://x.test/dashboard");
  });

  it("sends to /login?error=invalid_link when verifyOtp fails", async () => {
    verifyOtpMock.mockResolvedValue({ error: { message: "expired" } });
    const res = await GET(
      makeRequest("https://x.test/auth/callback?token_hash=h4&type=invite"),
    );
    expect(res.headers.get("location")).toBe(
      "https://x.test/login?error=invalid_link",
    );
  });

  // ---- neither ----------------------------------------------------------------
  it("sends to /login?error=invalid_link when there is no code or token", async () => {
    const res = await GET(makeRequest("https://x.test/auth/callback"));
    expect(res.headers.get("location")).toBe(
      "https://x.test/login?error=invalid_link",
    );
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });
});
