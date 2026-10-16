/* eslint-disable @typescript-eslint/no-explicit-any */
// SUPABASE-MODE SIMULATION: runs the real SchoolDb supabase implementation (lib/school/db-supabase.ts), the session loader, the service
// layer and the API route handlers against the REAL supabase/schema.sql inside PGlite, through a supabase-js compatible shim
// (tests/helpers/pglite-supabase.ts) that switches Postgres roles + JWT claims per request exactly like PostgREST does.
// No Supabase project is involved. What it cannot prove: network/PostgREST quirks, GoTrue (real e-mails, rate limits), Storage.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addUser, type PgGateway } from "./helpers/pglite-supabase";
import {
  buildFixture, CLS_A, CLS_B, GRADE_DATE, GU1, id, PASSWORD, ST, SUBJ_MATH, SUBJ_PHYS, TEA, TEB, TERM1, U, YEAR, type Fixture,
} from "./helpers/school-fixture";

const h = vi.hoisted(() => ({ gw: null as any, user: null as any }));
vi.mock("@/lib/admin/supabase", () => ({
  isConfigured: () => true,
  demoAllowed: () => false,
  getServiceClient: () => h.gw.service(),
  getUserClient: async () => h.user,
}));
// lib/school/account.ts verifies the current password with a session-less anon client
vi.mock("@supabase/supabase-js", () => ({ createClient: () => h.gw.anon() }));

import { createSupabaseDb } from "@/lib/school/db-supabase";
import { getSchoolSession } from "@/lib/school/auth";
import { loadCtx } from "@/lib/school/svc-core";
import { markAttendance } from "@/lib/school/svc-attendance";
import { tashkentToday } from "@/lib/school/grading";

let fx: Fixture;
let gw: PgGateway;
const today = tashkentToday();
const q = (sql: string, p?: unknown[]) => gw.raw((x) => x(sql, p));
const one = async (sql: string, p?: unknown[]) => (await q(sql, p)).rows[0];

/** the "browser": signed in as uid (cookie session) */
const signInAs = (uid: string | null) => {
  h.user = uid ? gw.as(uid) : gw.anon();
};
const actor = (role = "teacher", uid = U.tA) => ({ id: uid, email: `${uid}@x`, role: role as any, teacherId: null, demo: false });

async function call(handler: (req: Request, ctx?: any) => Promise<Response>, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { "content-type": "application/json", host: "localhost", ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await handler(new Request(`http://localhost${path}`, init), { params: Promise.resolve({}) });
  return { status: res.status, body: (await res.json()) as any };
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://school.example.uz";
  fx = await buildFixture();
  gw = fx.gw;
  h.gw = gw;
  signInAs(null);
}, 120_000);
afterAll(async () => {
  await fx?.db.close();
});

describe("PostgREST semantics of the shim (so the rest can be trusted)", () => {
  it("returns JSON-shaped rows: dates are strings, numerics are numbers, errors carry SQLSTATE", async () => {
    const r = await gw.service().from("terms").select("*").eq("number", 1).limit(1);
    expect(r.error).toBeNull();
    expect(typeof r.data![0].start_date).toBe("string");
    expect(r.data![0].is_locked).toBe(false);
    const bad = await gw.service().from("students").insert({ first_name: "x" });
    expect(bad.error?.code).toBe("23502"); // not-null violation
    const dup = await gw.service().from("students").insert({ first_name: "x", last_name: "y", student_code: "T1" });
    expect(dup.error?.code).toBe("23505");
    const none = await gw.service().from("students").select("*").eq("id", id(1)).single();
    expect(none.error?.code).toBe("PGRST116");
  });
  it("rpc() uses named arguments and rejects unknown / missing ones like PostgREST", async () => {
    const ok = await gw.service().rpc("school_today");
    expect(typeof ok.data).toBe("string");
    const unknown = await gw.as(U.tA).rpc("mark_attendance_bulk", { p_class: CLS_A, p_dat: today, p_lesson_no: null, p_records: [] });
    expect(unknown.error?.code).toBe("PGRST202");
  });
});

describe("anonymous visitors (anon key, no JWT)", () => {
  it("cannot read or write any school table and cannot call school RPCs", async () => {
    const tables = ["students", "guardians", "attendance", "grade_entries", "term_grades", "notifications", "school_notification_prefs", "teachers", "audit_log", "schedule_slots"];
    for (const t of tables) {
      const r = await gw.anon().from(t).select("*");
      expect(r.error?.code, t).toBe("42501");
    }
    expect((await gw.anon().from("students").insert({ first_name: "a", last_name: "b", student_code: "ZZ" })).error?.code).toBe("42501");
    for (const fn of ["mark_attendance_bulk", "save_grades_bulk", "save_term_grades_bulk", "lock_term", "attendance_summary", "student_performance", "class_journal"]) {
      const r = await gw.anon().rpc(fn, fn === "lock_term" ? { p_term: TERM1, p_locked: true } : fn === "attendance_summary" ? { p_class: CLS_A, p_from: today, p_to: today } : fn === "student_performance" ? { p_student: ST.s1, p_year: YEAR } : fn === "class_journal" ? { p_class: CLS_A, p_subject: SUBJ_MATH, p_term: TERM1 } : fn === "save_term_grades_bulk" ? { p_class: CLS_A, p_subject: SUBJ_MATH, p_term: TERM1, p_rows: [] } : fn === "save_grades_bulk" ? { p_class: CLS_A, p_subject: SUBJ_MATH, p_term: TERM1, p_entries: [] } : { p_class: CLS_A, p_date: today, p_lesson_no: null, p_records: [] });
      expect(r.error?.code, fn).toBe("42501");
    }
  });
  it("can still read the public site content (programs) but not write it", async () => {
    expect((await gw.anon().from("programs").select("id").limit(1)).error).toBeNull();
    expect((await gw.anon().from("programs").update({ sort_order: 9 }).eq("sort_order", 1)).data).toBeNull();
  });
});

