import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError, apiOk, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { demoModeActive, demoSessionFor, SCHOOL_DEMO_COOKIE, signDemoCookie, signInWithPassword } from "@/lib/school/auth";
import { failResponse, readBody } from "@/lib/school/api-helpers";
import { backend } from "@/lib/school/db";
import { homeFor } from "@/lib/school/nav";
import { loginSchema } from "@/lib/school/schemas";

/** POST /api/school/auth/login  { email, password } -> { ok, role, home } (sets the session cookie) */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    if (rejectCrossOrigin(req)) return apiError("forbidden", 403);
    if (!/^application\/json/i.test(req.headers.get("content-type") ?? "")) return apiError("unsupported", 415);
    // per-IP (generous: a whole school can share one NAT address) ...
    const limited = await enforceRateLimit(req, { key: "school:login", max: 40, windowSec: 600, failClosed: true });
    if (limited) return limited;
    const b = backend();
    if (b === "off") return apiError("not_configured", 501);
    const { email, password } = await readBody(req, loginSchema, 4096);
    // ... and per-account (stops password guessing against one address from many IPs). 8 attempts / 15 min, fail-closed.
    const perAccount = await enforceRateLimit(req, {
      key: "school:login-acct", max: 8, windowSec: 900, failClosed: true, identity: createHash("sha256").update(email).digest("hex"),
    });
    if (perAccount) return perAccount;
    if (b === "supabase") {
      // any active account may sign in here; methodist / psychologist are sent on to the admin panel
      const r = await signInWithPassword(email, password, "school");
      if (!r) return apiError("invalid_credentials", 401);
      const toAdmin = r.home === "/admin";
      return apiOk({ role: r.role, home: r.home, must_change_password: toAdmin ? false : r.mustChangePassword });
    }
    if (!demoModeActive()) return apiError("not_configured", 501);
    const s = demoSessionFor(email, password);
    if (!s) return apiError("invalid_credentials", 401);
    const res = apiOk({ role: s.role, home: homeFor(s.role), must_change_password: !!s.mustChangePassword });
    res.cookies.set(SCHOOL_DEMO_COOKIE, signDemoCookie(s.email), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8, secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    return failResponse(e);
  }
}
