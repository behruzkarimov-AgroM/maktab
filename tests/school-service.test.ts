import { beforeEach, describe, expect, it } from "vitest";
import { DemoStore, resetDemoStore } from "@/lib/school/demo-store";
import { SchoolError } from "@/lib/school/errors";
import * as svc from "@/lib/school/service";
import { actorOf, loadCtx, type Ctx } from "@/lib/school/service";
import type { SchoolRole, SchoolSession } from "@/lib/school/types";

const TODAY = "2026-10-15";
let store: DemoStore;

beforeEach(() => {
  store = resetDemoStore(TODAY);
});

async function ctxFor(role: SchoolRole): Promise<Ctx> {
  const t = store.tables;
  const s: SchoolSession = { id: `demo-${role}`, email: `${role}@demo.uz`, name: role, role, demo: true, teacherId: null, studentIds: [] };
  if (role === "teacher") s.teacherId = t.teachers[0].id;
  if (role === "parent") {
    const g = t.guardians.find((x) => x.user_id === "demo-parent")!;
    s.studentIds = t.student_guardians.filter((l) => l.guardian_id === g.id).map((l) => l.student_id);
  }
  if (role === "student") s.studentIds = [t.students.find((x) => x.user_id === "demo-student")!.id];
  void actorOf;
  return loadCtx(s);
}
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof SchoolError ? e.code : String(e)));

describe("service scoping", () => {
  it("director sees 300 students, teacher only own classes, parent 2, student 1", async () => {
    expect((await svc.listStudents(await ctxFor("school_admin"), { limit: 500 })).total).toBe(300);
    const t = await ctxFor("teacher");
    const own = await svc.listStudents(t, { limit: 500 });
    expect(own.total).toBeGreaterThan(30);
    expect(own.total).toBeLessThan(150);
    expect(own.students.every((s) => t.classIds.has(s.class_id!))).toBe(true);
    expect((await svc.listStudents(await ctxFor("parent"))).total).toBe(2);
    expect((await svc.listStudents(await ctxFor("student"))).total).toBe(1);
  });
  it("teacher cannot open another class or a foreign student; parent cannot open another child", async () => {
    const t = await ctxFor("teacher");
    const foreignClass = t.classes.find((c) => !t.classIds.has(c.id))!;
    expect(await code(svc.getAttendanceDay(t, foreignClass.id, TODAY))).toBe("forbidden");
    expect(await code(svc.listStudents(t, { class_id: foreignClass.id }))).toBe("forbidden");
    const foreignStudent = store.tables.students.find((s) => s.class_id === foreignClass.id)!;
    expect(await code(svc.getStudent(t, foreignStudent.id))).toBe("forbidden");
    const p = await ctxFor("parent");
    expect(await code(svc.getStudent(p, foreignStudent.id))).toBe("forbidden");
    expect(await code(svc.studentPerformance(p, foreignStudent.id))).toBe("forbidden");
    expect(await code(svc.getAttendanceDay(p, foreignClass.id, TODAY))).toBe("forbidden");
  });
  it("only directors mutate people / reference data", async () => {
    const t = await ctxFor("teacher");
    expect(await code(svc.saveStudent(t, { first_name: "A", last_name: "B" }))).toBe("forbidden");
    expect(await code(svc.deleteClass(t, t.classes[0].id))).toBe("forbidden");
    expect(await code(svc.lockTerm(t, t.terms[0].id, true))).toBe("forbidden");
    const d = await ctxFor("school_admin");
    const st = await svc.saveStudent(d, { first_name: "Yangi", last_name: "Oquvchi", class_id: d.classes[0].id });
    expect(st.student_code).toMatch(/^ST-\d{4}-\d{4}$/);
    expect(await code(svc.saveStudent(d, { first_name: "X", last_name: "Y", student_code: st.student_code }))).toBe("conflict");
  });
});