describe("row visibility per role (RLS through PostgREST roles)", () => {
  const ids = async (uid: string, table = "students") => ((await gw.as(uid).from(table).select("id")).data ?? []).map((r: any) => r.id).sort();
  it("director all, teacher own classes, parent own child, student self", async () => {
    expect((await ids(U.dir)).length).toBe(7);
    expect((await ids(U.tA)).length).toBe(6);
    expect(await ids(U.tB)).toEqual([ST.s7]);
    expect(await ids(U.par)).toEqual([ST.s1]);
    expect(await ids(U.par2)).toEqual([ST.s7]);
    expect(await ids(U.stu)).toEqual([ST.s2]);
  });
  it("a parent cannot read another child, write students, or see teachers", async () => {
    expect((await gw.as(U.par).from("students").select("id").eq("id", ST.s2)).data).toEqual([]);
    expect((await gw.as(U.par).from("students").update({ notes: "x" }).eq("id", ST.s1).select()).data).toEqual([]);
    expect((await gw.as(U.par).from("teachers").select("id")).data).toEqual([]);
    expect((await gw.as(U.stu).from("guardians").select("id")).data).toEqual([]);
  });
});

describe("SchoolDb (db-supabase.ts) RPCs under role switching", () => {
  const db = createSupabaseDb();
  it("mark_attendance_bulk: teacher of the class only; stored as proper rows", async () => {
    signInAs(U.tA);
    const r = await db.markAttendanceBulk(actor(), { class_id: CLS_A, date: today, lesson_no: null, records: [{ student_id: ST.s3, status: "absent", note: "ill" }, { student_id: ST.s4, status: "late", minutes_late: 12 }] });
    expect(r.saved).toBe(2);
    const rows = await db.select("attendance", { eq: { class_id: CLS_A, date: today }, order: [["student_id", "asc"]] });
    expect(rows.map((x) => [x.student_id, x.status, x.minutes_late])).toEqual([[ST.s3, "absent", 0], [ST.s4, "late", 12]]);
    expect(typeof rows[0].date).toBe("string");
    await expect(db.markAttendanceBulk(actor(), { class_id: CLS_B, date: today, lesson_no: null, records: [{ student_id: ST.s7, status: "present" }] })).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(db.markAttendanceBulk(actor(), { class_id: CLS_A, date: today, lesson_no: null, records: [{ student_id: ST.s7, status: "present" }] })).rejects.toMatchObject({ code: "student_not_in_class" });
    await expect(db.markAttendanceBulk(actor(), { class_id: CLS_A, date: today, lesson_no: null, records: [{ student_id: ST.s3, status: "gone" }] })).rejects.toMatchObject({ code: "invalid_status" });
    await expect(db.markAttendanceBulk(actor(), { class_id: CLS_A, date: "2999-01-01", lesson_no: null, records: [{ student_id: ST.s3, status: "present" }] })).rejects.toMatchObject({ code: "invalid_date" });
    await expect(db.markAttendanceBulk(actor(), { class_id: CLS_A, date: "2026-01-05", lesson_no: null, records: [{ student_id: ST.s3, status: "present" }] })).rejects.toMatchObject({ code: "edit_window_closed", status: 409 });
    signInAs(U.par);
    await expect(db.markAttendanceBulk(actor("parent", U.par), { class_id: CLS_A, date: today, lesson_no: null, records: [{ student_id: ST.s1, status: "present" }] })).rejects.toMatchObject({ code: "forbidden" });
    signInAs(U.dir);
    await db.markAttendanceBulk(actor("school_admin", U.dir), { class_id: CLS_A, date: "2026-01-05", lesson_no: null, records: [{ student_id: ST.s3, status: "present" }] }); // director edits history
    const audit = await one("select count(*)::int n from public.audit_log where action='attendance_bulk'");
    expect(audit.n).toBeGreaterThanOrEqual(2);
  });

  it("save_grades_bulk: ownership, ranges, numeric(3,1) scores come back as numbers", async () => {
    signInAs(U.tA);
    const entries = [ST.s1, ST.s2, ST.s3, ST.s4, ST.s5, ST.s6].map((student_id, i) => ({ student_id, date: GRADE_DATE, kind: "daily", score: 3 + (i % 3) * 0.5 + 0.5, weight: 1 }));
    const r = await db.saveGradesBulk(actor(), { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, entries });
    expect(r).toEqual({ saved: 6, deleted: 0 });
    const rows = await db.select("grade_entries", { eq: { class_id: CLS_A, subject_id: SUBJ_MATH } });
    expect(rows).toHaveLength(6);
    expect(rows.every((x) => typeof x.score === "number" && typeof x.weight === "number")).toBe(true);
    await expect(db.saveGradesBulk(actor(), { class_id: CLS_A, subject_id: SUBJ_PHYS, term_id: TERM1, entries: [entries[0]] })).rejects.toMatchObject({ code: "forbidden" });
    await expect(db.saveGradesBulk(actor(), { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, entries: [{ ...entries[0], score: 6 }] })).rejects.toMatchObject({ code: "invalid_score" });
    await expect(db.saveGradesBulk(actor(), { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, entries: [{ ...entries[0], date: "2026-07-01" }] })).rejects.toMatchObject({ code: "date_out_of_term" });
    signInAs(U.tB);
    await expect(db.saveGradesBulk(actor("teacher", U.tB), { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, entries: [entries[0]] })).rejects.toMatchObject({ code: "forbidden" });
    expect((await db.select("grade_entries", { eq: { class_id: CLS_A } })).length).toBe(6); // failed calls stored nothing
  });

  it("save_term_grades_bulk stores confirmed value + override_reason; lock_term blocks teachers but not directors", async () => {
    signInAs(U.tA);
    const rows = [{ student_id: ST.s1, value: 5, suggested: 4.4, override_reason: "olympiad winner" }, { student_id: ST.s2, value: 4, suggested: 4.0 }];
    expect(await db.saveTermGradesBulk(actor(), { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, rows })).toEqual({ saved: 2 });
    const tg = await db.select("term_grades", { eq: { class_id: CLS_A, term_id: TERM1 }, order: [["student_id", "asc"]] });
    expect(tg.map((x) => [x.student_id, x.value, x.is_confirmed, x.override_reason])).toEqual([[ST.s1, 5, true, "olympiad winner"], [ST.s2, 4, true, null]]);
    expect(typeof tg[0].suggested).toBe("number");

    signInAs(U.dir);
    expect(await db.lockTerm(actor("school_admin", U.dir), TERM1, true)).toEqual({ term_id: TERM1, is_locked: true });
    signInAs(U.tA);
    await expect(db.saveGradesBulk(actor(), { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, entries: [{ student_id: ST.s1, date: GRADE_DATE, score: 4 }] })).rejects.toMatchObject({ code: "term_locked", status: 409 });
    await expect(db.saveTermGradesBulk(actor(), { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, rows: [{ student_id: ST.s1, value: 3 }] })).rejects.toMatchObject({ code: "term_locked" });
    await expect(db.lockTerm(actor(), TERM1, false)).rejects.toMatchObject({ code: "forbidden" });
    signInAs(U.dir);
    expect((await db.saveGradesBulk(actor("school_admin", U.dir), { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, entries: [{ student_id: ST.s1, date: GRADE_DATE, score: 5 }] })).saved).toBe(1);
    await db.lockTerm(actor("school_admin", U.dir), TERM1, false);
    await db.remove("grade_entries", { eq: { student_id: ST.s1, kind: "daily", score: 5 } }).catch(() => 0);
  });

  it("generic CRUD helpers behave like the demo store (insert/update/upsert/remove/in/gte/lte/order/limit)", async () => {
    signInAs(U.dir);
    const [st] = await db.insert("students", [{ first_name: "Crud", last_name: "Test", student_code: "CRUD-1", class_id: CLS_B }]);
    expect(st.status).toBe("active"); // column default applied
    expect(await db.update("students", { eq: { id: st.id } }, { notes: "n" })).toHaveLength(1);
    await expect(db.insert("students", [{ first_name: "Dup", last_name: "Test", student_code: "CRUD-1" }])).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(db.insert("students", [{ first_name: "Bad", last_name: "Class", student_code: "CRUD-2", class_id: id(1) }])).rejects.toMatchObject({ code: "reference_conflict" }); // FK violation
    await db.upsert("student_guardians", [{ student_id: st.id, guardian_id: GU1, is_primary: false }], ["student_id", "guardian_id"]);
    await db.upsert("student_guardians", [{ student_id: st.id, guardian_id: GU1, is_primary: true }], ["student_id", "guardian_id"]);
    expect(await db.select("student_guardians", { eq: { student_id: st.id } })).toEqual([{ student_id: st.id, guardian_id: GU1, is_primary: true }]);
    const some = await db.select("students", { in: { class_id: [CLS_A, CLS_B] }, order: [["last_name", "desc"], ["first_name", "asc"]], limit: 3, offset: 1 });
    expect(some).toHaveLength(3);
    const att = await db.select("attendance", { gte: { date: "2026-01-01" }, lte: { date: "2026-01-31" } });
    expect(att.every((a) => a.date >= "2026-01-01" && a.date <= "2026-01-31")).toBe(true);
    expect(await db.select("students", { eq: { class_id: null as any } })).toEqual([]); // .is(null) path
    expect(await db.remove("students", { eq: { id: st.id } })).toBe(1);
    expect(await db.select("student_guardians", { eq: { student_id: st.id } })).toEqual([]); // cascade
  });
});

