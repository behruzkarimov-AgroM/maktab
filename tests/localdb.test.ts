/* eslint-disable @typescript-eslint/no-explicit-any */
// Self-hosted mode (DATABASE_URL, no Supabase) end to end on PGlite with the real schema: the production gateway, password
// sign-in with signed session cookies, admin / school login routes, enrolment with real logins, password change, RLS, uploads.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalGateway } from "@/lib/localdb/gateway";
import { buildLocalDb } from "./helpers/local-fixture";

// in-memory cookie jar standing in for next/headers cookies()
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (n: string, v: string, o?: { maxAge?: number }) => (o?.maxAge === 0 || v === "" ? jar.delete(n) : jar.set(n, v)),
    delete: (n: string) => jar.delete(n),
  }),
  headers: async () => new Headers(),
}));

let gw: LocalGateway;
let close: () => Promise<void>;
let uploadDir: string;
const SITE = "http://localhost";
const req = (path: string, init: RequestInit = {}) =>
  new Request(`${SITE}${path}`, { ...init, headers: { "content-type": "application/json", host: "localhost", origin: SITE, ...(init.headers ?? {}) } });
const post = (path: string, body: unknown) => req(path, { method: "POST", body: JSON.stringify(body) });

beforeAll(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), "ca-uploads-"));
  const built = await buildLocalDb(uploadDir);
  gw = built.gw;
  close = () => built.db.close();
  process.env.DATABASE_URL = "postgres://local/test";
  process.env.AUTH_SECRET = "a".repeat(48);
  process.env.UPLOAD_DIR = uploadDir;
  (globalThis as any).__localGateway = gw; // lib/localdb/server.ts gateway() returns this instance
}, 120_000);
afterAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_SECRET;
  delete process.env.UPLOAD_DIR;
  delete (globalThis as any).__localGateway;
  await close?.();
  rmSync(uploadDir, { recursive: true, force: true });
});
beforeEach(() => jar.clear());

async function user(email: string, password: string, role: string) {
  const { localService } = await import("@/lib/localdb/server");
  const svc = localService();
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  const up = await svc.from("profiles").update({ role, full_name: email.split("@")[0], must_change_password: false }).eq("id", data.user.id);
  expect(up.error).toBeNull();
  return data.user.id as string;
}

describe("gateway auth", () => {
  it("stores scrypt hashes, rejects wrong passwords and duplicate e-mails, the auth trigger creates the profile", async () => {
    const { localService, localAnon } = await import("@/lib/localdb/server");
    const svc = localService();
    const { data } = await svc.auth.admin.createUser({ email: "First.User@School.uz", password: "Secret-pass-1" });
    const row = (await gw.raw((x) => x("select email, encrypted_password from auth.users where id = $1", [data.user.id]))).rows[0];
    expect(row.email).toBe("first.user@school.uz");
    expect(row.encrypted_password).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(row.encrypted_password).not.toContain("Secret-pass-1");
    expect((await svc.from("profiles").select("role").eq("id", data.user.id).single()).data).toEqual({ role: "student" });
    expect((await svc.auth.admin.createUser({ email: "first.user@school.uz", password: "x" })).error?.message).toMatch(/already been registered/);
    expect((await localAnon().auth.signInWithPassword({ email: "first.user@school.uz", password: "nope" })).error).not.toBeNull();
    expect((await localAnon().auth.signInWithPassword({ email: "FIRST.user@school.uz", password: "Secret-pass-1" })).data.user.id).toBe(data.user.id);
  });

  it("RLS applies to anonymous and signed-in clients; the service role bypasses it", async () => {
    const { localAnon, localService } = await import("@/lib/localdb/server");
    expect((await localService().from("students").insert({ first_name: "Ali", last_name: "Valiyev", student_code: "RLS-1" })).error).toBeNull();
    expect((await localAnon().from("students").select("*")).data ?? []).toEqual([]);
    expect((await localAnon().from("students").insert({ first_name: "x", last_name: "y", student_code: "HACK-1" })).error?.code).toBe("42501");
    expect((await localService().from("students").select("id")).data!.length).toBeGreaterThan(0);
    // public content is readable anonymously (seed data)
    expect((await localAnon().from("site_settings").select("id").eq("id", 1).maybeSingle()).data).toEqual({ id: 1 });
  });
});

