// Super admin enrolment (lib/school/enroll.ts + /api/admin/enroll) in demo mode: student + guardian + both logins in one step.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoAuthState } from "@/lib/school/auth";
import { resetDemoStore } from "@/lib/school/demo-store";
import { DEFAULT_EMAIL_DOMAIN, enrollStudent, latinSlug, loginEmail, schoolEmailDomain } from "@/lib/school/enroll";
import { SchoolError } from "@/lib/school/errors";
import { loadCtx, type Ctx } from "@/lib/school/service";
import type { SchoolRole, SchoolSession } from "@/lib/school/types";

const TODAY = "2026-10-15";
beforeEach(() => {
  resetDemoStore(TODAY);
  demoAuthState().mustChange.clear();
  (globalThis as { __demoLogins?: Set<string> }).__demoLogins?.clear();
  vi.unstubAllEnvs();
});

const ctxFor = (role: SchoolRole): Promise<Ctx> =>
  loadCtx({ id: `demo-${role}`, email: `${role}@demo.uz`, name: role, role, demo: true, teacherId: null, studentIds: [] } satisfies SchoolSession);
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof SchoolError ? e.code : String(e)));

describe("login names", () => {
  it("transliterates Cyrillic, drops apostrophes and keeps two name parts", () => {
    expect(latinSlug("Каримов")).toBe("karimov");
    expect(latinSlug("Ma'mura")).toBe("mamura");
    expect(latinSlug("Ғайратжон")).toBe("gayratjon");
    expect(loginEmail(["Karimova", "Ma'mura", "Olimovna"], "school.uz")).toBe("karimova.mamura@school.uz");
    expect(loginEmail(["Karimov", "Sardor"], "school.uz", 3)).toBe("karimov.sardor3@school.uz");
    expect(loginEmail(["!!!"], "school.uz")).toBe("user@school.uz");
  });
  it("uses SCHOOL_EMAIL_DOMAIN when it is a valid domain", () => {
    expect(schoolEmailDomain()).toBe(DEFAULT_EMAIL_DOMAIN);
    vi.stubEnv("SCHOOL_EMAIL_DOMAIN", "@Maktab.UZ");
    expect(schoolEmailDomain()).toBe("maktab.uz");
    vi.stubEnv("SCHOOL_EMAIL_DOMAIN", "not a domain");
    expect(schoolEmailDomain()).toBe(DEFAULT_EMAIL_DOMAIN);
  });
});

describe("enrollStudent", () => {
  it("creates the student, the guardian, the link and two temporary-password logins", async () => {
    const c = await ctxFor("super_admin");
    const cls = c.classes[0];
    const r = await enrollStudent(c, {
      student: { last_name: "Каримов", first_name: "Sardor", birth_date: "2016-05-12", gender: "m", class_id: cls.id },
      guardian: { full_name: "Karimova Ma'mura", relation: "mother", phone: "+998 90 555 11 22" },
    });
    expect(r.student).toMatchObject({ class_id: cls.id, status: "active", user_id: r.student_account.user_id });
    expect(r.student_account).toMatchObject({ email: `karimov.sardor@${DEFAULT_EMAIL_DOMAIN}`, must_change_password: true });
    expect(r.guardian_account).toMatchObject({ email: `karimova.mamura@${DEFAULT_EMAIL_DOMAIN}`, must_change_password: true });
    expect(r.guardian_reused).toBe(false);
    const links = await c.db.select("student_guardians", { eq: { student_id: r.student.id } });
    expect(links).toEqual([expect.objectContaining({ guardian_id: r.guardian.id, is_primary: true })]);
    expect(demoAuthState().mustChange.has(r.student_account.user_id)).toBe(true);
  });

  it("a sibling with the same parent phone is linked to the existing parent (no second parent login)", async () => {
    const c = await ctxFor("super_admin");
    const first = await enrollStudent(c, { student: { last_name: "Karimov", first_name: "Sardor" }, guardian: { full_name: "Karimova Mamura", relation: "mother", phone: "+998905551122" } });
    const second = await enrollStudent(c, { student: { last_name: "Karimova", first_name: "Laylo" }, guardian: { full_name: "Karimova Mamura", relation: "mother", phone: "90 555-11-22" } });
    expect(second.guardian_reused).toBe(true);
    expect(second.guardian.id).toBe(first.guardian.id);
    expect(second.guardian_account).toBeNull();
    expect((await c.db.select("student_guardians", { eq: { guardian_id: first.guardian.id } })).length).toBe(2);
  });

  it("two students with the same name get different logins", async () => {
    const c = await ctxFor("super_admin");
    const a = await enrollStudent(c, { student: { last_name: "Aliyev", first_name: "Bobur" }, guardian: { full_name: "Aliyev Jasur", relation: "father" } });
    const b = await enrollStudent(c, { student: { last_name: "Aliyev", first_name: "Bobur" }, guardian: { full_name: "Aliyev Jasur", relation: "father" } });
    expect(a.student_account.email).not.toBe(b.student_account.email);
    expect(b.student_account.email).toBe(`aliyev.bobur2@${DEFAULT_EMAIL_DOMAIN}`);
    expect(b.guardian_account?.email).toBe(`aliyev.jasur2@${DEFAULT_EMAIL_DOMAIN}`);
  });

  it("an unknown class is refused before anything is written; non-directors are refused", async () => {
    const c = await ctxFor("super_admin");
    const before = (await c.db.select("students")).length;
    const bad = { student: { last_name: "X", first_name: "Y", class_id: "00000000-0000-4000-8000-00000000ffff" }, guardian: { full_name: "Z Z", relation: "mother" as const } };
    expect(await code(enrollStudent(c, bad))).toBe("not_found");
    expect((await c.db.select("students")).length).toBe(before);
    expect(await code(enrollStudent(await ctxFor("teacher"), { ...bad, student: { last_name: "X", first_name: "Y" } }))).toBe("forbidden");
  });

  it("a parent e-mail that is already taken is reported and the new student is rolled back", async () => {
    const c = await ctxFor("super_admin");
    await enrollStudent(c, { student: { last_name: "A", first_name: "B" }, guardian: { full_name: "Ota Birinchi", relation: "father", email: "ota@example.uz" } });
    const before = (await c.db.select("students")).length;
    expect(await code(enrollStudent(c, { student: { last_name: "C", first_name: "D" }, guardian: { full_name: "Ota Ikkinchi", relation: "father", email: "ota@example.uz" } }))).toBe("conflict");
    expect((await c.db.select("students")).length).toBe(before);
  });
});