describe("other RPCs: attendance_summary / student_performance / class_journal", () => {
  const rpc = (uid: string, fn: string, args: Record<string, unknown>) => gw.as(uid).rpc(fn, args);
  it("teacher of the class and the child's parent may read, others are forbidden", async () => {
    const sum = await rpc(U.tA, "attendance_summary", { p_class: CLS_A, p_from: "2026-01-01", p_to: today });
    expect(sum.error).toBeNull();
    expect((sum.data as any[]).length).toBe(6);
    expect((await rpc(U.tB, "attendance_summary", { p_class: CLS_A, p_from: "2026-01-01", p_to: today })).error?.message).toBe("forbidden");
    expect((await rpc(U.par, "attendance_summary", { p_class: CLS_A, p_from: "2026-01-01", p_to: today })).data).toHaveLength(1); // only own child is visible
    const perf = await rpc(U.par, "student_performance", { p_student: ST.s1, p_year: YEAR });
    expect(perf.error).toBeNull();
    expect((perf.data as any).terms).toHaveLength(4);
    expect(Number((perf.data as any).overall_avg)).toBeGreaterThan(0);
    expect((await rpc(U.par, "student_performance", { p_student: ST.s2, p_year: YEAR })).error?.message).toBe("forbidden");
    expect((await rpc(U.par2, "student_performance", { p_student: ST.s1, p_year: YEAR })).error?.message).toBe("forbidden");
    const j = await rpc(U.tA, "class_journal", { p_class: CLS_A, p_subject: SUBJ_MATH, p_term: TERM1 });
    expect((j.data as any).students).toHaveLength(6);
    expect((j.data as any).entries.length).toBeGreaterThanOrEqual(6);
    expect((await rpc(U.tB, "class_journal", { p_class: CLS_A, p_subject: SUBJ_MATH, p_term: TERM1 })).error?.message).toBe("forbidden");
    expect((await rpc(U.par, "class_journal", { p_class: CLS_A, p_subject: SUBJ_MATH, p_term: TERM1 })).error?.message).toBe("forbidden");
  });
});

