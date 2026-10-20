import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DEMO_ACCOUNTS, DEMO_COOKIE, DEMO_SESSION_MS, jsonError, signDemoCookie } from "@/lib/admin/auth";
import { parseBody, rejectCrossOrigin } from "@/lib/api";
import { demoAllowed, getServiceClient, getUserClient } from "@/lib/admin/supabase";
import { ADMIN_ROLES, type AdminRole } from "@/lib/admin/types";
import { localEnabled } from "@/lib/localdb/server";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().max(320), password: z.string().max(200) });

/** constant-time string compare (length is not secret for the fixed demo passwords) */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Server-side admin sign-in for the two modes without a Supabase browser client:
 *   - self-hosted PostgreSQL (DATABASE_URL): password check against auth.users, signed session cookie, admin role required;
 *   - DEMO mode (ALLOW_ADMIN_DEMO=true, no database): the fixed demo accounts.
 * With a Supabase project the browser signs in through Supabase Auth and this route answers 404.
 */
export async function POST(req: NextRequest) {
  const local = localEnabled();
  if (!local && !demoAllowed()) return jsonError("Demo login is disabled", 404);
  if (rejectCrossOrigin(req)) return jsonError("Forbidden", 403);
  if (!/^application\/json/i.test(req.headers.get("content-type") ?? "")) return jsonError("Content-Type must be application/json", 415);
  const limited = await enforceRateLimit(req, { key: "admin:login", max: 20, windowSec: 600, failClosed: true });
  if (limited) return jsonError("Too many attempts", 429, { code: "rate_limited" });
  const body = await parseBody(req, schema, { maxBytes: 2048 });
  if (!body.ok) return jsonError("Invalid credentials", 401);

  if (local) {
    const client = await getUserClient();
    const { data, error } = await client.auth.signInWithPassword({ email: body.data.email, password: body.data.password });
    if (error || !data.user) return jsonError("Invalid credentials", 401);
    const { data: p } = await getServiceClient()!.from("profiles").select("role,is_active").eq("id", data.user.id).maybeSingle();
    if (!p || !p.is_active || !ADMIN_ROLES.includes(p.role as AdminRole)) {
      await client.auth.signOut(); // a portal account (teacher, parent, ...) must not keep a session from the admin login
      return jsonError("Forbidden", 403, { code: "forbidden" });
    }
    return NextResponse.json({ ok: true, role: p.role }, { headers: { "Cache-Control": "no-store" } });
  }

  // always compare against every account so the response time does not reveal which e-mails exist
  let acc: (typeof DEMO_ACCOUNTS)[number] | undefined;
  for (const a of DEMO_ACCOUNTS) if (same(a.email, body.data.email) && same(a.password, body.data.password)) acc = a;
  if (!acc) return jsonError("Invalid credentials", 401);
  const res = NextResponse.json({ ok: true, role: acc.role }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(DEMO_COOKIE, signDemoCookie(acc.email), { httpOnly: true, sameSite: "lax", path: "/", maxAge: DEMO_SESSION_MS / 1000, secure: process.env.NODE_ENV === "production" });
  return res;
}
