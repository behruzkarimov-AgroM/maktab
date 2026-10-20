/* eslint-disable @typescript-eslint/no-explicit-any */
// Supabase mode against the REAL supabase/schema.sql in PGlite (see supabase-sim.test.ts for the shim):
//  - scripts/accounts/create-accounts-lib.mjs: one login per role + the sample teacher / student / parent records, idempotent
//  - lib/school/enroll.ts: student + parent + both logins, unique logins on conflict, rollback on failure
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PgGateway } from "./helpers/pglite-supabase";
import { buildFixture, CLS_A, U, type Fixture } from "./helpers/school-fixture";

const h = vi.hoisted(() => ({ gw: null as any }));
vi.mock("@/lib/admin/supabase", () => ({
  isConfigured: () => true,
  demoAllowed: () => false,
  getServiceClient: () => h.gw.service(),
  getUserClient: async () => h.gw.anon(),
}));

import { accountSpecs, createInitialAccounts, credentialsMarkdown, strongPassword } from "@/scripts/accounts/create-accounts-lib.mjs";
import { enrollStudent } from "@/lib/school/enroll";
import { SchoolError } from "@/lib/school/errors";
import { loadCtx } from "@/lib/school/svc-core";

let fx: Fixture;
let gw: PgGateway;
const one = async (sql: string, p?: unknown[]) => (await gw.raw((x) => x(sql, p))).rows[0] as any;
const DOMAIN = "maktab.test";

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SCHOOL_EMAIL_DOMAIN = DOMAIN;
  fx = await buildFixture();
  gw = fx.gw;
  h.gw = gw;
}, 120_000);
afterAll(async () => {
  delete process.env.SCHOOL_EMAIL_DOMAIN;
  await fx?.db.close();
});

describe("initial accounts script", () => {
  it("creates one login per role with the right profile role, and the records the portal roles need", async () => {
    const rows = await createInitialAccounts(gw.service(), { domain: DOMAIN, today: "2026-10-15" });
    expect(rows.map((r) => r.status)).toEqual(Array(7).fill("created"));
    for (const r of rows) {
      expect(r.password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{14}$/);
      const p = await one("select role::text, is_active, must_change_password from public.profiles where id = $1", [r.user_id]);
      expect(p).toMatchObject({ role: r.role, is_active: true, must_change_password: !["methodist", "psychologist"].includes(r.role) });
    }
    const by = Object.fromEntries(rows.map((r) => [r.role, r.user_id]));
    expect(await one("select count(*)::int n from public.teachers where user_id = $1", [by.teacher])).toEqual({ n: 1 });
    const st = await one("select id, class_id from public.students where user_id = $1", [by.student]);
    expect(st.class_id).not.toBeNull();
    const link = await one(
      "select sg.is_primary from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where g.user_id = $1 and sg.student_id = $2",
      [by.parent, st.id],
    );
    expect(link).toEqual({ is_primary: true });
  });

  it("a second run leaves existing logins untouched; --reset issues new passwords", async () => {
    const again = await createInitialAccounts(gw.service(), { domain: DOMAIN, today: "2026-10-15" });
    expect(again.every((r) => r.status === "exists" && r.password === null)).toBe(true);
    expect(await one("select count(*)::int n from public.teachers where email = $1", [`oqituvchi@${DOMAIN}`])).toEqual({ n: 1 });
    const reset = await createInitialAccounts(gw.service(), { domain: DOMAIN, today: "2026-10-15", reset: true });
    expect(reset.every((r) => r.status === "reset" && !!r.password)).toBe(true);
    const admin = reset.find((r) => r.role === "super_admin")!;
    expect(gw.users.get(admin.user_id!)?.password).toBe(admin.password);
  });

  it("writes a markdown table with every role, login and portal", () => {
    const md = credentialsMarkdown(
      accountSpecs("x.uz").map((s) => ({ ...s, status: "created" as const, password: "Pw1", user_id: "u" })),
      "https://x.uz",
      new Date("2026-10-20T10:00:00Z"),
    );
    expect(md).toContain("| Super admin | `admin@x.uz` | `Pw1` | https://x.uz/admin/login | yangi |");
    expect(md).toContain("| Ota-ona | `ota-ona@x.uz` |");
    expect(strongPassword()).toHaveLength(14);
  });
});