describe("session loader + service layer in Supabase mode", () => {
  it("getSchoolSession resolves role, teacherId and studentIds from profiles / teachers / guardians", async () => {
    signInAs(U.tA);
    expect(await getSchoolSession()).toMatchObject({ role: "teacher", teacherId: TEA, studentIds: [], demo: false, mustChangePassword: false });
    signInAs(U.par);
    expect((await getSchoolSession())?.studentIds).toEqual([ST.s1]);
    signInAs(U.stu);
    expect((await getSchoolSession())?.studentIds).toEqual([ST.s2]);
    signInAs(U.dir);
    expect((await getSchoolSession())?.role).toBe("school_admin");
    signInAs(null);
    expect(await getSchoolSession()).toBeNull();
    await q("update public.profiles set is_active=false where id=$1", [U.tB]);
    signInAs(U.tB);
    expect(await getSchoolSession()).toBeNull(); // deactivated accounts lose access
    await q("update public.profiles set is_active=true where id=$1", [U.tB]);
  });

  it("markAttendance creates in-app absence notifications for guardians, and honours school_notification_prefs.absence", async () => {
    signInAs(U.tA);
    const c = await loadCtx((await getSchoolSession())!);
    const res = await markAttendance(c, { class_id: CLS_A, date: today, lesson_no: null, records: [{ student_id: ST.s1, status: "absent" }] });
    expect(res.newly_absent).toHaveLength(1);
    const n1 = await one("select count(*)::int n from public.notifications where user_id=$1 and type='absence'", [U.par]);
    expect(n1.n).toBe(1);
    // the guardian switches absence notices off through the API (own row, RLS)
    signInAs(U.par);
    const put = await call((await import("@/app/api/school/me/prefs/route")).PUT, "PUT", "/api/school/me/prefs", { absence: false });
    expect(put.status).toBe(200);
    expect(put.body.prefs).toMatchObject({ absence: false, telegram: true });
    signInAs(U.tA);
    const c2 = await loadCtx((await getSchoolSession())!);
    await markAttendance(c2, { class_id: CLS_A, date: today, lesson_no: 1, records: [{ student_id: ST.s1, status: "absent" }] });
    expect((await one("select count(*)::int n from public.notifications where user_id=$1 and type='absence'", [U.par])).n).toBe(1); // no second notice
  });
});

describe("API: notification preferences (GET/PUT /me/prefs)", () => {
  it("defaults when no row, persists, and is private to the owner", async () => {
    const route = await import("@/app/api/school/me/prefs/route");
    signInAs(U.par2);
    const g = await call(route.GET, "GET", "/api/school/me/prefs");
    expect(g.body.prefs).toMatchObject({ telegram: true, email: false, absence: true, low_grade: true, announcements: true, updated_at: null, unavailable: ["email"] });
    expect((await call(route.PUT, "PUT", "/api/school/me/prefs", { email: true })).body).toMatchObject({ ok: false, error: "channel_unavailable" });
    const p = await call(route.PUT, "PUT", "/api/school/me/prefs", { announcements: false, telegram: false });
    expect(p.body.prefs).toMatchObject({ announcements: false, telegram: false, absence: true });
    expect((await call(route.PUT, "PUT", "/api/school/me/prefs", {})).status).toBe(422);
    expect((await call(route.PUT, "PUT", "/api/school/me/prefs", { absence: "yes" })).status).toBe(422);
    expect((await gw.as(U.par).from("school_notification_prefs").select("*").eq("user_id", U.par2)).data).toEqual([]); // RLS: not readable by others
    expect((await gw.anon().from("school_notification_prefs").select("*")).error?.code).toBe("42501");
  });
});

describe("API: excuse flow (parent explains -> homeroom teacher accepts -> parent sees resolution)", () => {
  it("accept turns the absence into excused, marks the notification read and notifies the parent", async () => {
    const excuse = await import("@/app/api/school/family/excuse/route");
    const accept = await import("@/app/api/school/teacher/excuse/accept/route");
    const notifs = await import("@/app/api/school/notifications/route");
    signInAs(U.par);
    const sent = await call(excuse.POST, "POST", "/api/school/family/excuse", { student_id: ST.s1, date: today, reason: "sick", note: "fever" });
    expect(sent.body).toMatchObject({ ok: true, sent: true, delivered: true });

    signInAs(U.tA);
    const list = await call(notifs.GET, "GET", "/api/school/notifications?unread=1");
    const n = list.body.items.find((x: any) => x.type === "absence_excuse");
    expect(n.payload).toMatchObject({ student_id: ST.s1, parent_user_id: U.par });

    // somebody else's notification / not the homeroom teacher
    signInAs(U.tB);
    expect((await call(accept.POST, "POST", "/api/school/teacher/excuse/accept", { notificationId: n.id })).status).toBe(403);
    // wrong type
    signInAs(U.tA);
    const wrong = list.body.items.find((x: any) => x.type !== "absence_excuse");
    if (wrong) expect((await call(accept.POST, "POST", "/api/school/teacher/excuse/accept", { notificationId: wrong.id })).status).toBe(422);

    const ok = await call(accept.POST, "POST", "/api/school/teacher/excuse/accept", { notificationId: n.id });
    // s1 has two absent rows today (daily + lesson 1, from the previous test): both are resolved
    expect(ok.body).toMatchObject({ ok: true, excused: 2, notified: 1, student_id: ST.s1, date: today });
    const att = await gw.service().from("attendance").select("status,note,marked_by").eq("student_id", ST.s1).eq("date", today).is("lesson_no", null).single();
    expect(att.data).toMatchObject({ status: "excused", marked_by: U.tA });
    expect(att.data.note).toContain("excuse: sick");
    expect((await one("select read_at from public.notifications where id=$1", [n.id])).read_at).not.toBeNull();
    expect((await one("select count(*)::int n from public.audit_log where action='excuse_accept'")).n).toBe(1);

    // second accept: nothing left to resolve
    expect((await call(accept.POST, "POST", "/api/school/teacher/excuse/accept", { notificationId: n.id })).body).toMatchObject({ ok: false, error: "already_resolved" });

    signInAs(U.par);
    const mine = await call(notifs.GET, "GET", "/api/school/notifications");
    expect(mine.body.items.some((x: any) => x.type === "excuse_resolved" && x.payload.status === "accepted")).toBe(true);
    const view = await call(excuse.GET, "GET", `/api/school/family/excuse?student_id=${ST.s1}`);
    expect(view.body.excuses[0]).toMatchObject({ date: today, reason: "sick", resolved: true });
    // the other parent cannot even ask
    signInAs(U.par2);
    expect((await call(excuse.GET, "GET", `/api/school/family/excuse?student_id=${ST.s1}`)).status).toBe(403);
  });

  it("locked term -> term_locked for teachers; old absences -> edit_window_closed; directors may still accept", async () => {
    const excuse = await import("@/app/api/school/family/excuse/route");
    const accept = await import("@/app/api/school/teacher/excuse/accept/route");
    const notifs = await import("@/app/api/school/notifications/route");
    // director records an old absence (date inside term 1)
    signInAs(U.dir);
    const dc = await loadCtx((await getSchoolSession())!);
    await markAttendance(dc, { class_id: CLS_A, date: GRADE_DATE, lesson_no: null, records: [{ student_id: ST.s1, status: "absent" }] });
    signInAs(U.par);
    await call(excuse.POST, "POST", "/api/school/family/excuse", { student_id: ST.s1, date: GRADE_DATE, reason: "family", note: "" });
    signInAs(U.tA);
    const n = (await call(notifs.GET, "GET", "/api/school/notifications?unread=1")).body.items.find((x: any) => x.type === "absence_excuse" && x.payload.date === GRADE_DATE);
    await q("update public.terms set is_locked=true where id=$1", [TERM1]);
    expect((await call(accept.POST, "POST", "/api/school/teacher/excuse/accept", { notificationId: n.id })).body).toMatchObject({ error: "term_locked" });
    await q("update public.terms set is_locked=false where id=$1", [TERM1]);
    expect((await call(accept.POST, "POST", "/api/school/teacher/excuse/accept", { notificationId: n.id })).body).toMatchObject({ error: "edit_window_closed" });
    signInAs(U.dir);
    const viaDirector = await call(accept.POST, "POST", "/api/school/teacher/excuse/accept", { notificationId: n.id });
    expect(viaDirector.body).toMatchObject({ ok: true, excused: 1 });
  });
});

