import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LocalizedText } from "@/lib/types";
import type { Database } from "./database.types";
import { isSupabaseConfigured } from "./config";
import { localAnon, localEnabled } from "@/lib/localdb/server";

/**
 * Cookie-less anon client for PUBLIC, cacheable reads in Server Components
 * (does not opt the page into dynamic rendering). Fetches are cached 5 minutes.
 * Returns null in DEMO mode.
 */
export function getPublicClient(revalidateSeconds = 300): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  if (localEnabled()) return localAnon() as unknown as SupabaseClient<Database>;
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, next: { revalidate: revalidateSeconds } } as RequestInit),
    },
  });
}

export type SiteContact = {
  school_name: Partial<LocalizedText> | null;
  address: Partial<LocalizedText> | null;
  phones: string[];
  email: string | null;
  working_hours: Partial<LocalizedText> | null;
  social_links: Partial<Record<"telegram" | "instagram" | "youtube" | "facebook", string>>;
};

/** Contact data for footer/contact page. Returns null when unavailable (use defaults). */
export async function getSiteContact(): Promise<SiteContact | null> {
  const sb = getPublicClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("site_settings")
      .select("school_name,address,phones,email,working_hours,social_links")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      school_name: data.school_name ?? null,
      address: data.address ?? null,
      phones: Array.isArray(data.phones) ? data.phones : [],
      email: data.email ?? null,
      working_hours: data.working_hours ?? null,
      social_links: data.social_links ?? {},
    };
  } catch {
    return null;
  }
}
