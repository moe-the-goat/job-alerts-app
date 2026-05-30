import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Start from a pass-through response. setAll reassigns this (carrying any
  // rotated auth cookies) so the refreshed session is written back to the
  // browser. The previous version declared `response` inside setAll and
  // returned an out-of-scope variable, so refreshed cookies never reached the
  // client and the session dropped on the next request.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the session so an expiring access token is refreshed and the rotated
  // cookies are flushed onto supabaseResponse via setAll above.
  await supabase.auth.getUser();

  return supabaseResponse;
}