describe("API: parent-safe class average", () => {
  it("is an aggregate only, and only for subjects with >= 5 graded pupils", async () => {
    const route = await import("@/app/api/school/family/class-average/route");
    // physics: only 3 pupils graded (by the director) -> must stay hidden
    signInAs(U.dir);
    const db = createSupabaseDb();
    await db.saveGradesBulk(actor("school_admin", U.dir), { class_id: CLS_A, subject_id: SUBJ_PHYS, term_id: TERM1, entries: [ST.s1, ST.s2, ST.s3].map((student_id) => ({ student_id, date: GRADE_DATE, score: 5 })) });
    signInAs(U.par);
    const r = await call(route.GET, "GET", `/api/school/family/class-average?student=${ST.s1}&term=${TERM1}`);
    expect(r.status).toBe(200);
    const math = r.body.subjects.find((s: any) => s.subject_id === SUBJ_MATH);
    const phys = r.body.subjects.find((s: any) => s.subject_id === SUBJ_PHYS);
    expect(typeof math.average).toBe("number");
    expect(math.average).toBeGreaterThan(3);
    expect(phys.average).toBeNull();
    expect(r.body.min_students).toBe(5);
    const raw = JSON.stringify(r.body);
    for (const sid of [ST.s2, ST.s3, ST.s4, ST.s5, ST.s6, ST.s7]) expect(raw.includes(sid)).toBe(false); // no individual data
    expect((await call(route.GET, "GET", `/api/school/family/class-average?student=${ST.s2}`)).status).toBe(403); // not my child
    signInAs(U.stu);
    expect((await call(route.GET, "GET", `/api/school/family/class-average?student=${ST.s2}&term=${TERM1}`)).status).toBe(200);
    signInAs(U.tA);
    expect((await call(route.GET, "GET", `/api/school/family/class-average?student=${ST.s1}`)).status).toBe(403); // role-checked
    signInAs(U.par);
    expect((await call(route.GET, "GET", "/api/school/family/class-average")).status).toBe(422);
  });
});

describe("API: term grade override reason", () => {
  it("is stored in term_grades.override_reason (reasons map and rows[] both work) and returned by GET /grades/term", async () => {
    const teacher = await import("@/app/api/school/teacher/term-grades/route");
    const term = await import("@/app/api/school/grades/term/route");
    signInAs(U.tA);
    const r = await call(teacher.POST, "POST", "/api/school/teacher/term-grades", {
      class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1,
      rows: [{ student_id: ST.s3, value: 5, override_reason: "project work" }, { student_id: ST.s4, value: 4 }, { student_id: ST.s5, value: 3 }],
      reasons: { [ST.s4]: "legacy map reason" },
    });
    expect(r.body).toMatchObject({ ok: true, saved: 3 });
    const t = await call(term.GET, "GET", `/api/school/grades/term?class_id=${CLS_A}&subject_id=${SUBJ_MATH}&term_id=${TERM1}`);
    const by = (sid: string) => t.body.table.rows.find((x: any) => x.student_id === sid);
    expect(by(ST.s3)).toMatchObject({ value: 5, is_confirmed: true, override_reason: "project work" });
    expect(by(ST.s4).override_reason).toBe("legacy map reason");
    expect(by(ST.s5).override_reason).toBeNull();
    expect((await one("select count(*)::int n from public.audit_log where action='term_grade_override'")).n).toBe(1);
  });
});

describe("API: schedule room / teacher clash", () => {
  it("room_busy (409) from the service check AND from the unique index; teacher clash stays conflict", async () => {
    const sched = await import("@/app/api/school/schedule/route");
    signInAs(U.dir);
    const slot = (over: Record<string, unknown>) => ({ class_id: CLS_A, subject_id: SUBJ_MATH, teacher_id: TEA, weekday: 2, lesson_no: 1, start_time: "08:00", end_time: "08:45", room: "Lab 1", ...over });
    expect((await call(sched.POST, "POST", "/api/school/schedule", slot({}))).status).toBe(200);
    const clash = await call(sched.POST, "POST", "/api/school/schedule", slot({ class_id: CLS_B, teacher_id: TEB, room: " lab 1 " }));
    expect(clash).toMatchObject({ status: 409, body: { ok: false, error: "room_busy" } });
    const teacher = await call(sched.POST, "POST", "/api/school/schedule", slot({ class_id: CLS_B, room: "Lab 2" }));
    expect(teacher).toMatchObject({ status: 409, body: { error: "conflict" } });
    expect((await call(sched.POST, "POST", "/api/school/schedule", slot({ class_id: CLS_B, teacher_id: TEB, room: "Lab 2" }))).status).toBe(200);
    // bypass the service pre-check: the database itself must refuse (and db-supabase maps the index to the stable code)
    const db = createSupabaseDb();
    await expect(db.insert("schedule_slots", [{ class_id: CLS_A, subject_id: SUBJ_MATH, teacher_id: null, weekday: 2, lesson_no: 2, start_time: "09:00", end_time: "09:45", room: "Lab 2" }]))
      .resolves.toHaveLength(1); // a different lesson number is fine
    await expect(db.insert("schedule_slots", [{ class_id: CLS_B, subject_id: SUBJ_MATH, teacher_id: null, weekday: 2, lesson_no: 2, start_time: "09:00", end_time: "09:45", room: "LAB 2" }]))
      .rejects.toMatchObject({ code: "room_busy", status: 409 });
  });
});

