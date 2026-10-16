// Demo-mode tests for the "backend gaps" work: password rules, account flows, preferences, class average, excuse acceptance,
// room clash, term-grade override reasons, guardian invite. (The same flows run against the real schema in supabase-sim.test.ts.)
import { beforeEach, describe, expect, it } from "vitest";
import { changePassword, completePasswordReset, DEMO_RESET_CODE, requestPasswordReset } from "@/lib/school/account";
import { demoAuthState, demoSessionFor } from "@/lib/school/auth";
import { resetDemoStore, type DemoStore } from "@/lib/school/demo-store";
import { SchoolError } from "@/lib/school/errors";
import { passwordIssues } from "@/lib/school/password";
import { createAccount, generatePassword, inviteGuardian, resetPassword } from "@/lib/school/provision";
import * as svc from "@/lib/school/service";
import { loadCtx, type Ctx } from "@/lib/school/service";
import type { SchoolRole, SchoolSession } from "@/lib/school/types";

const TODAY = "2026-10-15";
let store: DemoStore;
beforeEach(() => {
  store = resetDemoStore(TODAY);
  demoAuthState().passwords.clear();
  demoAuthState().mustChange.clear();
});

function session(role: SchoolRole, teacherIndex = 0): SchoolSession {
  const t = store.tables;
  const s: SchoolSession = { id: `demo-${role}`, email: `${role === "school_admin" ? "director" : role}@demo.uz`, name: role, role, demo: true, teacherId: null, studentIds: [] };
  if (role === "teacher") {
    s.teacherId = t.teachers[teacherIndex].id;
    if (teacherIndex > 0) s.id = `other-teacher-${teacherIndex}`;
  }
  if (role === "parent") {
    const g = t.guardians.find((x) => x.user_id === "demo-parent")!;
    s.studentIds = t.student_guardians.filter((l) => l.guardian_id === g.id).map((l) => l.student_id);
  }
  if (role === "student") s.studentIds = [t.students.find((x) => x.user_id === "demo-student")!.id];
  return s;
}
const ctxFor = (role: SchoolRole, teacherIndex = 0): Promise<Ctx> => loadCtx(session(role, teacherIndex));
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof SchoolError ? e.code : String(e)));

describe("password rules", () => {
  it("accepts a normal password and names every violated rule", () => {
    expect(passwordIssues("Fresh-pass-77")).toEqual([]);
    expect(passwordIssues("short1")).toContain("too_short");
    expect(passwordIssues("onlyletters")).toContain("no_digit");
    expect(passwordIssues("12345678")).toEqual(expect.arrayContaining(["no_letter", "common"]));
    expect(passwordIssues("Password123")).toContain("common");
    expect(passwordIssues("aaaa1234x")).toContain("repeated");
    expect(passwordIssues("zafar.karimov1", { email: "zafar.karimov@school.uz" })).toContain("contains_email");
    expect(passwordIssues("Same-pass-1", { current: "Same-pass-1" })).toContain("same_as_current");
    expect(passwordIssues("x".repeat(80) + "1")).toContain("too_long");
  });
  it("generated temporary passwords always satisfy the rules", () => {
    for (let i = 0; i < 200; i++) expect(passwordIssues(generatePassword())).toEqual([]);
  });
});

