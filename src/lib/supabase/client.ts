import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions } from "./cookie-options";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Force a persistent expiry on auth cookies so the session survives a
      // tab/browser close instead of behaving as a session cookie. See
      // cookie-options.ts for the full rationale.
      cookieOptions: authCookieOptions,
    },
  );
}