describe("Telegram links in Supabase mode", () => {
  it("code -> link -> session; single use; guardian chat id synced; unlink clears; tables closed to anon / authenticated", async () => {
    const { createLinkCode, redeemLinkCode, userForChat, unlink } = await import("@/lib/telegram-links");
    const { sessionForUserId } = await import("@/lib/school/auth");
    const { code } = await createLinkCode(U.par);
    expect(await one("select count(*)::int n from public.telegram_link_codes where user_id = $1 and code_hash <> $2", [U.par, code])).toEqual({ n: 1 });
    expect(await redeemLinkCode(code, "777000111", "ota")).toBe(U.par);
    await expect(redeemLinkCode(code, "777000222", null)).rejects.toMatchObject({ code: "invalid_token" });
    expect(await userForChat("777000111")).toBe(U.par);
    expect(await one("select telegram_chat_id from public.guardians where user_id = $1", [U.par])).toEqual({ telegram_chat_id: "777000111" });
    const s = await sessionForUserId(U.par);
    expect(s).toMatchObject({ id: U.par, role: "parent", demo: false });
    expect(s!.studentIds.length).toBeGreaterThan(0);
    expect((await gw.as(U.par).from("telegram_links").select("*")).error).not.toBeNull();
    expect((await gw.anon().from("telegram_link_codes").select("*")).error).not.toBeNull();
    expect(await unlink({ chatId: "777000111" })).toBe(true);
    expect(await one("select telegram_chat_id from public.guardians where user_id = $1", [U.par])).toEqual({ telegram_chat_id: null });
  });
});

describe("enrolment in Supabase mode", () => {
  const director = () => loadCtx({ id: U.dir, email: "dir@x", name: "D", role: "school_admin", demo: false, teacherId: null, studentIds: [] });

  it("creates real logins with roles student / parent and the temporary-password flag", async () => {
    const c = await director();
    const r = await enrollStudent(c, {
      student: { last_name: "Каримов", first_name: "Sardor", class_id: CLS_A },
      guardian: { full_name: "Karimova Mamura", relation: "mother", phone: "+998 90 777 66 55" },
    });
    expect(r.student_account).toMatchObject({ email: `karimov.sardor@${DOMAIN}`, demo: false, must_change_password: true });
    expect(r.student_account.temp_password).toBeTruthy();
    expect(gw.users.get(r.student_account.user_id)?.password).toBe(r.student_account.temp_password);
    expect(await one("select role::text, must_change_password from public.profiles where id = $1", [r.student_account.user_id])).toEqual({ role: "student", must_change_password: true });
    expect(await one("select role::text from public.profiles where id = $1", [r.guardian_account!.user_id])).toEqual({ role: "parent" });
    expect(await one("select user_id from public.students where id = $1", [r.student.id])).toEqual({ user_id: r.student_account.user_id });
  });

  it("a taken login moves on to the next number; a sibling reuses the parent", async () => {
    const c = await director();
    const twin = await enrollStudent(c, {
      student: { last_name: "Karimov", first_name: "Sardor" },
      guardian: { full_name: "Karimova Mamura", relation: "mother", phone: "90 777 66 55" },
    });
    expect(twin.student_account.email).toBe(`karimov.sardor2@${DOMAIN}`);
    expect(twin.guardian_reused).toBe(true);
    expect(twin.guardian_account).toBeNull();
  });

  it("a taken parent e-mail rolls back the student and its login", async () => {
    const c = await director();
    const students = async () => (await one("select count(*)::int n from public.students")).n;
    const users = gw.users.size;
    const before = await students();
    const err = await enrollStudent(c, {
      student: { last_name: "Rollback", first_name: "Test" },
      guardian: { full_name: "Ota Test", relation: "father", email: `admin@${DOMAIN}` },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SchoolError);
    expect(err.code).toBe("conflict");
    expect(await students()).toBe(before);
    expect(gw.users.size).toBe(users);
  });
});
