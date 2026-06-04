import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "./cookie-options";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Persistent expiry on every auth cookie — this is the client that runs
      // inside loginAction, where the implicit default maxAge was being dropped
      // on the redirect response, producing session-only cookies (logout on
      // tab close). See cookie-options.ts.
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // Merge maxAge in explicitly too, so the expiry survives even if
              // a caller-supplied options object omits it.
              cookieStore.set(name, value, { ...authCookieOptions, ...options }),
            );
          } catch {
            // Called from a Server Component — middleware handles session refresh instead.
          }
        },
      },
    },
  );
}
