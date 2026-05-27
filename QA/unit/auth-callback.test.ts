/**
 * Locks the redirect contract of /auth/callback so a future refactor can't
 * silently change where verification / reset links land.
 *
 *   - valid code + supabase exchange OK  → `next` (default /dashboard)
 *   - valid code + supabase exchange fails → /login?error=invalid_link
 *   - no code                              → /login?error=invalid_link
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: exchangeMock },
  }),
}));

import { GET } from "@/app/auth/callback/route";

function makeRequest(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

describe("/auth/callback", () => {
  beforeEach(() => exchangeMock.mockReset());

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

  it("sends to /login?error=invalid_link when there is no code", async () => {
    const res = await GET(makeRequest("https://x.test/auth/callback"));
    expect(res.headers.get("location")).toBe(
      "https://x.test/login?error=invalid_link",
    );
    expect(exchangeMock).not.toHaveBeenCalled();
  });
});
