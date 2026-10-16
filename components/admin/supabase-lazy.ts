/**
 * The Supabase browser client (~230 KB) is only needed when Supabase is configured; in demo mode it is never loaded.
 * Components import this tiny module instead of lib/admin/supabase-browser so the SDK stays out of the first-load bundle.
 */
export const supabaseConfigured = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const loadAdminClient = () => import("@/lib/admin/supabase-browser").then((m) => m.getAdminBrowserClient());
