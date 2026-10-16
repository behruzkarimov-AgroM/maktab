import { NextResponse } from "next/server";
import { apiError, apiOk, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { completePasswordReset } from "@/lib/school/account";
import { failResponse, readBody } from "@/lib/school/api-helpers";
import { backend } from "@/lib/school/db";
import { completeResetSchema } from "@/lib/school/schemas";

/**
 * POST /api/school/auth/complete-reset { token_hash | code, password } -> { reset: true } (public; the e-mail link is the credential)
 * `token_hash` works in any browser (customised recovery template), `code` only in the browser that requested the reset (PKCE).
 * Errors: 422 invalid_token / weak_password, 429 rate_limited (10 / 10 min per IP). The user is signed out afterwards and logs in again.
 * Demo mode: code "demo-reset" (+ optional email of a demo account) stands in for the e-mail link.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    if (rejectCrossOrigin(req)) return apiError("forbidden", 403);
    if (!/^application\/json/i.test(req.headers.get("content-type") ?? "")) return apiError("unsupported", 415);
    const limited = await enforceRateLimit(req, { key: "school:reset-complete", max: 10, windowSec: 600, failClosed: true });
    if (limited) return limited;
    if (backend() === "off") return apiError("not_configured", 501);
    const b = await readBody(req, completeResetSchema, 4096);
    await completePasswordReset(b);
    return apiOk({ reset: true });
  } catch (e) {
    return failResponse(e);
  }
}