describe("admin sign-in (POST /api/admin/auth/login)", () => {
  it("super admin: session cookie -> getSession; tampered cookie is ignored; portal accounts are refused with 403", async () => {
    await user("boss@school.uz", "Boss-pass-123", "super_admin");
    await user("teacher1@school.uz", "Teach-pass-123", "teacher");
    const login = await import("@/app/api/admin/auth/login/route");
    const { getSession } = await import("@/lib/admin/auth");

    expect((await login.POST(post("/api/admin/auth/login", { email: "boss@school.uz", password: "wrong" }) as any)).status).toBe(401);
    expect(jar.size).toBe(0);
    const ok = await login.POST(post("/api/admin/auth/login", { email: "boss@school.uz", password: "Boss-pass-123" }) as any);
    expect(ok.status).toBe(200);
    expect(jar.get("ca_session")).toMatch(/^[0-9a-f-]{36}\.\d+\.[\w-]+$/);
    expect(await getSession()).toMatchObject({ email: "boss@school.uz", role: "super_admin", demo: false });

    jar.set("ca_session", jar.get("ca_session")!.replace(/.$/, (c) => (c === "A" ? "B" : "A")));
    expect(await getSession()).toBeNull();

    jar.clear();
    const t = await login.POST(post("/api/admin/auth/login", { email: "teacher1@school.uz", password: "Teach-pass-123" }) as any);
    expect(t.status).toBe(403);
    expect(jar.has("ca_session")).toBe(false);
  });

  it("the admin login page offers the server-side sign-in", async () => {
    const page = await import("@/app/admin/login/page");
    const el = page.default() as any;
    expect(el.props.children.props.mode).toBe("local");
  });
});

describe("enrolment -> real logins -> school portal", () => {
  it("super admin enrols; the student signs in, must change the temporary password, then uses the portal", async () => {
    await user("chief@school.uz", "Chief-pass-123", "super_admin");
    const login = await import("@/app/api/admin/auth/login/route");
    await login.POST(post("/api/admin/auth/login", { email: "chief@school.uz", password: "Chief-pass-123" }) as any);
    const enroll = await import("@/app/api/admin/enroll/route");
    const meta = await (await enroll.GET()).json();
    expect(meta).toMatchObject({ ok: true, demo: false });
    const r = await enroll.POST(post("/api/admin/enroll", {
      student: { last_name: "Каримов", first_name: "Sardor", class_id: meta.classes[0].id },
      guardian: { full_name: "Karimova Mamura", relation: "mother", phone: "+998 90 111 22 33" },
    }) as any);
    expect(r.status).toBe(200);
    const out = await r.json();
    const { email, temp_password } = out.student_account;
    expect(email).toMatch(/^karimov\.sardor\d*@/);
    expect(temp_password).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(out.guardian_account.temp_password).toBeTruthy();

    // the student, in a fresh browser
    jar.clear();
    const sLogin = await import("@/app/api/school/auth/login/route");
    const res = await sLogin.POST(post("/api/school/auth/login", { email, password: temp_password }) as any);
    expect(res.status).toBe(200);
    const me = await import("@/app/api/school/me/route");
    expect(await (await me.GET(req("/api/school/me"))).json()).toMatchObject({ ok: true, must_change_password: true, user: { role: "student" } });
    const students = await import("@/app/api/school/students/route");
    expect((await students.GET(req("/api/school/students"))).status).toBe(403); // password_change_required

    const cp = await import("@/app/api/school/auth/change-password/route");
    expect((await cp.POST(post("/api/school/auth/change-password", { current_password: "wrong", new_password: "Brand-new-77" }) as any)).status).toBe(403);
    expect((await cp.POST(post("/api/school/auth/change-password", { current_password: temp_password, new_password: "Brand-new-77" }) as any)).status).toBe(200);
    const list = await (await students.GET(req("/api/school/students"))).json();
    expect(list.students).toHaveLength(1);
    expect(list.students[0].first_name).toBe("Sardor");

    // the old password no longer works, the new one does
    jar.clear();
    expect((await sLogin.POST(post("/api/school/auth/login", { email, password: temp_password }) as any)).status).toBe(401);
    expect((await sLogin.POST(post("/api/school/auth/login", { email, password: "Brand-new-77" }) as any)).status).toBe(200);
  });
});

describe("initial accounts script on the local database", () => {
  it("creates one login per role that can sign in; a second run leaves them untouched", async () => {
    const { createInitialAccounts } = await import("@/scripts/accounts/create-accounts-lib.mjs");
    const svc = gw.client("service_role");
    const rows = await createInitialAccounts(svc, { domain: "local.test", today: "2026-10-20" });
    expect(rows.map((r) => r.status)).toEqual(Array(7).fill("created"));
    const admin = rows.find((r) => r.role === "super_admin")!;
    const login = await import("@/app/api/admin/auth/login/route");
    expect((await login.POST(post("/api/admin/auth/login", { email: admin.email, password: admin.password }) as any)).status).toBe(200);
    const again = await createInitialAccounts(svc, { domain: "local.test", today: "2026-10-20" });
    expect(again.every((r) => r.status === "exists")).toBe(true);
  });
});

