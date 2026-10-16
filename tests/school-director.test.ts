import { beforeEach, describe, expect, it } from "vitest";
import {
  datesBetween, detectSlotConflicts, filterRisk, findTimetableConflicts, mean, normalizeReason, pct, percentByKey, planRollover, previewToCommitRows, rangeFor, rankDesc, shiftRange,
} from "@/lib/school/director-logic";
import { resetDemoStore, type DemoStore } from "@/lib/school/demo-store";
import { SchoolError } from "@/lib/school/errors";
import { loadCtx } from "@/lib/school/svc-core";
import * as dir from "@/lib/school/svc-director";
import type { ImportPreview, ScheduleSlot, SchoolClass, SchoolSession } from "@/lib/school/types";

const slot = (o: Partial<ScheduleSlot>): ScheduleSlot => ({
  id: "s1", class_id: "c1", subject_id: "sub", teacher_id: "t1", weekday: 1, lesson_no: 1, start_time: "08:00", end_time: "08:45", room: "101", ...o,
});

describe("schedule conflicts", () => {
  const existing = [slot({}), slot({ id: "s2", class_id: "c2", teacher_id: "t2", room: "202", lesson_no: 2 })];
  it("detects class cell, teacher and room clashes", () => {
    expect(detectSlotConflicts(existing, { class_id: "c1", teacher_id: null, weekday: 1, lesson_no: 1, room: null }).map((c) => c.kind)).toEqual(["class"]);
    expect(detectSlotConflicts(existing, { class_id: "c3", teacher_id: "t1", weekday: 1, lesson_no: 1, room: "999" }).map((c) => c.kind)).toEqual(["teacher"]);
    expect(detectSlotConflicts(existing, { class_id: "c3", teacher_id: "t9", weekday: 1, lesson_no: 1, room: " 101 " }).map((c) => c.kind)).toEqual(["room"]);
    expect(detectSlotConflicts(existing, { class_id: "c3", teacher_id: "t1", weekday: 1, lesson_no: 1, room: "101" }).map((c) => c.kind).sort()).toEqual(["room", "teacher"]);
  });
  it("ignores itself when editing and other cells", () => {
    expect(detectSlotConflicts(existing, { id: "s1", class_id: "c1", teacher_id: "t1", weekday: 1, lesson_no: 1, room: "101" })).toEqual([]);
    expect(detectSlotConflicts(existing, { class_id: "c3", teacher_id: "t1", weekday: 2, lesson_no: 1, room: "101" })).toEqual([]);
  });
  it("finds clashes in a whole timetable", () => {
    const all = [slot({}), slot({ id: "s9", class_id: "c9", room: "101" })];
    const kinds = findTimetableConflicts(all).map((c) => c.kind).sort();
    expect(kinds).toEqual(["room", "teacher"]);
    expect(findTimetableConflicts([slot({}), slot({ id: "x", class_id: "c2", teacher_id: "t2", room: "5" })])).toEqual([]);
  });
});

