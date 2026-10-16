import { NextResponse } from "next/server";
import { envReport } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe. Reports the runtime mode and a cheap DB reachability check.
 * Never returns secrets, URLs or key material - only booleans and counts.
 */
export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, { key: "health", max: 60, windowSec: 60, store: "memory" });
  if (limited) return limited;

  const env = envReport();
  let db: "skipped" | "ok" | "error" = "skipped";
  if (env.mode === "supabase" && env.valid) {
    try {
      const sb = getPublicClient(0);
      if (sb) {
        const { error } = await sb.from("site_settings").select("id").eq("id", 1).abortSignal(AbortSignal.timeout(4000)).maybeSingle();
        db = error ? "error" : "ok";
      }
    } catch {
      db = "error";
    }
  }
  const healthy = env.valid && db !== "error";
  return NextResponse.json(
    // Public probe: no mode/feature/config detail (do not advertise demo admin, service key, etc.).
    { ok: healthy },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}