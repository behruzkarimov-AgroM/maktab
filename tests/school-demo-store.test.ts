import { beforeEach, describe, expect, it } from "vitest";
import { generateDemoData, hash, rnd } from "@/lib/school/demo-data";
import { DemoStore } from "@/lib/school/demo-store";
import type { Actor } from "@/lib/school/db";
import { countAttendance } from "@/lib/school/grading";
import { SchoolError } from "@/lib/school/errors";

const TODAY = "2026-10-15";
let store: DemoStore;
const director: Actor = { id: "demo-director", email: "d@x.uz", role: "school_admin", teacherId: null, demo: true };
const teacherActor = (teacherId: string): Actor => ({ id: `u-${teacherId}`, email: "t@x.uz", role: "teacher", teacherId, demo: true });
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof SchoolError ? e.code : String(e)));

beforeEach(() => {
  store = new DemoStore(TODAY);
});

describe("demo data generator", () => {
  it("is deterministic (no Math.random)", () => {
    const a = generateDemoData(TODAY);
    const b = generateDemoData(TODAY);
    expect(JSON.stringify(a.tables.attendance.slice(0, 500))).toBe(JSON.stringify(b.tables.attendance.slice(0, 500)));
    expect(a.tables.grade_entries.length).toBe(b.tables.grade_entries.length);
    expect(hash("x")).toBe(hash("x"));
    expect(rnd("y")).toBeGreaterThanOrEqual(0);
    expect(rnd("y")).toBeLessThan(1);
  });
  it("has the promised size", () => {
    const t = store.tables;
    expect(t.classes).toHaveLength(14);
    expect(t.subjects).toHaveLength(12);
    expect(t.teachers).toHaveLength(25);
    expect(t.students).toHaveLength(300);
    expect(t.terms).toHaveLength(4);
    expect(t.school_years[0].is_current).toBe(true);
    const hours = t.teaching_assignments.reduce((n, a) => n + a.hours_per_week, 0);
    expect(t.schedule_slots.length).toBeGreaterThan(hours * 0.9);
    expect(t.schedule_slots.length).toBeLessThanOrEqual(hours);
    expect(t.attendance.length).toBeGreaterThan(8000);
    expect(t.grade_entries.length).toBeGreaterThan(8000);
  });
  it("attendance is about 93% present, grades are realistic", () => {
    const k = countAttendance(store.tables.attendance);
    const presentShare = store.tables.attendance.filter((r) => r.status === "present").length / k.total;
    expect(presentShare).toBeGreaterThan(0.88);
    expect(presentShare).toBeLessThan(0.97);
    const scores = store.tables.grade_entries.map((g) => g.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThan(3.6);
    expect(mean).toBeLessThan(4.5);
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...scores)).toBeLessThanOrEqual(5);
  });
  it("is internally consistent", () => {
    const t = store.tables;
    const att = new Set<string>();
    for (const r of t.attendance) {
      const key = `${r.student_id}|${r.date}|${r.lesson_no ?? 0}`;
      expect(att.has(key)).toBe(false);
      att.add(key);
    }
    const studentClass = new Map(t.students.map((s) => [s.id, s.class_id]));
    for (const g of t.grade_entries.slice(0, 3000)) expect(studentClass.get(g.student_id)).toBe(g.class_id);
    // no teacher teaches two classes in the same slot
    const busy = new Set<string>();
    for (const s of t.schedule_slots) {
      const k = `${s.teacher_id}|${s.weekday}|${s.lesson_no}`;
      expect(busy.has(k)).toBe(false);
      busy.add(k);
    }
    // demo family: parent has 2 children in different classes
    const links = t.student_guardians.filter((l) => l.guardian_id === t.guardians.find((g) => g.user_id === "demo-parent")!.id);
    expect(links).toHaveLength(2);
    // today is not pre-marked so teachers can demo marking
    expect(t.attendance.some((r) => r.date === TODAY)).toBe(false);
  });
});