describe("dates and numbers", () => {
  it("ranges", () => {
    expect(rangeFor("day", "2026-10-15")).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    expect(rangeFor("week", "2026-10-15")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(rangeFor("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftRange("week", "2026-10-15", -1)).toBe("2026-10-08");
    expect(shiftRange("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(datesBetween("2026-10-10", "2026-10-13")).toEqual(["2026-10-10", "2026-10-12", "2026-10-13"]);
  });
  it("pct / mean / reason", () => {
    expect(pct(93, 100)).toBe(93);
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(0, 0)).toBeNull();
    expect(mean([4, 5, null])).toBe(4.5);
    expect(mean([null])).toBeNull();
    expect(normalizeReason("  Kasal   ")).toBe("kasal");
  });
  it("percentByKey counts present and late as attended", () => {
    const m = percentByKey([{ status: "present", c: "a" }, { status: "late", c: "a" }, { status: "absent", c: "a" }, { status: "sick", c: "a" }, { status: "present", c: "b" }], (r) => r.c);
    expect(m.get("a")).toBe(50);
    expect(m.get("b")).toBe(100);
  });
  it("rankDesc uses competition ranking and leaves nulls unranked", () => {
    const r = rankDesc([{ v: 4 }, { v: 5 }, { v: 4 }, { v: null }, { v: 3 }], (x) => x.v);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4, null]);
  });
});

describe("rollover plan", () => {
  const cls = (grade: number, letter: string): SchoolClass => ({ id: `${grade}${letter}`, year_id: "y1", grade, letter, name: `${grade}${letter}`, homeroom_teacher_id: null, room: null });
  it("promotes N to N+1, creates missing, graduates the last grade", () => {
    const plan = planRollover([cls(10, "A"), cls(11, "A"), cls(1, "B")], [{ ...cls(11, "A"), id: "new11A", year_id: "y2" }], [
      { class_id: "10A", status: "active" }, { class_id: "10A", status: "active" }, { class_id: "10A", status: "expelled" }, { class_id: "11A", status: "active" },
    ]);
    expect(plan.map((p) => [p.from_name, p.to_name, p.to_class_id, p.action, p.student_count])).toEqual([
      ["1B", "2B", null, "promote", 0], ["10A", "11A", "new11A", "promote", 2], ["11A", null, null, "graduate", 1],
    ]);
  });
});

describe("import mapping", () => {
  const preview: ImportPreview = {
    total: 3, valid: 2, duplicates: 1, invalid: 1,
    rows: [
      { row: 1, ok: true, errors: [], duplicate: "none", action: "create", data: { last_name: "A", first_name: "B", class_name: "3A", birth_date: "2014-01-01" } },
      { row: 2, ok: true, errors: [], duplicate: "student_code", action: "skip", data: { last_name: "C", first_name: "D" } },
      { row: 3, ok: false, errors: ["x"], duplicate: "none", action: "invalid", data: { last_name: "E" } },
    ],
  };
  it("skips invalid rows and duplicates unless updating", () => {
    expect(previewToCommitRows(preview, { includeDuplicates: false }).map((r) => r.last_name)).toEqual(["A"]);
    expect(previewToCommitRows(preview, { includeDuplicates: true }).map((r) => r.last_name)).toEqual(["A", "C"]);
    expect(previewToCommitRows(preview, { includeDuplicates: true, excluded: new Set([1]) }).map((r) => r.last_name)).toEqual(["C"]);
    expect(previewToCommitRows(preview, { includeDuplicates: false })[0]).toMatchObject({ class_name: "3A", birth_date: "2014-01-01", gender: null });
  });
  it("filters risk rows", () => {
    const rows = [
      { name: "Aliyev", flags: ["low_average" as const], class_name: "7A", attendance_percent: 90, average: 2.5, streak: 0 },
      { name: "Bobur", flags: ["absence_streak" as const], class_name: "9B", attendance_percent: 80, average: 4, streak: 3 },
    ];
    expect(filterRisk(rows, { grade: 7 }).length).toBe(1);
    expect(filterRisk(rows, { flag: "absence_streak" })[0].name).toBe("Bobur");
    expect(filterRisk(rows, { q: "ali", nameOf: (r) => r.name }).length).toBe(1);
  });
});

describe("director service on the demo store", () => {
  const TODAY = "2026-10-15";
  let store: DemoStore;
  beforeEach(() => {
    store = resetDemoStore(TODAY);
  });
  const ctx = (role: "school_admin" | "teacher") => {
    const s: SchoolSession = { id: `demo-${role}`, email: `${role}@demo.uz`, name: role, role, demo: true, teacherId: role === "teacher" ? store.tables.teachers[0].id : null, studentIds: [] };
    return loadCtx(s);
  };
  const code = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof SchoolError ? e.code : String(e)));

  it("is director only", async () => {
    const t = await ctx("teacher");
    expect(await code(dir.directorOverview(t))).toBe("forbidden");
    expect(await code(dir.listAudit(t, {}))).toBe("forbidden");
  });
  it("overview lists classes without attendance today (nothing is pre-marked)", async () => {
    const c = await ctx("school_admin");
    const o = await dir.directorOverview(c);
    expect(o.pending.length).toBe(c.classes.length);
    expect(o.attendanceWeek.length).toBe(c.classes.length);
    expect(o.termAverages.length).toBeGreaterThan(5);
  });
  it("attendance overview aggregates counts per class", async () => {
    const c = await ctx("school_admin");
    const o = await dir.attendanceOverview(c, "2026-10-01", "2026-10-14");
    expect(o.classes.length).toBe(c.classes.length);
    expect(o.classes.some((x) => x.total > 0)).toBe(true);
    expect(await code(dir.attendanceOverview(c, "2026-10-14", "2026-10-01"))).toBe("invalid_input");
  });
  it("status change writes audit + note, notes CRUD", async () => {
    const c = await ctx("school_admin");
    const st = store.tables.students[0];
    const row = await dir.changeStudentStatus(c, { student_id: st.id, status: "transferred", reason: "moved" });
    expect(row.status).toBe("transferred");
    const audit = await dir.listAudit(c, { resource: "students", record_id: st.id });
    expect(audit.some((a) => a.action === "status_change")).toBe(true);
    const notes = await dir.listNotes(c, st.id);
    expect(notes.some((n) => n.text.includes("moved"))).toBe(true);
    const n = await dir.addNote(c, { student_id: st.id, kind: "positive", text: "good" });
    await dir.deleteNote(c, n.id);
    expect(await code(dir.deleteNote(c, n.id))).toBe("not_found");
  });
  it("rollover previews without writing and commits into the target year", async () => {
    const c = await ctx("school_admin");
    const [y] = await c.db.insert("school_years", [{ name: "2027-2028", start_date: "2027-09-01", end_date: "2028-05-31", is_current: false, grading_rules: {} }]);
    const before = store.tables.students.filter((s) => s.class_id).map((s) => s.class_id);
    const c2 = await ctx("school_admin");
    const prev = await dir.rollover(c2, { target_year_id: y.id, commit: false });
    expect(prev.committed).toBe(false);
    expect(store.tables.students.filter((s) => s.class_id).map((s) => s.class_id)).toEqual(before);
    const done = await dir.rollover(c2, { target_year_id: y.id, commit: true });
    expect(done.moved + done.graduated).toBeGreaterThan(200);
    const target = store.tables.classes.filter((x) => x.year_id === y.id);
    expect(target.length).toBeGreaterThan(5);
    expect(store.tables.students.filter((s) => s.status === "graduated").length).toBe(done.graduated);
  });
  it("notification stats and term status", async () => {
    const c = await ctx("school_admin");
    const n = await dir.notificationStats(c);
    expect(n.total).toBeGreaterThanOrEqual(0);
    const all = await Promise.all(c.terms.map((tm) => dir.termStatus(c, tm.id)));
    expect(all[0].rows.length).toBe(c.assignments.length);
    expect(all.every((ts) => ts.rows.every((r) => r.confirmed >= 0 && r.confirmed <= r.total))).toBe(true);
  });
});