describe("attendance flow", () => {
  it("teacher marks today, absence creates a parent notification, history + summary reflect it", async () => {
    const t = await ctxFor("teacher");
    const cls = t.classes.find((c) => c.name === "7A")!;
    const roster = (await svc.getAttendanceDay(t, cls.id, TODAY)).rows;
    expect(roster.length).toBe(21);
    expect(roster.every((r) => r.status === null)).toBe(true);
    const kid = store.tables.students.find((s) => s.class_id === cls.id && s.last_name === "Rahimova")!;
    const res = await svc.markAttendance(t, { class_id: cls.id, date: TODAY, lesson_no: null, records: roster.map((r) => ({ student_id: r.student_id, status: r.student_id === kid.id ? "absent" : "present" })) });
    expect(res.saved).toBe(21);
    expect(res.newly_absent).toHaveLength(1);
    expect(store.tables.notifications.some((n) => n.user_id === "demo-parent" && n.type === "absence")).toBe(true);
    // marking the same status again is not "newly" absent
    const again = await svc.markAttendance(t, { class_id: cls.id, date: TODAY, lesson_no: null, records: [{ student_id: kid.id, status: "absent" }] });
    expect(again.newly_absent).toHaveLength(0);
    const p = await ctxFor("parent");
    const hist = await svc.studentAttendance(p, kid.id);
    expect(hist.rows[0]).toMatchObject({ date: TODAY, status: "absent" });
    const sum = await svc.attendanceSummary(t, cls.id);
    expect(sum.rows.find((r) => r.student_id === kid.id)!.absent).toBeGreaterThan(0);
    const notes = await svc.listNotifications(p);
    expect(notes.unread).toBeGreaterThan(0);
    expect(await svc.markNotificationsRead(p, { all: true })).toBe(notes.unread);
    expect((await svc.listNotifications(p)).unread).toBe(0);
  });
});

describe("grades flow", () => {
  it("gradebook, term suggestion and confirmation; locked term blocks the teacher", async () => {
    const t = await ctxFor("teacher");
    const a = t.assignments.find((x) => x.teacher_id === t.s.teacherId)!;
    const term = t.terms[0];
    const gb = await svc.gradebook(t, a.class_id, a.subject_id, term.id);
    expect(gb.can_edit).toBe(true);
    expect(gb.rows.length).toBeGreaterThan(15);
    const row = gb.rows.find((r) => r.suggested !== null)!;
    expect(row.suggested).toBeGreaterThanOrEqual(1);
    expect(row.suggested).toBeLessThanOrEqual(5);
    const saved = await svc.saveTermGrades(t, { class_id: a.class_id, subject_id: a.subject_id, term_id: term.id, rows: [{ student_id: row.student_id, value: 5 }] });
    expect(saved.saved).toBe(1);
    const table = await svc.termGradesTable(t, a.class_id, a.subject_id, term.id);
    expect(table.rows.find((r) => r.student_id === row.student_id)).toMatchObject({ value: 5, is_confirmed: true });
    // add a grade with the API default weight for "test"
    await svc.saveGrades(t, { class_id: a.class_id, subject_id: a.subject_id, term_id: term.id, entries: [{ student_id: row.student_id, date: "2026-10-14", kind: "test", score: 4 }] });
    const added = store.tables.grade_entries.find((g) => g.student_id === row.student_id && g.date === "2026-10-14" && g.kind === "test" && g.subject_id === a.subject_id)!;
    expect(added.weight).toBe(2);
    const d = await ctxFor("school_admin");
    await svc.lockTerm(d, term.id, true);
    const t2 = await ctxFor("teacher");
    expect(await code(svc.saveGrades(t2, { class_id: a.class_id, subject_id: a.subject_id, term_id: term.id, entries: [{ student_id: row.student_id, date: "2026-10-14", kind: "daily", score: 5 }] }))).toBe("term_locked");
    expect((await svc.gradebook(t2, a.class_id, a.subject_id, term.id)).can_edit).toBe(false);
  });
  it("student performance: trend, subjects, rank, attendance and report card", async () => {
    const p = await ctxFor("student");
    const id = p.s.studentIds[0];
    const perf = await svc.studentPerformance(p, id);
    expect(perf.trend).toHaveLength(4);
    expect(perf.trend[0].count).toBeGreaterThan(5);
    expect(perf.subjects.length).toBeGreaterThanOrEqual(9);
    expect(perf.overall_average).toBeGreaterThan(1);
    expect(perf.rank_in_class).toBeGreaterThanOrEqual(1);
    expect(perf.class_size).toBeGreaterThan(15);
    expect(perf.attendance.total).toBeGreaterThan(20);
    const card = await svc.reportCard(p, id, p.terms[0].id);
    expect(card.subjects.length).toBe(perf.subjects.length);
    expect(card.homeroom_teacher).toBeTruthy();
  });
});