describe("change password / reset (demo mode)", () => {
  it("verifies the current password, enforces strength, then the new password logs in", async () => {
    const s = session("parent");
    expect(await code(changePassword(s, "wrong", "Fresh-pass-77"))).toBe("wrong_password");
    expect(await code(changePassword(s, "demo1234", "short1"))).toBe("weak_password");
    expect(await code(changePassword(s, "demo1234", "demo1234"))).toBe("weak_password");
    expect(await code(changePassword(s, "demo1234", "Fresh-pass-77"))).toBe("ok");
    expect(demoSessionFor("parent@demo.uz", "demo1234")).toBeNull();
    expect(demoSessionFor("parent@demo.uz", "Fresh-pass-77")?.role).toBe("parent");
  });
  it("request-reset is a silent no-op in demo mode; complete-reset accepts only the demo code", async () => {
    await expect(requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    expect(await code(completePasswordReset({ code: "nope", password: "Fresh-pass-77" }))).toBe("invalid_token");
    expect(await code(completePasswordReset({ code: DEMO_RESET_CODE, email: "teacher@demo.uz", password: "weak" }))).toBe("weak_password");
    expect(await code(completePasswordReset({ code: DEMO_RESET_CODE, email: "teacher@demo.uz", password: "Fresh-pass-77" }))).toBe("ok");
    expect(demoSessionFor("teacher@demo.uz", "Fresh-pass-77")?.role).toBe("teacher");
  });
  it("accounts issued by a director carry the temporary-password flag (demo simulation)", async () => {
    const d = await ctxFor("school_admin");
    const teacher = d.assignments[0] && (await d.db.select("teachers", { eq: { user_id: null as never } }))[0];
    const acc = await createAccount(d, { kind: "teacher", id: teacher.id, email: "new.teacher@school.uz" });
    expect(acc).toMatchObject({ demo: true, must_change_password: true, temp_password: null });
    expect(demoAuthState().mustChange.has(acc.user_id)).toBe(true);
    expect(await resetPassword(d, { user_id: acc.user_id })).toMatchObject({ must_change_password: true });
    expect(await code(createAccount(await ctxFor("teacher"), { kind: "teacher", id: teacher.id, email: "x@y.uz" }))).toBe("forbidden");
  });
});

describe("invite guardian", () => {
  it("creates the guardian, links the children and provisions the login", async () => {
    const d = await ctxFor("school_admin");
    const kids = d.classes.length ? await d.db.select("students", { eq: { class_id: d.classes[0].id } }) : [];
    const r = await inviteGuardian(d, { full_name: "Yangi Ota-ona", relation: "father", email: "ota@school.uz", student_ids: [kids[0].id, kids[1].id] });
    expect(r.linked).toBe(2);
    expect(r.account).toMatchObject({ demo: true, must_change_password: true });
    expect(r.guardian.user_id).toBe(r.account!.user_id);
    expect((await d.db.select("student_guardians", { eq: { guardian_id: r.guardian.id } })).map((l) => l.student_id).sort()).toEqual([kids[0].id, kids[1].id].sort());
    // second invite for the same guardian only links
    const again = await inviteGuardian(d, { guardian_id: r.guardian.id, email: "ota@school.uz", student_ids: [kids[2].id] });
    expect(again).toMatchObject({ account: null, linked: 1 });
    expect(await code(inviteGuardian(d, { full_name: "Nobody Kids", email: "n@school.uz", student_ids: [] }))).toBe("invalid_input");
    expect(await code(inviteGuardian(d, { guardian_id: r.guardian.id, email: "o@school.uz", student_ids: ["00000000-0000-4000-8000-0000000000ff"] }))).toBe("not_found");
    expect(await code(inviteGuardian(await ctxFor("teacher"), { guardian_id: r.guardian.id, email: "o@school.uz", student_ids: [] }))).toBe("forbidden");
  });
});

describe("notification preferences", () => {
  it("default to everything on, can be patched, and gate absence + announcement notifications", async () => {
    const p = await ctxFor("parent");
    // e-mail is not an available channel: it is reported (and stored) as false whatever the row says
    expect(await svc.getPrefs(p)).toEqual({ telegram: true, email: false, absence: true, low_grade: true, announcements: true, updated_at: null, unavailable: ["email"] });
    await expect(svc.savePrefs(p, { email: true })).rejects.toMatchObject({ code: "channel_unavailable", status: 422 });
    const saved = await svc.savePrefs(p, { absence: false });
    expect(saved).toMatchObject({ absence: false, telegram: true });
    expect(saved.updated_at).toBeTruthy();
    expect(await svc.savePrefs(p, { telegram: false })).toMatchObject({ absence: false, telegram: false }); // merges
    expect(store.tables.school_notification_prefs).toHaveLength(1);

    // absence: kid2 is in 7A, whose homeroom teacher is the demo teacher
    const t = await ctxFor("teacher");
    const kid = p.s.studentIds.map((id) => store.tables.students.find((s) => s.id === id)!).find((s) => t.classIds.has(s.class_id!))!;
    const before = store.tables.notifications.filter((n) => n.user_id === "demo-parent" && n.type === "absence").length;
    await svc.markAttendance(t, { class_id: kid.class_id!, date: TODAY, lesson_no: null, records: [{ student_id: kid.id, status: "absent" }] });
    expect(store.tables.notifications.filter((n) => n.user_id === "demo-parent" && n.type === "absence").length).toBe(before); // switched off
    await svc.savePrefs(p, { absence: true });
    await svc.markAttendance(t, { class_id: kid.class_id!, date: "2026-10-14", lesson_no: null, records: [{ student_id: kid.id, status: "absent" }] });
    expect(store.tables.notifications.filter((n) => n.user_id === "demo-parent" && n.type === "absence").length).toBe(before + 1);

    // announcements
    await svc.savePrefs(p, { announcements: false });
    const d = await ctxFor("school_admin");
    const n0 = store.tables.notifications.filter((n) => n.user_id === "demo-parent" && n.type === "announcement").length;
    await svc.saveAnnouncement(d, { audience: "parents", title: "Test", body: "", pinned: false });
    expect(store.tables.notifications.filter((n) => n.user_id === "demo-parent" && n.type === "announcement").length).toBe(n0);
    await svc.savePrefs(p, { announcements: true });
    await svc.saveAnnouncement(d, { audience: "parents", title: "Test 2", body: "", pinned: false });
    expect(store.tables.notifications.filter((n) => n.user_id === "demo-parent" && n.type === "announcement").length).toBe(n0 + 1);
  });
});

describe("parent-safe class average", () => {
  it("returns per-subject aggregates and nothing individual; hides subjects with fewer than 5 graded pupils", async () => {
    const p = await ctxFor("parent");
    const child = store.tables.students.find((s) => s.id === p.s.studentIds[0])!;
    const term = p.terms[0];
    const r = await svc.classAverage(p, child.id, term.id);
    expect(r.min_students).toBe(5);
    expect(r.subjects.length).toBeGreaterThan(5);
    expect(r.subjects.every((s) => s.average === null || (s.average >= 1 && s.average <= 5))).toBe(true);
    expect(r.subjects.some((s) => s.average !== null)).toBe(true);
    const raw = JSON.stringify(r);
    for (const other of store.tables.students.filter((s) => s.class_id === child.class_id && s.id !== child.id)) expect(raw.includes(other.id)).toBe(false);

    // leave only 4 pupils with grades in one subject -> that subject disappears (null)
    const subj = r.subjects.find((s) => s.average !== null)!.subject_id;
    const classmates = store.tables.students.filter((s) => s.class_id === child.class_id).map((s) => s.id);
    const keep = new Set(classmates.slice(0, 4));
    store.tables.grade_entries = store.tables.grade_entries.filter((g) => !(g.class_id === child.class_id && g.subject_id === subj && g.term_id === term.id && !keep.has(g.student_id)));
    const r2 = await svc.classAverage(p, child.id, term.id);
    expect(r2.subjects.find((s) => s.subject_id === subj)!.average).toBeNull();

    expect(await code(svc.classAverage(p, store.tables.students.find((s) => s.class_id !== child.class_id)!.id, term.id))).toBe("forbidden");
    expect(await code(svc.classAverage(p, child.id, "00000000-0000-4000-8000-0000000000ff"))).toBe("not_found");
  });
});

describe("excuse acceptance", () => {
  async function setup(date: string) {
    const t = await ctxFor("teacher");
    const p = await ctxFor("parent");
    const kid = p.s.studentIds.map((id) => store.tables.students.find((s) => s.id === id)!).find((s) => t.classIds.has(s.class_id!))!;
    await svc.markAttendance(t, { class_id: kid.class_id!, date, lesson_no: null, records: [{ student_id: kid.id, status: "absent" }] });
    const [n] = await t.db.insert("notifications", [{ user_id: "demo-teacher", type: "absence_excuse", payload: { student_id: kid.id, date, reason: "sick", note: "flu", parent_user_id: "demo-parent" } }]);
    return { t, p, kid, n };
  }

  it("homeroom teacher: absence -> excused, notification read, parent notified; second time -> already_resolved", async () => {
    const { t, kid, n } = await setup(TODAY);
    const r = await svc.acceptExcuse(t, n.id);
    expect(r).toMatchObject({ excused: 1, notified: 1, student_id: kid.id, date: TODAY });
    const row = store.tables.attendance.find((a) => a.student_id === kid.id && a.date === TODAY)!;
    expect(row.status).toBe("excused");
    expect(row.note).toContain("excuse: sick");
    expect(store.tables.notifications.find((x) => x.id === n.id)!.read_at).not.toBeNull();
    const back = store.tables.notifications.find((x) => x.user_id === "demo-parent" && x.type === "excuse_resolved")!;
    expect(back.payload).toMatchObject({ student_id: kid.id, date: TODAY, status: "accepted" });
    expect(store.auditLog.some((a) => a.action === "excuse_accept")).toBe(true);
    expect(await code(svc.acceptExcuse(t, n.id))).toBe("already_resolved");
  });

  it("other teachers, wrong notification types and non-staff are refused", async () => {
    const { n, t } = await setup(TODAY);
    expect(await code(svc.acceptExcuse(await ctxFor("teacher", 1), n.id))).toBe("forbidden"); // not the addressee
    const [plain] = await t.db.insert("notifications", [{ user_id: "demo-teacher", type: "announcement", payload: {} }]);
    expect(await code(svc.acceptExcuse(t, plain.id))).toBe("invalid_input");
    expect(await code(svc.acceptExcuse(t, "00000000-0000-4000-8000-0000000000ff"))).toBe("not_found");
  });

  it("term lock blocks teachers (directors may still accept); the attendance edit window applies", async () => {
    const { t, n, kid } = await setup(TODAY);
    const term = t.terms.find((x) => TODAY >= x.start_date && TODAY <= x.end_date);
    if (term) {
      await svc.lockTerm(await ctxFor("school_admin"), term.id, true);
      expect(await code(svc.acceptExcuse(await ctxFor("teacher"), n.id))).toBe("term_locked"); // fresh context, like a new request
      const viaDirector = await svc.acceptExcuse(await ctxFor("school_admin"), n.id);
      expect(viaDirector.excused).toBe(1);
      await svc.lockTerm(await ctxFor("school_admin"), term.id, false);
    }
    // an absence older than 14 days can only be edited by a director
    const old = "2026-09-20";
    const d = await ctxFor("school_admin");
    await svc.markAttendance(d, { class_id: kid.class_id!, date: old, lesson_no: null, records: [{ student_id: kid.id, status: "absent" }] });
    const [n2] = await t.db.insert("notifications", [{ user_id: "demo-teacher", type: "absence_excuse", payload: { student_id: kid.id, date: old, reason: "family", note: "" } }]);
    expect(await code(svc.acceptExcuse(t, n2.id))).toBe("edit_window_closed");
    expect((await svc.acceptExcuse(d, n2.id)).excused).toBe(1);
    // no parent_user_id in the payload -> every guardian of the pupil with an account is told
    expect(store.tables.notifications.filter((x) => x.type === "excuse_resolved" && x.payload.date === old).length).toBeGreaterThanOrEqual(1);
  });
});

describe("schedule room clash", () => {
  it("rejects a second class in the same room at the same weekday + lesson (room_busy) and treats blank rooms as free", async () => {
    const d = await ctxFor("school_admin");
    const slots = await d.db.select("schedule_slots");
    // find a taken cell (X) and another class that has no lesson in that cell
    let found: { x: (typeof slots)[number]; classId: string } | null = null;
    for (const x of slots) {
      if (!x.room) continue;
      const free = d.classes.find((c) => c.id !== x.class_id && !slots.some((s) => s.class_id === c.id && s.weekday === x.weekday && s.lesson_no === x.lesson_no));
      if (free) {
        found = { x, classId: free.id };
        break;
      }
    }
    expect(found).not.toBeNull();
    const base = { class_id: found!.classId, subject_id: found!.x.subject_id, teacher_id: null, weekday: found!.x.weekday, lesson_no: found!.x.lesson_no, start_time: "08:00:00", end_time: "08:45:00" };
    expect(await code(svc.saveSlot(d, { ...base, room: ` ${found!.x.room!.toUpperCase()} ` }))).toBe("room_busy");
    expect(await code(svc.saveSlot(d, { ...base, room: "Brand new room" }))).toBe("ok");
    expect(await code(svc.saveSlot(d, { ...base, lesson_no: 8, weekday: 6, room: null }))).toBe("ok");
    // the generated demo timetable itself obeys the rule
    const seen = new Set<string>();
    for (const s of slots) {
      if (!s.room) continue;
      const key = `${s.room.trim().toLowerCase()}|${s.weekday}|${s.lesson_no}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});

describe("term grade override reason", () => {
  it("is stored with the confirmed value and returned by the term table; cleared with the grade", async () => {
    const t = await ctxFor("teacher");
    const a = t.assignments.find((x) => x.teacher_id === t.s.teacherId)!;
    const term = t.terms[3];
    const kids = await svc.scopedStudents(t, { class_id: a.class_id, status: "active" });
    await svc.saveTermGrades(t, { class_id: a.class_id, subject_id: a.subject_id, term_id: term.id, rows: [{ student_id: kids[0].id, value: 5, override_reason: "  oral exam  " }, { student_id: kids[1].id, value: 4 }] });
    const table = await svc.termGradesTable(t, a.class_id, a.subject_id, term.id);
    expect(table.rows.find((r) => r.student_id === kids[0].id)).toMatchObject({ value: 5, override_reason: "oral exam" });
    expect(table.rows.find((r) => r.student_id === kids[1].id)!.override_reason).toBeNull();
    await svc.saveTermGrades(t, { class_id: a.class_id, subject_id: a.subject_id, term_id: term.id, rows: [{ student_id: kids[0].id, value: null, override_reason: "stale" }] });
    expect((await svc.termGradesTable(t, a.class_id, a.subject_id, term.id)).rows.find((r) => r.student_id === kids[0].id)!.override_reason).toBeNull();
  });
});
