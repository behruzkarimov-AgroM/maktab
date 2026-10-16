import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError, apiOk, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/lib/school/account";
import { failResponse, readBody } from "@/lib/school/api-helpers";
import { backend } from "@/lib/school/db";
import { requestResetSchema } from "@/lib/school/schemas";

/**
 * POST /api/school/auth/request-reset { email } -> { sent: true, demo } (public)
 * Supabase: resetPasswordForEmail with redirectTo = NEXT_PUBLIC_SITE_URL/school/reset-password. Demo: nothing is sent (simulated).
 * The answer is identical whether or not the e-mail belongs to an account. Limits: 10 / 10 min per IP, 3 / 10 min per address.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    if (rejectCrossOrigin(req)) return apiError("forbidden", 403);
    if (!/^application\/json/i.test(req.headers.get("content-type") ?? "")) return apiError("unsupported", 415);
    const limited = await enforceRateLimit(req, { key: "school:reset-ip", max: 10, windowSec: 600 });
    if (limited) return limited;
    const b = backend();
    if (b === "off") return apiError("not_configured", 501);
    const { email } = await readBody(req, requestResetSchema, 2048);
    const perMail = await enforceRateLimit(req, { key: "school:reset-mail", max: 3, windowSec: 600, failClosed: true, identity: createHash("sha256").update(email).digest("hex") });
    if (perMail) return perMail;
    await requestPasswordReset(email);
    return apiOk({ sent: true, demo: b === "demo" });
  } catch (e) {
    return failResponse(e);
  }
}