describe("risk + dashboards", () => {
  it("lists forced absence-streak students; parents cannot list risk", async () => {
    const d = await ctxFor("school_admin");
    const risk = await svc.listRisk(d, { limit: 200 });
    expect(risk.some((r) => r.flags.includes("absence_streak"))).toBe(true);
    expect(risk.some((r) => r.flags.includes("low_attendance"))).toBe(true);
    expect(await code(svc.listRisk(await ctxFor("parent")))).toBe("forbidden");
    const t = await ctxFor("teacher");
    for (const r of await svc.listRisk(t)) expect(t.classIds.has(r.class_id!)).toBe(true);
  });
  it("role-aware dashboard", async () => {
    const dd = await svc.dashboard(await ctxFor("school_admin"));
    expect(dd.cards.find((c) => c.key === "students")!.value).toBe(300);
    expect(dd.charts.attendanceByClass).toHaveLength(14);
    expect(dd.charts.gradeDistribution).toHaveLength(5);
    const td = await svc.dashboard(await ctxFor("teacher"));
    expect(td.pending!.length).toBe(td.cards.find((c) => c.key === "pendingAttendance")!.value);
    const pd = await svc.dashboard(await ctxFor("parent"));
    expect(pd.children).toHaveLength(2);
    expect(pd.announcements.every((a) => a.audience !== "teachers")).toBe(true);
    const sd = await svc.dashboard(await ctxFor("student"));
    expect(sd.children).toHaveLength(1);
  });
});

describe("announcements + import", () => {
  it("teacher can only post class announcements for own class", async () => {
    const t = await ctxFor("teacher");
    const own = [...t.classIds][0];
    const foreign = t.classes.find((c) => !t.classIds.has(c.id))!.id;
    expect(await code(svc.saveAnnouncement(t, { audience: "all", title: "x", body: "", pinned: false }))).toBe("forbidden");
    expect(await code(svc.saveAnnouncement(t, { audience: "class", class_id: foreign, title: "x", body: "", pinned: false }))).toBe("forbidden");
    expect(await code(svc.saveAnnouncement(t, { audience: "class", class_id: own, title: "ok", body: "b", pinned: false }))).toBe("ok");
  });
  it("import commit detects duplicates and creates guardians", async () => {
    const d = await ctxFor("school_admin");
    const existing = store.tables.students[0];
    const res = await svc.commitStudentImport(d, {
      on_duplicate: "skip",
      rows: [
        { first_name: "Import", last_name: "Student", birth_date: "2015-04-04", class_name: "5A", guardian_name: "Import Parent", guardian_phone: "+998901234567" },
        { first_name: existing.first_name, last_name: existing.last_name, birth_date: existing.birth_date, student_code: existing.student_code },
        { first_name: "Bad", last_name: "Class", class_name: "99Z" },
      ],
    });
    expect(res).toMatchObject({ created: 1, skipped: 1, invalid: 1, updated: 0 });
    const created = store.tables.students.find((s) => s.last_name === "Student" && s.first_name === "Import")!;
    expect(created.class_id).toBe(d.classes.find((c) => c.name === "5A")!.id);
    expect(store.tables.student_guardians.some((l) => l.student_id === created.id)).toBe(true);
    expect(await code(svc.previewStudentImport(await ctxFor("teacher"), []))).toBe("forbidden");
  });
});
