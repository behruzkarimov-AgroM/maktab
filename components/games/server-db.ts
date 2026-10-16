
/**
 * Thin adapter around core's lib/supabase/server so brain code stays decoupled from generated types.
 * Expected exports of "@/lib/supabase/server": getServerClient(), isSupabaseConfigured().
 */
import * as sb from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type LooseClient = any;

export async function getDb(): Promise<LooseClient | null> {
  try {
    if (!sb.isSupabaseConfigured()) return null;
    return (await sb.getServerClient()) as LooseClient;
  } catch {
    return null;
  }
}
