import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for privileged server-side operations the
 * normal (anon, RLS-bound) client can't do:
 *   * read/write the access_requests table (RLS denies anon/authenticated),
 *   * create accounts on approval via auth.admin.inviteUserByEmail,
 *   * flip profiles.is_whitelisted.
 *
 * NEVER import this from client code or expose the key. It reads
 * SUPABASE_SERVICE_ROLE_KEY (server-only env, set in Vercel) — the same key
 * the worker uses. `server-only` makes a client import a build error.
 *
 * No session persistence: this is a stateless backend client, not a user
 * session, so we disable auto-refresh + cookie storage.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Admin client unavailable: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