describe("API: accounts - invite guardian, temporary password, forced change", () => {
  it("director invites a guardian: login is created (role parent), children linked, must_change_password set", async () => {
    const invite = await import("@/app/api/school/guardians/invite/route");
    signInAs(U.dir);
    const r = await call(invite.POST, "POST", "/api/school/guardians/invite", { full_name: "New Parent", relation: "mother", email: "new.parent@school.test", student_ids: [ST.s3, ST.s4] });
    expect(r.status).toBe(200);
    const inv = r.body.invite;
    expect(inv.linked).toBe(2);
    expect(inv.account).toMatchObject({ email: "new.parent@school.test", demo: false, must_change_password: true });
    expect(inv.account.temp_password).toMatch(/^[A-Za-z0-9]{12}$/);
    const prof = await one("select role::text r, must_change_password m, is_active from public.profiles where id=$1", [inv.account.user_id]);
    expect(prof).toMatchObject({ r: "parent", m: true, is_active: true });
    expect((await one("select user_id from public.guardians where id=$1", [inv.guardian.id])).user_id).toBe(inv.account.user_id);
    expect((await q("select student_id from public.student_guardians where guardian_id=$1 order by student_id", [inv.guardian.id])).rows.map((x: any) => x.student_id)).toEqual([ST.s3, ST.s4]);
    // duplicate e-mail -> conflict and no half-created guardian is left behind
    const dup = await call(invite.POST, "POST", "/api/school/guardians/invite", { full_name: "Other Parent", email: "new.parent@school.test", student_ids: [ST.s5] });
    expect(dup.body).toMatchObject({ ok: false, error: "conflict" });
    expect((await one("select count(*)::int n from public.guardians where full_name='Other Parent'")).n).toBe(0);
    // existing guardian: only linking
    const again = await call(invite.POST, "POST", "/api/school/guardians/invite", { guardian_id: inv.guardian.id, email: "new.parent@school.test", student_ids: [ST.s5] });
    expect(again.body.invite).toMatchObject({ account: null, linked: 1 });
    // other roles cannot
    signInAs(U.tA);
    expect((await call(invite.POST, "POST", "/api/school/guardians/invite", { full_name: "X Y", email: "x@y.uz", student_ids: [ST.s5] })).status).toBe(403);
    // stash for the next test
    (globalThis as any).__tempPw = inv.account.temp_password;
  });

  it("first login: only /me and change-password work until the password is changed", async () => {
    const login = await import("@/app/api/school/auth/login/route");
    const me = await import("@/app/api/school/me/route");
    const students = await import("@/app/api/school/students/route");
    const change = await import("@/app/api/school/auth/change-password/route");
    const temp = (globalThis as any).__tempPw as string;
    signInAs(null);
    const li = await call(login.POST, "POST", "/api/school/auth/login", { email: "new.parent@school.test", password: temp });
    expect(li.body).toMatchObject({ ok: true, role: "parent", must_change_password: true });
    expect((await call(me.GET, "GET", "/api/school/me")).body).toMatchObject({ ok: true, must_change_password: true });
    const blocked = await call(students.GET, "GET", "/api/school/students");
    expect(blocked).toMatchObject({ status: 403, body: { error: "password_change_required" } });
    const url = "/api/school/auth/change-password";
    expect((await call(change.POST, "POST", url, { current_password: "not-the-password", new_password: "Fresh-pass-77" })).body).toMatchObject({ error: "wrong_password" });
    // (5 attempts per 10 minutes are allowed: 1 wrong + 3 weak + the successful one)
    for (const weak of ["short1", "Password123", temp]) {
      expect((await call(change.POST, "POST", url, { current_password: temp, new_password: weak })).body, weak).toMatchObject({ error: "weak_password" });
    }
    expect((await call(change.POST, "POST", url, { current_password: temp, new_password: "Fresh-pass-77" })).body).toMatchObject({ ok: true, changed: true });
    expect(await call(change.POST, "POST", url, { current_password: "Fresh-pass-77", new_password: "Fresh-pass-78" })).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect((await one("select must_change_password m from public.profiles where id=$1", [(await gw.service().from("guardians").select("user_id").eq("full_name", "New Parent").single()).data.user_id])).m).toBe(false);
    expect((await call(students.GET, "GET", "/api/school/students")).status).toBe(200);
    // old password is dead, the new one works
    signInAs(null);
    expect((await call(login.POST, "POST", "/api/school/auth/login", { email: "new.parent@school.test", password: temp })).status).toBe(401);
    expect((await call(login.POST, "POST", "/api/school/auth/login", { email: "new.parent@school.test", password: "Fresh-pass-77" })).body).toMatchObject({ ok: true, must_change_password: false });
  });

  it("a user cannot clear must_change_password through PostgREST (privilege trigger)", async () => {
    await q("update public.profiles set must_change_password=true where id=$1", [U.par2]);
    const r = await gw.as(U.par2).from("profiles").update({ must_change_password: false }).eq("id", U.par2).select();
    expect(r.error?.message).toBe("forbidden");
    await q("update public.profiles set must_change_password=false where id=$1", [U.par2]);
  });

  it("director password reset sets the temporary-password flag again", async () => {
    const reset = await import("@/app/api/school/accounts/reset-password/route");
    signInAs(U.dir);
    const r = await call(reset.POST, "POST", "/api/school/accounts/reset-password", { user_id: U.par2 });
    expect(r.body.reset).toMatchObject({ demo: false, must_change_password: true });
    expect(r.body.reset.temp_password).toHaveLength(12);
    expect((await one("select must_change_password m from public.profiles where id=$1", [U.par2])).m).toBe(true);
    await q("update public.profiles set must_change_password=false where id=$1", [U.par2]);
  });
});

