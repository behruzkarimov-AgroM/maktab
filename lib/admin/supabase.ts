// Server-side Supabase helpers used only by the admin CMS.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localEnabled, localService, localUser } from "@/lib/localdb/server";

/** a database is available: a Supabase project, or the self-hosted PostgreSQL (DATABASE_URL, lib/localdb) */
export const isConfigured = () =>
  localEnabled() || (!!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * The demo accounts (admin@demo.uz, director@demo.uz, ...) are CLOSED by default, also in development: they only work when Supabase is
 * not configured AND ALLOW_ADMIN_DEMO=true is set explicitly (tests and local demos), and never on Vercel.
 */
export const demoAllowed = () => !isConfigured() && !process.env.VERCEL_ENV && process.env.ALLOW_ADMIN_DEMO === "true";

export const MAX_SESSION_COOKIE_SECONDS = 14 * 24 * 3600;
/** Normalises Supabase auth cookie options (removal cookies with maxAge 0 are kept as they are). */
export function hardenCookie<T extends { maxAge?: number; sameSite?: boolean | "lax" | "strict" | "none"; secure?: boolean }>(o: T | undefined): T {
  const out = { ...(o ?? {}) } as T;
  if (!(out.maxAge === 0)) out.maxAge = Math.min(out.maxAge ?? MAX_SESSION_COOKIE_SECONDS, MAX_SESSION_COOKIE_SECONDS);
  if (!out.sameSite || out.sameSite === "none") out.sameSite = "lax";
  if (process.env.NODE_ENV === "production") out.secure = true;
  return out;
}

/** Client bound to the visitor's auth cookies (anon key + user JWT, RLS applies). */
export async function getUserClient(): Promise<SupabaseClient> {
  if (localEnabled()) return (await localUser()) as unknown as SupabaseClient;
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          // session cookie hardening: Secure in production, SameSite never "none", persistent sessions capped at 14 days
          list.forEach(({ name, value, options }) => jar.set(name, value, hardenCookie(options)));
        } catch {
          // called from a Server Component: refresh is handled client-side (AuthKeepAlive)
        }
      },
    },
  });
}

let service: SupabaseClient | null = null;
/** Service-role client (bypasses RLS). Only ever used after the caller has been verified as an admin. */
export function getServiceClient(): SupabaseClient | null {
  if (localEnabled()) return localService() as unknown as SupabaseClient;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  service ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}
