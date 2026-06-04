// Shared auth-cookie options for every Supabase client (browser, server,
// middleware). We set these EXPLICITLY rather than relying on @supabase/ssr's
// implicit default because of a "logs out on tab close" bug:
//
// The library default is maxAge: 400 days, but when auth cookies are written
// during a server action that immediately redirect()s (our loginAction), the
// implicit maxAge does not reliably land on the redirect's Set-Cookie headers
// in the Next 16 App Router — the cookies get written WITHOUT an expiry, i.e.
// as session cookies, so they vanish when the browser/tab closes.
//
// Passing maxAge here on every client forces a persistent expiry on every
// Set-Cookie, so the session survives a browser restart until the user signs
// out (or the 400-day cap, the browser's hard limit for cookie lifetime).
export const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // 400 days

export const authCookieOptions = {
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  // `secure` is added per-environment by the callers (always on in prod;
  // omitted on localhost so http dev still works).
};