describe("API: forgot password (request-reset / complete-reset)", () => {
  it("never reveals whether the e-mail exists; redirect URL comes from NEXT_PUBLIC_SITE_URL", async () => {
    const req = await import("@/app/api/school/auth/request-reset/route");
    signInAs(null);
    const known = await call(req.POST, "POST", "/api/school/auth/request-reset", { email: "par@school.test" });
    const unknown = await call(req.POST, "POST", "/api/school/auth/request-reset", { email: "nobody@school.test" });
    expect(known).toEqual(unknown);
    expect(known.body).toEqual({ ok: true, sent: true, demo: false });
    expect(gw.sentResets[0]).toEqual({ email: "par@school.test", redirectTo: "https://school.example.uz/school/reset-password" });
    expect((await call(req.POST, "POST", "/api/school/auth/request-reset", { email: "not-an-email" })).status).toBe(422);
    expect((await call(req.POST, "POST", "/api/school/auth/request-reset", { email: "limit@school.test" })).status).toBe(200);
  });
  it("per-address rate limit: the 4th request in 10 minutes is refused (same answer for any address)", async () => {
    const req = await import("@/app/api/school/auth/request-reset/route");
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await call(req.POST, "POST", "/api/school/auth/request-reset", { email: "spam@school.test" })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });
  it("complete-reset: token_hash or PKCE code sets the new password; weak / invalid tokens are refused", async () => {
    const complete = await import("@/app/api/school/auth/complete-reset/route");
    const login = await import("@/app/api/school/auth/login/route");
    signInAs(null);
    gw.recoveryTokens.set("hash-of-par2-recovery", U.par2);
    const url = "/api/school/auth/complete-reset";
    expect((await call(complete.POST, "POST", url, { token_hash: "no-such-token-here", password: "Brand-new-pass-9" })).body).toMatchObject({ error: "invalid_token" });
    expect((await call(complete.POST, "POST", url, { token_hash: "hash-of-par2-recovery", password: "weak" })).body).toMatchObject({ error: "weak_password" });
    expect((await call(complete.POST, "POST", url, { password: "Brand-new-pass-9" })).status).toBe(422);
    expect((await call(complete.POST, "POST", url, { token_hash: "hash-of-par2-recovery", password: "Brand-new-pass-9" })).body).toEqual({ ok: true, reset: true });
    signInAs(null);
    expect((await call(login.POST, "POST", "/api/school/auth/login", { email: "par2@school.test", password: "Brand-new-pass-9" })).body).toMatchObject({ ok: true, role: "parent" });
    gw.recoveryTokens.set("pkce-code-123456", U.par2);
    expect((await call(complete.POST, "POST", url, { code: "pkce-code-123456", password: "Another-pass-55" })).body.ok).toBe(true);
  });
});

