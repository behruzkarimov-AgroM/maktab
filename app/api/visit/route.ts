import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logError, parseBody, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  path: z.string().min(1).max(300).startsWith("/").regex(/^[^\u0000-\u001f\u007f]*$/),
  locale: z.enum(["uz", "ru", "en"]).optional(),
});

const noContent = () => new NextResponse(null, { status: 204 });

/** Records a page view in site_visits. No-op (204) when Supabase is not configured. Never errors loudly. */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return noContent();
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;

  const ua = req.headers.get("user-agent") ?? "";
  if (/bot|crawl|spider|headless|lighthouse/i.test(ua)) return noContent();

  const limited = await enforceRateLimit(req, { key: "visit", max: 60, windowSec: 60, store: "memory" });
  if (limited) return limited;

  const body = await parseBody(req, bodySchema, { maxBytes: 1024 });
  if (!body.ok) return body.res;

  // Never track admin / API paths
  const { path, locale } = body.data;
  if (path.startsWith("/admin") || path.startsWith("/api")) return noContent();

  try {
    // Public INSERT policy on site_visits was removed: only this rate-limited route writes (service role).
    const client = getAdminClient();
    if (client) {
      const { error } = await client.from("site_visits").insert({ path, locale: locale ?? null });
      if (error) logError("visit", error);
    }
  } catch (e) {
    logError("visit", e); // analytics must never break the site
  }
  return noContent();
}