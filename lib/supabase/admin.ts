import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { localEnabled, localService } from "@/lib/localdb/server";

export type AdminClient = SupabaseClient<Database>;

let cached: AdminClient | null = null;

/**
 * Service-role client for trusted server routes ONLY (bypasses RLS).
 * Never import from client components. Returns null when env is missing (DEMO mode).
 */
export function getAdminClient(): AdminClient | null {
  // Defence in depth: the service-role key must never be reachable from browser code.
  if (typeof window !== "undefined") throw new Error("getAdminClient() is server-only");
  if (localEnabled()) return localService() as unknown as AdminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached ??= createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

export function isAdminClientConfigured(): boolean {
  return localEnabled() || Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}