describe("/api/admin/enroll", () => {
  it("anonymous 401; non-super-admin roles 403; cross-site POST 403", async () => {
    vi.resetModules();
    vi.doMock("@/lib/admin/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/admin/auth")>()), getSession: async () => null }));
    let route = await import("@/app/api/admin/enroll/route");
    expect((await route.GET()).status).toBe(401);

    vi.resetModules();
    vi.doMock("@/lib/admin/auth", async (orig) => ({
      ...(await orig<typeof import("@/lib/admin/auth")>()),
      getSession: async () => ({ id: "demo-methodist", email: "m@demo.uz", name: "M", role: "methodist" as const, demo: true }),
    }));
    route = await import("@/app/api/admin/enroll/route");
    expect((await route.GET()).status).toBe(403);
    const req = new Request("http://localhost/api/admin/enroll", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", host: "localhost" }, body: "{}" });
    expect((await route.POST(req as never)).status).toBe(403);
    vi.doUnmock("@/lib/admin/auth");
  });

  it("super admin: GET lists classes, POST validates field paths and enrols", async () => {
    vi.resetModules();
    vi.doMock("@/lib/admin/auth", async (orig) => ({
      ...(await orig<typeof import("@/lib/admin/auth")>()),
      getSession: async () => ({ id: "demo-super_admin", email: "admin@demo.uz", name: "A", role: "super_admin" as const, demo: true }),
    }));
    const route = await import("@/app/api/admin/enroll/route");
    const meta = await (await route.GET()).json();
    expect(meta).toMatchObject({ ok: true, domain: DEFAULT_EMAIL_DOMAIN, demo: true });
    expect(meta.classes.length).toBeGreaterThan(0);

    const post = (body: unknown) =>
      route.POST(new Request("http://localhost/api/admin/enroll", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" }, body: JSON.stringify(body) }) as never);
    const bad = await post({ student: { last_name: "", first_name: "X" }, guardian: { full_name: "ab", relation: "mother", phone: "12" } });
    expect(bad.status).toBe(422);
    expect((await bad.json()).fields).toEqual(expect.arrayContaining(["student.last_name", "guardian.full_name", "guardian.phone"]));

    const ok = await post({ student: { last_name: "Rahimov", first_name: "Aziz", class_id: meta.classes[0].id, gender: "", birth_date: "" }, guardian: { full_name: "Rahimova Dilnoza", relation: "mother", phone: "", email: "" } });
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.student_account.email).toBe(`rahimov.aziz@${DEFAULT_EMAIL_DOMAIN}`);
    expect(j.guardian_account.email).toBe(`rahimova.dilnoza@${DEFAULT_EMAIL_DOMAIN}`);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    vi.doUnmock("@/lib/admin/auth");
  });
});
