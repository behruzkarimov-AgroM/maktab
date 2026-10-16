// Single adapter to core's Supabase helpers (adjust import path here only if it differs).
import { getServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = any;

/** Returns a server Supabase client or null in demo mode / on failure. */
export async function getDb(): Promise<AnyClient | null> {
  try {
    if (!(await isSupabaseConfigured())) return null;
    return (await getServerClient()) as AnyClient;
  } catch {
    return null;
  }
}
