// Server-side admin authentication / authorization.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_ROLES, type AdminRole, type AdminSession, type ResourceDef } from "./types";
import { canRead, canWrite, getResource } from "./resources";
import { rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { demoAllowed, getServiceClient, getUserClient, isConfigured } from "./supabase";

export const DEMO_COOKIE = "admin_demo_session";

// Per-process secret: demo sessions are HMAC-signed so a cookie cannot be forged by guessing an e-mail.
const g = globalThis as unknown as { __adminDemoSecret?: string };
const demoSecret = () => (g.__adminDemoSecret ??= randomBytes(32).toString("hex"));
/** demo sessions expire server-side too (not only through the cookie max-age): `<email>~<expMs>.<hmac>` */
export const DEMO_SESSION_MS = 8 * 3600 * 1000;
export function signDemoCookie(email: string, now = Date.now()): string {
  const body = `${email}~${now + DEMO_SESSION_MS}`;
  return `${body}.${createHmac("sha256", demoSecret()).update(body).digest("base64url")}`;
}
export function verifyDemoCookie(value: string | undefined, now = Date.now()): string | null {
  if (!value || value.length > 400) return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const body = value.slice(0, i);
  const a = Buffer.from(value.slice(i + 1));
  const b = Buffer.from(createHmac("sha256", demoSecret()).update(body).digest("base64url"));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const j = body.lastIndexOf("~");
  if (j < 1) return null;
  const exp = Number(body.slice(j + 1));
  return Number.isFinite(exp) && exp > now ? body.slice(0, j) : null;
}

export const DEMO_ACCOUNTS: { email: string; password: string; name: string; role: AdminRole }[] = [
  { email: "admin@demo.uz", password: "demo1234", name: "Demo Super Admin", role: "super_admin" },
  { email: "metodist@demo.uz", password: "demo1234", name: "Demo Metodist", role: "methodist" },
  { email: "psixolog@demo.uz", password: "demo1234", name: "Demo Psixolog", role: "psychologist" },
];

export async function getSession(): Promise<AdminSession | null> {
  if (isConfigured()) {
    try {
      const client = await getUserClient();
      const { data } = await client.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const db = getServiceClient() ?? client;
      const { data: p } = await db.from("profiles").select("role,is_active,full_name").eq("id", user.id).maybeSingle();
      if (!p || !p.is_active || !ADMIN_ROLES.includes(p.role as AdminRole)) return null;
      return {
        id: user.id,
        email: user.email ?? "",
        name: p.full_name || user.email || "Admin",
        role: p.role as AdminRole,
        demo: false,
      };
    } catch {
      return null;
    }
  }
  if (!demoAllowed()) return null;
  const jar = await cookies();
  const email = verifyDemoCookie(jar.get(DEMO_COOKIE)?.value);
  const acc = DEMO_ACCOUNTS.find((a) => a.email === email);
  return acc ? { id: `demo-${acc.role}`, email: acc.email, name: acc.name, role: acc.role, demo: true } : null;
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/** CSRF / content-type check for every non-GET admin route. */
export function checkMutation(req: Request, opts: { json?: boolean; maxBytes?: number } = {}): NextResponse | null {
  if (rejectCrossOrigin(req)) return jsonError("Forbidden", 403);
  // refuse before buffering: the declared length is checked here, the route re-checks the real size after reading
  const declared = Number(req.headers.get("content-length"));
  if (opts.maxBytes && Number.isFinite(declared) && declared > opts.maxBytes) return jsonError("Payload too large", 413);
  if (opts.json !== false) {
    const ct = req.headers.get("content-type") ?? "";
    // DELETE without a body is fine; anything carrying a body must be JSON
    const hasBody = req.method !== "DELETE" || Number(req.headers.get("content-length") ?? 0) > 0;
    if (hasBody && !/^application\/json/i.test(ct)) return jsonError("Content-Type must be application/json", 415);
  }
  return null;
}

/** Stable error response; raw DB / runtime messages are logged, never returned. */
export function failResponse(e: unknown, tag = "admin"): NextResponse {
  const status = (e as { status?: number })?.status;
  if (e instanceof Error && (e as { name?: string }).name === "StoreError") {
    console.error(`[${tag}]`, e.message.slice(0, 200));
    const s = typeof status === "number" ? status : 400;
    return jsonError(s >= 500 ? "server_error" : s === 501 ? "not_configured" : s === 409 ? "conflict" : "db_error", s);
  }
  console.error(`[${tag}]`, e instanceof Error ? e.message.slice(0, 200) : "unknown");
  return jsonError("server_error", 500);
}

export type GuardOk = { session: AdminSession; res: ResourceDef };

/** Verifies the user, role and is_active (inside getSession) and resource permission. */
export async function guard(resourceKey: string, mode: "read" | "write"): Promise<GuardOk | NextResponse> {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  const res = getResource(resourceKey);
  if (!res) return jsonError("Unknown resource", 404);
  const ok = mode === "read" ? canRead(res, session.role) : canWrite(res, session.role);
  if (!ok) return jsonError("Forbidden", 403);
  // per-user throttle (reads are cheap and in-memory; writes use the shared store). Fail-open: a limiter outage must not lock admins out.
  const limited = await enforceRateLimit(new Request("http://local/"), {
    key: mode === "write" ? "admin:w" : "admin:r", identity: session.id, max: mode === "write" ? 240 : 900, windowSec: 60, store: mode === "write" ? "auto" : "memory",
  });
  if (limited) return jsonError("Too many requests", 429, { code: "rate_limited" });
  return { session, res };
}

export const isNextResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;

/** True when a Supabase user is signed in but is not an (active) admin - used to show a precise login error. */
export async function hasNonAdminUser(): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    const { data } = await (await getUserClient()).auth.getUser();
    return !!data.user;
  } catch {
    return false;
  }
}
