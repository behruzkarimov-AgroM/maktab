// Server-side authentication for the school portal (/school, /api/school).
// Supabase mode: Supabase Auth cookies + profiles.role / is_active. Demo mode (no Supabase env, same rules as lib/admin/auth.ts):
// HMAC-signed cookie + the fixed demo accounts. Never import from client components.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { demoAllowed, getServiceClient, getUserClient, isConfigured } from "@/lib/admin/supabase";
import { ADMIN_ROLES, type AdminRole } from "@/lib/admin/types";
import { DEMO_ACCOUNTS } from "./demo-data";
import { getDemoStore } from "./demo-store";
import { SchoolError } from "./errors";
import { homeFor } from "./nav";
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

/** Supabase mode: the school session of a known user id (profile role + is_active, teacher / children links). */
async function supabaseSession(userId: string, email: string): Promise<SchoolSession | null> {
  const db = getServiceClient();
  if (!db) return null;
  const { data: p } = await db.from("profiles").select("role,is_active,full_name,must_change_password").eq("id", userId).maybeSingle();
  if (!p || !p.is_active || !SCHOOL_ROLES.includes(p.role as SchoolRole)) return null;
  const role = p.role as SchoolRole;
  let teacherId: string | null = null;
  let studentIds: string[] = [];
  if (role === "teacher") {
    const { data } = await db.from("teachers").select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
    teacherId = data?.id ?? null;
  } else if (role === "parent") {
    const { data: gs } = await db.from("guardians").select("id").eq("user_id", userId);
    const ids = (gs ?? []).map((x) => x.id);
    if (ids.length) {
      const { data } = await db.from("student_guardians").select("student_id").in("guardian_id", ids);
      studentIds = (data ?? []).map((x) => x.student_id);
    }
  } else if (role === "student") {
    const { data } = await db.from("students").select("id").eq("user_id", userId);
    studentIds = (data ?? []).map((x) => x.id);
  }
  return { id: userId, email, name: p.full_name || email || "User", role, demo: false, teacherId, studentIds, mustChangePassword: !!p.must_change_password };
}

/** Resolves the signed-in school user, or null. Verifies role AND is_active. */
export async function getSchoolSession(): Promise<SchoolSession | null> {
  if (isConfigured()) {
    try {
      const user = (await (await getUserClient()).auth.getUser()).data.user;
      if (!user) return null;
      return await supabaseSession(user.id, user.email ?? "");
    } catch {
      return null;
    }
  }
  if (!demoAllowed()) return null;
  const jar = await cookies();
  return buildDemoSession(verifyDemoCookie(jar.get(SCHOOL_DEMO_COOKIE)?.value));
}

/**
 * The session of a user identified WITHOUT a cookie (a Telegram chat linked to that user, see lib/telegram-links.ts).
 * Same checks as a cookie login: active profile with a school role; demo accounts only while demo mode is allowed.
 */
export async function sessionForUserId(userId: string): Promise<SchoolSession | null> {
  if (isConfigured()) {
    try {
      const { data } = (await getServiceClient()?.auth.admin.getUserById(userId)) ?? { data: null };
      return await supabaseSession(userId, data?.user?.email ?? "");
    } catch {
      return null;
    }
  }
  if (!demoAllowed()) return null;
  return buildDemoSession(DEMO_ACCOUNTS.find((a) => a.id === userId)?.email ?? null);
}

/** Throws unauthorized / forbidden. `roles` omitted = any school role. */
export async function requireSession(roles?: SchoolRole[]): Promise<SchoolSession> {
  const s = await getSchoolSession();
  if (!s) throw new SchoolError("unauthorized", 401);
  if (roles && !roles.includes(s.role)) throw new SchoolError("forbidden", 403);
  return s;
}

/** where a signed-in account belongs: the school portal (with its home page) or the site admin panel */
export type SignInResult = { role: string; mustChangePassword: boolean; home: string };

/**
 * The page an active account lands on after signing in, whichever login page it used:
 * school roles -> their portal home (or the change-password screen while the password is temporary),
 * methodist / psychologist -> the admin panel. Super admin: the caller decides (admin login -> /admin, portal login -> director area).
 */
export function landingFor(role: string, mustChangePassword: boolean, prefer: "school" | "admin"): string | null {
  const school = SCHOOL_ROLES.includes(role as SchoolRole);
  const admin = ADMIN_ROLES.includes(role as AdminRole);
  if (admin && (prefer === "admin" || !school)) return "/admin";
  if (school) return mustChangePassword ? "/school/change-password" : homeFor(role as SchoolRole);
  return null;
}

/**
 * Database mode (Supabase or self-hosted): password sign-in on the server (sets the session cookie).
 * Any active account is accepted and told where to go (landingFor); an unknown role or an inactive profile signs out again -> null.
 */
export async function signInWithPassword(email: string, password: string, prefer: "school" | "admin" = "school"): Promise<SignInResult | null> {
  const client = await getUserClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  const db = getServiceClient();
  const { data: p } = await db!.from("profiles").select("role,is_active,must_change_password").eq("id", data.user.id).maybeSingle();
  const home = p?.is_active ? landingFor(p.role, !!p.must_change_password, prefer) : null;
  if (!p || !home) {
    await client.auth.signOut();
    return null;
  }
  return { role: p.role, mustChangePassword: !!p.must_change_password, home };
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