describe("attendance invariants", () => {
  const cls = () => store.tables.classes.find((c) => c.name === "7A")!;
  const roster = () => store.tables.students.filter((s) => s.class_id === cls().id);
  const teacherOf7A = () => teacherActor(cls().homeroom_teacher_id!);

  it("one record per student/day/lesson (upsert, never duplicates)", async () => {
    const [a, b] = roster();
    await store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: TODAY, lesson_no: null, records: [{ student_id: a.id, status: "absent" }, { student_id: b.id, status: "late", minutes_late: 7 }] });
    await store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: TODAY, lesson_no: null, records: [{ student_id: a.id, status: "present" }] });
    const rows = store.tables.attendance.filter((r) => r.student_id === a.id && r.date === TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("present");
    expect(store.tables.attendance.find((r) => r.student_id === b.id && r.date === TODAY)!.minutes_late).toBe(7);
    await store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: TODAY, lesson_no: 2, records: [{ student_id: a.id, status: "absent" }] });
    expect(store.tables.attendance.filter((r) => r.student_id === a.id && r.date === TODAY)).toHaveLength(2);
    expect(await code(store.insert("attendance", [{ student_id: a.id, class_id: cls().id, date: TODAY, lesson_no: null, status: "absent" }]))).toBe("conflict");
  });
  it("validates ownership, status, dates, window and class membership", async () => {
    const [a] = roster();
    const other = store.tables.classes.find((c) => c.name === "1A")!;
    const rec = [{ student_id: a.id, status: "absent" }];
    expect(await code(store.markAttendanceBulk(teacherActor("nobody"), { class_id: cls().id, date: TODAY, lesson_no: null, records: rec }))).toBe("forbidden");
    expect(await code(store.markAttendanceBulk({ ...teacherOf7A(), role: "parent" }, { class_id: cls().id, date: TODAY, lesson_no: null, records: rec }))).toBe("forbidden");
    expect(await code(store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: TODAY, lesson_no: null, records: [{ student_id: a.id, status: "gone" }] }))).toBe("invalid_status");
    expect(await code(store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: "2026-10-20", lesson_no: null, records: rec }))).toBe("invalid_date");
    expect(await code(store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: "2026-09-01", lesson_no: null, records: rec }))).toBe("edit_window_closed");
    expect(await code(store.markAttendanceBulk(director, { class_id: cls().id, date: "2026-09-01", lesson_no: null, records: rec }))).toBe("ok");
    expect(await code(store.markAttendanceBulk(director, { class_id: other.id, date: TODAY, lesson_no: null, records: rec }))).toBe("student_not_in_class");
    expect(await code(store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: TODAY, lesson_no: 9, records: rec }))).toBe("invalid_input");
    expect(await code(store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: TODAY, lesson_no: null, records: [] }))).toBe("invalid_input");
  });
  it("is atomic: a bad record rolls back the whole batch", async () => {
    const [a, b] = roster();
    const before = store.tables.attendance.length;
    const r = await code(store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: TODAY, lesson_no: null, records: [{ student_id: a.id, status: "absent" }, { student_id: b.id, status: "nope" }] }));
    expect(r).toBe("invalid_status");
    expect(store.tables.attendance.length).toBe(before);
  });
  it("writes an audit row", async () => {
    const [a] = roster();
    await store.markAttendanceBulk(teacherOf7A(), { class_id: cls().id, date: TODAY, lesson_no: null, records: [{ student_id: a.id, status: "absent" }] });
    expect(store.auditLog.at(-1)).toMatchObject({ action: "attendance_bulk", resource: "attendance", record_id: cls().id });
  });
});