describe("API: hardening (escalation, excuse rejection, low grades, lesson term lock)", () => {
  it("a school_admin cannot reset the password of / deactivate a super_admin, nobody manages themselves, unknown ids are 404", async () => {
    const reset = await import("@/app/api/school/accounts/reset-password/route");
    const active = await import("@/app/api/school/director/accounts-active/route");
    const root = await addUser(gw, "root@school.test", PASSWORD);
    await q("update public.profiles set role='super_admin' where id=$1", [root]);
    signInAs(U.dir);
    expect((await call(reset.POST, "POST", "/api/school/accounts/reset-password", { user_id: root })).body).toMatchObject({ ok: false, error: "forbidden" });
    expect((await call(active.POST, "POST", "/api/school/director/accounts-active", { user_id: root, active: false })).body).toMatchObject({ error: "forbidden" });
    expect((await one("select is_active a from public.profiles where id=$1", [root])).a).toBe(true);
    expect((await call(active.POST, "POST", "/api/school/director/accounts-active", { user_id: U.dir, active: false })).body).toMatchObject({ error: "forbidden" }); // self lock-out
    expect((await call(reset.POST, "POST", "/api/school/accounts/reset-password", { user_id: "not-a-uuid" })).status).toBe(404);
    expect((await call(reset.POST, "POST", "/api/school/accounts/reset-password", { user_id: "b9999999-9999-4999-8999-999999999999" })).status).toBe(404);
    // a director-chosen weak password is refused, a normal teacher/parent account still works
    expect((await call(reset.POST, "POST", "/api/school/accounts/reset-password", { user_id: U.par2, password: "12345678" })).body).toMatchObject({ error: "weak_password" });
    expect((await call(reset.POST, "POST", "/api/school/accounts/reset-password", { user_id: U.par2 })).status).toBe(200);
    await q("update public.profiles set must_change_password=false where id=$1", [U.par2]);
    // a super_admin MAY manage a school_admin, but still not another super_admin
    signInAs(root);
    expect((await call(reset.POST, "POST", "/api/school/accounts/reset-password", { user_id: U.dir })).status).toBe(200);
    expect((await call(reset.POST, "POST", "/api/school/accounts/reset-password", { user_id: root })).status).toBe(403);
    await q("update public.profiles set must_change_password=false where id=$1", [U.dir]);
  });

  it("excuse rejection: absence stays absent, parent is told with the comment, resolved explanations are final, parent may explain again", async () => {
    const excuse = await import("@/app/api/school/family/excuse/route");
    const reject = await import("@/app/api/school/teacher/excuse/reject/route");
    const accept = await import("@/app/api/school/teacher/excuse/accept/route");
    const notifs = await import("@/app/api/school/notifications/route");
    signInAs(U.tA);
    const tc = await loadCtx((await getSchoolSession())!);
    await markAttendance(tc, { class_id: CLS_A, date: today, lesson_no: 2, records: [{ student_id: ST.s1, status: "absent" }] });
    signInAs(U.par);
    expect((await call(excuse.POST, "POST", "/api/school/family/excuse", { student_id: ST.s1, date: today, reason: "other", note: "dentist" })).body).toMatchObject({ ok: true, sent: true });
    // an unanswered explanation blocks a second one for the same day
    expect((await call(excuse.POST, "POST", "/api/school/family/excuse", { student_id: ST.s1, date: today, reason: "other", note: "again" })).status).toBe(409);
    signInAs(U.tA);
    const n = (await call(notifs.GET, "GET", "/api/school/notifications?unread=1")).body.items.find((x: any) => x.type === "absence_excuse" && x.payload.note === "dentist");
    const url = "/api/school/teacher/excuse/reject";
    expect((await call(reject.POST, "POST", url, { notificationId: n.id })).status).toBe(422); // comment required
    expect((await call(reject.POST, "POST", url, { notificationId: n.id, comment: "ab" })).status).toBe(422);
    signInAs(U.tB);
    expect((await call(reject.POST, "POST", url, { notificationId: n.id, comment: "not my class" })).status).toBe(403);
    signInAs(U.par);
    expect((await call(reject.POST, "POST", url, { notificationId: n.id, comment: "I am a parent" })).status).toBe(403);
    signInAs(U.tA);
    const ok = await call(reject.POST, "POST", url, { notificationId: n.id, comment: "Please bring a doctor's note" });
    expect(ok.body).toMatchObject({ ok: true, rejected: true, notified: 1, student_id: ST.s1, date: today });
    expect((await one("select count(*)::int n from public.attendance where student_id=$1 and date=$2 and lesson_no=2 and status='absent'", [ST.s1, today])).n).toBe(1);
    expect((await one("select count(*)::int n from public.audit_log where action='excuse_reject'")).n).toBe(1);
    expect((await call(reject.POST, "POST", url, { notificationId: n.id, comment: "once more" })).body).toMatchObject({ error: "already_resolved" });
    expect((await call(accept.POST, "POST", "/api/school/teacher/excuse/accept", { notificationId: n.id })).body).toMatchObject({ error: "already_resolved" });
    signInAs(U.par);
    const mine = await call(notifs.GET, "GET", "/api/school/notifications");
    expect(mine.body.items.find((x: any) => x.type === "excuse_resolved" && x.payload.status === "rejected")?.payload).toMatchObject({ comment: "Please bring a doctor's note", date: today });
    const view = await call(excuse.GET, "GET", `/api/school/family/excuse?student_id=${ST.s1}`);
    expect(view.body.excuses.find((e: any) => e.note === "dentist")).toMatchObject({ resolved: true, status: "rejected", comment: "Please bring a doctor's note" });
    // after the answer the parent may explain again
    expect((await call(excuse.POST, "POST", "/api/school/family/excuse", { student_id: ST.s1, date: today, reason: "other", note: "retry" })).status).toBe(200);
  });

  it("a NEW grade <= 2 creates an in-app low_grade notice for the guardian (opt-out respected); edits never re-notify", async () => {
    const bulk = await import("@/app/api/school/grades/bulk/route");
    const prefs = await import("@/app/api/school/me/prefs/route");
    signInAs(U.tA);
    const body = { class_id: CLS_A, subject_id: SUBJ_MATH, term_id: TERM1, entries: [{ student_id: ST.s1, date: GRADE_DATE, kind: "daily", score: 2 }, { student_id: ST.s2, date: GRADE_DATE, kind: "daily", score: 5 }] };
    const r = await call(bulk.POST, "POST", "/api/school/grades/bulk", body);
    expect(r.body).toMatchObject({ ok: true, saved: 2, newly_low: [{ student_id: ST.s1, subject_id: SUBJ_MATH, score: 2 }] });
    expect((await one("select count(*)::int n from public.notifications where user_id=$1 and type='low_grade'", [U.par])).n).toBe(1);
    expect((await one("select count(*)::int n from public.notifications where user_id=$1 and type='low_grade'", [U.par2])).n).toBe(0);
    signInAs(U.par);
    expect((await call(prefs.PUT, "PUT", "/api/school/me/prefs", { low_grade: false })).status).toBe(200);
    signInAs(U.tA);
    await call(bulk.POST, "POST", "/api/school/grades/bulk", { ...body, entries: [{ student_id: ST.s1, date: GRADE_DATE, kind: "daily", score: 1 }] });
    expect((await one("select count(*)::int n from public.notifications where user_id=$1 and type='low_grade'", [U.par])).n).toBe(1);
  });

  it("teachers cannot write lessons into a locked term (directors can)", async () => {
    const lessons = await import("@/app/api/school/lessons/route");
    const body = { class_id: CLS_A, subject_id: SUBJ_MATH, date: GRADE_DATE, lesson_no: 6, topic: "Fractions" };
    await q("update public.terms set is_locked=true where id=$1", [TERM1]);
    signInAs(U.tA);
    expect((await call(lessons.POST, "POST", "/api/school/lessons", body)).body).toMatchObject({ ok: false, error: "term_locked" });
    signInAs(U.dir);
    expect((await call(lessons.POST, "POST", "/api/school/lessons", body)).status).toBe(200);
    await q("update public.terms set is_locked=false where id=$1", [TERM1]);
    signInAs(U.tA);
    expect((await call(lessons.POST, "POST", "/api/school/lessons", { ...body, lesson_no: 7 })).status).toBe(200);
  });

  it("login: 8 attempts per account per 15 minutes (any IP), then 429 even with the right password", async () => {
    const login = await import("@/app/api/school/auth/login/route");
    signInAs(null);
    const codes: number[] = [];
    for (let i = 0; i < 9; i++) codes.push((await call(login.POST, "POST", "/api/school/auth/login", { email: "brute@school.test", password: "wrong-password" }, { "x-real-ip": `10.0.0.${i}` })).status);
    expect(codes.slice(0, 8).every((c) => c === 401)).toBe(true);
    expect(codes[8]).toBe(429);
  });

  it("cross-site requests are refused by Fetch Metadata even without an Origin header", async () => {
    const logout = await import("@/app/api/school/auth/logout/route");
    expect((await call(logout.POST, "POST", "/api/school/auth/logout", {}, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await call(logout.POST, "POST", "/api/school/auth/logout", {}, { "sec-fetch-site": "same-origin" })).status).toBe(200);
  });
});
describe("misc: fresh users get no school role by default", () => {
  it("a self-registered auth user (profile role student, no student row) has an empty school scope", async () => {
    const uid = await addUser(gw, "stranger@school.test", PASSWORD);
    signInAs(uid);
    const s = await getSchoolSession();
    expect(s).toMatchObject({ role: "student", studentIds: [] });
    expect((await gw.as(uid).from("students").select("id")).data).toEqual([]);
    expect((await gw.as(uid).from("grade_entries").select("id")).data).toEqual([]);
  });
});