describe("admin CMS on the local database", () => {
  it("dashboard, create a program, list it publicly, update, delete; a psychologist may not write programs", async () => {
    await user("cms@school.uz", "Cms-pass-12345", "super_admin");
    await user("psy@school.uz", "Psy-pass-12345", "psychologist");
    const login = await import("@/app/api/admin/auth/login/route");
    await login.POST(post("/api/admin/auth/login", { email: "cms@school.uz", password: "Cms-pass-12345" }) as any);
    const dash = await import("@/app/api/admin/dashboard/route");
    expect((await dash.GET()).status).toBe(200);

    const res = await import("@/app/api/admin/[resource]/route");
    const one = await import("@/app/api/admin/[resource]/[id]/route");
    const ctx = { params: Promise.resolve({ resource: "programs" }) };
    const title = { uz: "Lokal dastur", ru: "Локальная программа", en: "Local program" };
    const created = await res.POST(post("/api/admin/programs", {
      title, short_description: { uz: "Qisqa", ru: "Кратко", en: "Short" }, category: "middle", grade_range: "5-9", is_active: true,
    }) as any, ctx as any);
    expect(created.status).toBeLessThan(300);
    const row = await created.json();
    const { NextRequest } = await import("next/server");
    const list = await (await res.GET(new NextRequest(req("/api/admin/programs")) as any, ctx as any)).json();
    expect(JSON.stringify(list)).toContain("Lokal dastur");
    const { getPrograms } = await import("@/components/public/data");
    expect((await getPrograms()).some((p: any) => p.title.uz === "Lokal dastur")).toBe(true);

    const idCtx = { params: Promise.resolve({ resource: "programs", id: String(row.id) }) };
    const upd = await one.PATCH(req(`/api/admin/programs/${row.id}`, { method: "PATCH", body: JSON.stringify({ grade_range: "5-11" }) }) as any, idCtx as any);
    expect(upd.status).toBe(200);
    expect((await upd.json()).grade_range).toBe("5-11");

    jar.clear();
    await login.POST(post("/api/admin/auth/login", { email: "psy@school.uz", password: "Psy-pass-12345" }) as any);
    expect((await res.POST(post("/api/admin/programs", { title, category: "middle" }) as any, ctx as any)).status).toBe(403);

    jar.clear();
    await login.POST(post("/api/admin/auth/login", { email: "cms@school.uz", password: "Cms-pass-12345" }) as any);
    expect((await one.DELETE(req(`/api/admin/programs/${row.id}`, { method: "DELETE" }) as any, idCtx as any)).status).toBe(200);
  });
});

describe("uploads and health", () => {
  it("public bucket files are written to UPLOAD_DIR and served from /media; private buckets are not served", async () => {
    const { localService } = await import("@/lib/localdb/server");
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const up = await localService().storage.from("school-media").upload("2026/test.png", png, { contentType: "image/png" });
    expect(up.error).toBeNull();
    const url = localService().storage.from("school-media").getPublicUrl("2026/test.png").data.publicUrl;
    expect(url).toBe("/media/school-media/2026/test.png");
    const media = await import("@/app/media/[bucket]/[...path]/route");
    const ok = await media.GET(new Request(`${SITE}${url}`), { params: Promise.resolve({ bucket: "school-media", path: ["2026", "test.png"] }) });
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer()).equals(png)).toBe(true);
    await localService().storage.from("certificates").upload("quiz/a.pdf", Buffer.from("%PDF-1.4"), {});
    expect((await media.GET(new Request(`${SITE}/media/certificates/quiz/a.pdf`), { params: Promise.resolve({ bucket: "certificates", path: ["quiz", "a.pdf"] }) })).status).toBe(404);
    expect((await media.GET(new Request(`${SITE}/media/school-media/x`), { params: Promise.resolve({ bucket: "school-media", path: ["..", "etc", "passwd.png"] }) })).status).toBe(404);
    expect((await localService().storage.from("school-media").upload("../escape.png", png, {})).error).not.toBeNull();
  });

  it("health reports the local mode with a working database; RPCs work (rate limiter)", async () => {
    const health = await import("@/app/api/health/route");
    const h = await (await health.GET(req("/api/health"))).json();
    expect(h).toMatchObject({ ok: true });
    const { rateLimit } = await import("@/lib/rate-limit");
    const r1 = await rateLimit(req("/x"), { key: "t-local", max: 1, windowSec: 60 });
    const r2 = await rateLimit(req("/x"), { key: "t-local", max: 1, windowSec: 60 });
    expect([r1.store, r1.allowed, r2.allowed]).toEqual(["db", true, false]);
  });
});
