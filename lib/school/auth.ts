// Server-side authentication for the school portal (/school, /api/school).
// Supabase mode: Supabase Auth cookies + profiles.role / is_active. Demo mode (no Supabase env, same rules as lib/admin/auth.ts):
// HMAC-signed cookie + the fixed demo accounts. Never import from client components.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { demoAllowed, getServiceClient, getUserClient, isConfigured } from "@/lib/admin/supabase";
import { DEMO_ACCOUNTS } from "./demo-data";
import { getDemoStore } from "./demo-store";
import { SchoolError } from "./errors";
import { SCHOOL_ROLES, type SchoolRole, type SchoolSession } from "./types";

export const SCHOOL_DEMO_COOKIE = "school_demo_session";

// Per-process secret: demo sessions are HMAC-signed so a cookie cannot be forged by guessing an e-mail.
const g = globalThis as unknown as { __schoolDemoSecret?: string };
const secret = () => (g.__schoolDemoSecret ??= randomBytes(32).toString("hex"));

/** demo sessions expire server-side too: `<email>~<expMs>.<hmac>` */
export const DEMO_SESSION_MS = 8 * 3600 * 1000;
export function signDemoCookie(email: string, now = Date.now()): string {
  const body = `${email}~${now + DEMO_SESSION_MS}`;
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
export function verifyDemoCookie(value: string | undefined, now = Date.now()): string | null {
  if (!value || value.length > 400) return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const body = value.slice(0, i);
  const a = Buffer.from(value.slice(i + 1));
  const b = Buffer.from(createHmac("sha256", secret()).update(body).digest("base64url"));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const j = body.lastIndexOf("~");
  if (j < 1) return null;
  const exp = Number(body.slice(j + 1));
  return Number.isFinite(exp) && exp > now ? body.slice(0, j) : null;
}

export const demoModeActive = () => !isConfigured() && demoAllowed();

/** demo accounts shown as login shortcuts (empty when demo mode is off) */
export function demoLoginHints(): { email: string; role: SchoolRole; name: string }[] {
  return demoModeActive() ? DEMO_ACCOUNTS.map(({ email, role, name }) => ({ email, role, name })) : [];
}

/** Demo-mode account state (per process, resets on restart): password changes and the "must change password" flag. */
export interface DemoAuthState {
  passwords: Map<string, string>; // email -> current password (absent = the fixed demo password)
  mustChange: Set<string>; // account ids that have to change their temporary password
}
export function demoAuthState(): DemoAuthState {
  const gg = globalThis as unknown as { __schoolDemoAuth?: DemoAuthState };
  return (gg.__schoolDemoAuth ??= { passwords: new Map(), mustChange: new Set() });
}

export function demoSessionFor(email: string, password: string): SchoolSession | null {
  const acc = DEMO_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase());
  if (!acc) return null;
  const a = Buffer.from(demoAuthState().passwords.get(acc.email) ?? acc.password);
  const b = Buffer.from(password);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return buildDemoSession(acc.email);
}

function buildDemoSession(email: string | null): SchoolSession | null {
  const acc = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!acc) return null;
  const t = getDemoStore().tables;
  const teacher = acc.role === "teacher" ? t.teachers.find((x) => x.user_id === acc.id) : undefined;
  let studentIds: string[] = [];
  if (acc.role === "parent") {
    const gids = t.guardians.filter((x) => x.user_id === acc.id).map((x) => x.id);
    studentIds = t.student_guardians.filter((l) => gids.includes(l.guardian_id)).map((l) => l.student_id);
  } else if (acc.role === "student") {
    studentIds = t.students.filter((s) => s.user_id === acc.id).map((s) => s.id);
  }
  return {
    id: acc.id, email: acc.email, name: acc.name, role: acc.role, demo: true, teacherId: teacher?.id ?? null, studentIds,
    mustChangePassword: demoAuthState().mustChange.has(acc.id),
  };
}

/** Resolves the signed-in school user, or null. Verifies role AND is_active. */
export async function getSchoolSession(): Promise<SchoolSession | null> {
  if (isConfigured()) {
    try {
      const user = (await (await getUserClient()).auth.getUser()).data.user;
      if (!user) return null;
      const db = getServiceClient();
      if (!db) return null;
      const { data: p } = await db.from("profiles").select("role,is_active,full_name,must_change_password").eq("id", user.id).maybeSingle();
      if (!p || !p.is_active || !SCHOOL_ROLES.includes(p.role as SchoolRole)) return null;
      const role = p.role as SchoolRole;
      let teacherId: string | null = null;
      let studentIds: string[] = [];
      if (role === "teacher") {
        const { data } = await db.from("teachers").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle();
        teacherId = data?.id ?? null;
      } else if (role === "parent") {
        const { data: gs } = await db.from("guardians").select("id").eq("user_id", user.id);
        const ids = (gs ?? []).map((x) => x.id);
        if (ids.length) {
          const { data } = await db.from("student_guardians").select("student_id").in("guardian_id", ids);
          studentIds = (data ?? []).map((x) => x.student_id);
        }
      } else if (role === "student") {
        const { data } = await db.from("students").select("id").eq("user_id", user.id);
        studentIds = (data ?? []).map((x) => x.id);
      }
      return { id: user.id, email: user.email ?? "", name: p.full_name || user.email || "User", role, demo: false, teacherId, studentIds, mustChangePassword: !!p.must_change_password };
    } catch {
      return null;
    }
  }
  if (!demoAllowed()) return null;
  const jar = await cookies();
  return buildDemoSession(verifyDemoCookie(jar.get(SCHOOL_DEMO_COOKIE)?.value));
}

/** Throws unauthorized / forbidden. `roles` omitted = any school role. */
export async function requireSession(roles?: SchoolRole[]): Promise<SchoolSession> {
  const s = await getSchoolSession();
  if (!s) throw new SchoolError("unauthorized", 401);
  if (roles && !roles.includes(s.role)) throw new SchoolError("forbidden", 403);
  return s;
}

/** Supabase mode: password sign-in on the server (sets the auth cookies). Returns the role (+ the temp-password flag) or null. */
export async function signInWithPassword(email: string, password: string): Promise<{ role: SchoolRole; mustChangePassword: boolean } | null> {
  const client = await getUserClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  const db = getServiceClient();
  const { data: p } = await db!.from("profiles").select("role,is_active,must_change_password").eq("id", data.user.id).maybeSingle();
  if (!p || !p.is_active || !SCHOOL_ROLES.includes(p.role as SchoolRole)) {
    await client.auth.signOut();
    return null;
  }
  return { role: p.role as SchoolRole, mustChangePassword: !!p.must_change_password };
}

export async function signOutSchool(): Promise<void> {
  if (isConfigured()) {
    try {
      await (await getUserClient()).auth.signOut();
    } catch {
      /* ignore */
    }
  }
}
