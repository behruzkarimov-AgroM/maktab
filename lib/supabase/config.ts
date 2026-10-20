/**
 * True when a database is available: a Supabase project (public env vars) or the self-hosted PostgreSQL (DATABASE_URL, server
 * side only; see lib/localdb). Otherwise: DEMO mode.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
      (typeof window === "undefined" && process.env.DATABASE_URL),
  );
}
