// Self-hosted mode (DATABASE_URL set, no Supabase): node-postgres pool, signed session cookie, client factories.
// Server only. The rest of the app keeps calling the usual helpers (lib/admin/supabase.ts, lib/supabase/*): they return these
// clients when DATABASE_URL is set.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { Pool } from "pg";
import { LocalGateway, type LocalClient, type SessionPort } from "./gateway";

/** true when the app runs on its own PostgreSQL (DATABASE_URL) instead of a Supabase project */
export const localEnabled = (): boolean => typeof window === "undefined" && !!process.env.DATABASE_URL;

const g = globalThis as unknown as { __localGateway?: LocalGateway; __localPool?: Pool };

export function gateway(): LocalGateway {
  if (!g.__localGateway) {
    const pool = (g.__localPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 10), idleTimeoutMillis: 30_000 }));
    pool.on("error", (e) => console.error("[localdb] idle client error:", e.message));
    g.__localGateway = new LocalGateway(() => pool.connect(), {
      storageDir: process.env.UPLOAD_DIR || undefined,
      publicBuckets: PUBLIC_BUCKETS,
    });
  }
  return g.__localGateway;
}

/** buckets whose files are served publicly under /media/<bucket>/... (certificates stay private) */
export const PUBLIC_BUCKETS = ["school-media", "test-assets"];

// ------------------------------------------------------------------ session cookie: <uid>.<expires ms>.<hmac>
export const SESSION_COOKIE = "ca_session";
export const SESSION_MAX_AGE_S = 14 * 24 * 3600;

function secret(): string {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 32) throw new Error("AUTH_SECRET (32+ characters) is required when DATABASE_URL is set");
  return s;
}
const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function signSession(uid: string, now = Date.now()): string {
  const body = `${uid}.${now + SESSION_MAX_AGE_S * 1000}`;
  return `${body}.${mac(body)}`;
}

export function verifySession(value: string | undefined, now = Date.now()): string | null {
  if (!value || value.length > 200) return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const body = value.slice(0, i);
  const a = Buffer.from(value.slice(i + 1));
  const b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [uid, exp] = body.split(".");
  return /^[0-9a-f-]{36}$/i.test(uid ?? "") && Number(exp) > now ? uid : null;
}

// ------------------------------------------------------------------ factories
/** service role: bypasses RLS (server code that already checked the caller) */
export const localService = (): LocalClient => gateway().client("service_role");

/** anonymous visitor (RLS as role anon) */
export const localAnon = (): LocalClient => gateway().client("anon");

/** the visitor bound to the session cookie (role authenticated when signed in, else anon); sign-in / sign-out write the cookie */
export async function localUser(): Promise<LocalClient> {
  const jar = await cookies();
  let uid = verifySession(jar.get(SESSION_COOKIE)?.value);
  const port: SessionPort = {
    get: () => uid,
    set: (id) => {
      uid = id;
      try {
        jar.set(SESSION_COOKIE, signSession(id), {
          httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_S, secure: process.env.NODE_ENV === "production",
        });
      } catch {
        /* read-only cookies in a Server Component: only route handlers sign in */
      }
    },
    clear: () => {
      uid = null;
      try {
        jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0, secure: process.env.NODE_ENV === "production" });
      } catch {
        /* read-only context */
      }
    },
  };
  return gateway().client("anon", port);
}