describe("grade invariants", () => {
  const cls = () => store.tables.classes.find((c) => c.name === "5A")!;
  const asg = () => store.tables.teaching_assignments.filter((a) => a.class_id === cls().id);
  const term1 = () => store.tables.terms[0];
  const student = () => store.tables.students.find((s) => s.class_id === cls().id)!;
  const day = "2026-10-12";

  it("teachers grade only their own subject in their own class", async () => {
    const [mine, other] = asg();
    const t = teacherActor(mine.teacher_id);
    const entry = { student_id: student().id, date: day, kind: "daily", score: 5 };
    expect(await code(store.saveGradesBulk(t, { class_id: cls().id, subject_id: mine.subject_id, term_id: term1().id, entries: [entry] }))).toBe("ok");
    if (other.teacher_id !== mine.teacher_id) {
      expect(await code(store.saveGradesBulk(t, { class_id: cls().id, subject_id: other.subject_id, term_id: term1().id, entries: [entry] }))).toBe("forbidden");
    }
    expect(await code(store.saveGradesBulk({ ...t, role: "parent" }, { class_id: cls().id, subject_id: mine.subject_id, term_id: term1().id, entries: [entry] }))).toBe("forbidden");
    expect(await code(store.saveGradesBulk(director, { class_id: cls().id, subject_id: other.subject_id, term_id: term1().id, entries: [entry] }))).toBe("ok");
  });
  it("validates score, kind, term window and future dates", async () => {
    const a = asg()[0];
    const t = teacherActor(a.teacher_id);
    const base = { class_id: cls().id, subject_id: a.subject_id, term_id: term1().id };
    const e = (over: object) => ({ student_id: student().id, date: day, kind: "daily", score: 4, ...over });
    expect(await code(store.saveGradesBulk(t, { ...base, entries: [e({ score: 6 })] }))).toBe("invalid_score");
    expect(await code(store.saveGradesBulk(t, { ...base, entries: [e({ score: 0.5 })] }))).toBe("invalid_score");
    expect(await code(store.saveGradesBulk(t, { ...base, entries: [e({ kind: "cheat" })] }))).toBe("invalid_kind");
    expect(await code(store.saveGradesBulk(t, { ...base, entries: [e({ date: "2026-07-01" })] }))).toBe("date_out_of_term");
    expect(await code(store.saveGradesBulk(t, { ...base, entries: [e({ date: "2026-10-30" })] }))).toBe("invalid_date");
    expect(await code(store.saveGradesBulk(t, { ...base, term_id: "nope", entries: [e({})] }))).toBe("not_found");
    const foreign = store.tables.students.find((s) => s.class_id !== cls().id)!;
    expect(await code(store.saveGradesBulk(t, { ...base, entries: [e({ student_id: foreign.id })] }))).toBe("student_not_in_class");
  });
  it("rejects writes to a LOCKED term for teachers, allows directors, unlock restores", async () => {
    const a = asg()[0];
    const t = teacherActor(a.teacher_id);
    const args = { class_id: cls().id, subject_id: a.subject_id, term_id: term1().id, entries: [{ student_id: student().id, date: day, kind: "daily", score: 4 }] };
    expect(await code(store.lockTerm(t, term1().id, true))).toBe("forbidden");
    await store.lockTerm(director, term1().id, true);
    expect(await code(store.saveGradesBulk(t, args))).toBe("term_locked");
    expect(await code(store.saveTermGradesBulk(t, { class_id: cls().id, subject_id: a.subject_id, term_id: term1().id, rows: [{ student_id: student().id, value: 4 }] }))).toBe("term_locked");
    expect(await code(store.saveGradesBulk(director, args))).toBe("ok");
    await store.lockTerm(director, term1().id, false);
    expect(await code(store.saveGradesBulk(t, args))).toBe("ok");
  });
  it("update + delete by id, all-or-nothing", async () => {
    const a = asg()[0];
    const t = teacherActor(a.teacher_id);
    const base = { class_id: cls().id, subject_id: a.subject_id, term_id: term1().id };
    await store.saveGradesBulk(t, { ...base, entries: [{ student_id: student().id, date: day, kind: "test", score: 3, weight: 2 }] });
    const row = store.tables.grade_entries.find((g) => g.student_id === student().id && g.date === day && g.subject_id === a.subject_id && g.kind === "test")!;
    expect(row.weight).toBe(2);
    await store.saveGradesBulk(t, { ...base, entries: [{ id: row.id, student_id: student().id, date: day, kind: "test", score: 4.5, weight: 2 }] });
    expect(store.tables.grade_entries.find((g) => g.id === row.id)!.score).toBe(4.5);
    const n = store.tables.grade_entries.length;
    expect(await code(store.saveGradesBulk(t, { ...base, entries: [{ id: row.id, delete: true }, { student_id: student().id, date: day, kind: "daily", score: 9 }] }))).toBe("invalid_score");
    expect(store.tables.grade_entries.length).toBe(n);
    const res = await store.saveGradesBulk(t, { ...base, entries: [{ id: row.id, delete: true }] });
    expect(res.deleted).toBe(1);
    expect(store.tables.grade_entries.some((g) => g.id === row.id)).toBe(false);
  });
});

describe("store constraints + cascades", () => {
  it("enforces unique keys", async () => {
    const s = store.tables.students[0];
    expect(await code(store.insert("students", [{ first_name: "A", last_name: "B", student_code: s.student_code }]))).toBe("conflict");
    const c = store.tables.classes[0];
    expect(await code(store.insert("classes", [{ year_id: c.year_id, grade: c.grade, letter: c.letter, name: c.name }]))).toBe("conflict");
    const a = store.tables.teaching_assignments[0];
    expect(await code(store.insert("teaching_assignments", [{ class_id: a.class_id, subject_id: a.subject_id, teacher_id: a.teacher_id }]))).toBe("conflict");
  });
  it("deleting a student removes dependent rows", async () => {
    const s = store.tables.students[5];
    expect(store.tables.attendance.some((r) => r.student_id === s.id)).toBe(true);
    await store.remove("students", { eq: { id: s.id } });
    for (const t of ["attendance", "grade_entries", "term_grades", "student_guardians"] as const) {
      expect((store.tables[t] as { student_id: string }[]).some((r) => r.student_id === s.id)).toBe(false);
    }
  });
});
