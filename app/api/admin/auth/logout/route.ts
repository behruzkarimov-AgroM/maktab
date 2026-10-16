import { NextResponse } from "next/server";
import { DEMO_COOKIE, jsonError } from "@/lib/admin/auth";
import { rejectCrossOrigin } from "@/lib/api";
import { getUserClient, isConfigured } from "@/lib/admin/supabase";

export async function POST(req: Request) {
  if (rejectCrossOrigin(req)) return jsonError("Forbidden", 403);
  if (isConfigured()) {
    try {
      // default scope "global": every refresh token of this user is revoked, not only this browser's
      await (await getUserClient()).auth.signOut();
    } catch {
      /* ignore */
    }
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(DEMO_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0, secure: process.env.NODE_ENV === "production" });
  return res;
}
