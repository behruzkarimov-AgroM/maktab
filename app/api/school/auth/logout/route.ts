import { NextResponse } from "next/server";
import { apiError, apiOk, rejectCrossOrigin } from "@/lib/api";
import { SCHOOL_DEMO_COOKIE, signOutSchool } from "@/lib/school/auth";

/** POST /api/school/auth/logout -> { ok } (clears the session) */
export async function POST(req: Request): Promise<NextResponse> {
  if (rejectCrossOrigin(req)) return apiError("forbidden", 403);
  await signOutSchool();
  const res = apiOk();
  res.cookies.set(SCHOOL_DEMO_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
