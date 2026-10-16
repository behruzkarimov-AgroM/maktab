// Service functions: attendance (class/day sheet, bulk marking, history, summaries).
import { SchoolError } from "./errors";
import { absenceStreak, countAttendance, dayStatuses } from "./grading";
import { withinEditWindow } from "./permissions";
import { assertClassManage, assertClassView, getVisibleStudent, scopedStudents, forbid, fullName, type Ctx } from "./svc-core";
import { prefsFor } from "./svc-prefs";
import type { AttendanceDay, AttendanceRecord, AttendanceSummaryRow } from "./types";
import { isValidDate } from "./grading";

/** Roster of a class for one day (or lesson) with the recorded status of each student. Teachers/directors only. */
export async function getAttendanceDay(c: Ctx, classId: string, date: string, lessonNo: number | null = null): Promise<AttendanceDay> {
  assertClassManage(c, classId);
  if (!isValidDate(date)) throw new SchoolError("invalid_date");
  const [students, rows] = await Promise.all([
    scopedStudents(c, { class_id: classId, status: "active" }),
    c.db.select("attendance", { eq: { class_id: classId, date } }),
  ]);
  const mine = rows.filter((r) => (r.lesson_no ?? null) === lessonNo);
  return {
    class_id: classId,
    date,
    lesson_no: lessonNo,
    locked_for_you: date > c.today || !withinEditWindow(c.s, date, c.today),
    rows: students.map((s) => {
      const r = mine.find((x) => x.student_id === s.id);
      return {
        student_id: s.id, last_name: s.last_name, first_name: s.first_name, status: r?.status ?? null, minutes_late: r?.minutes_late ?? 0,
        note: r?.note ?? null, marked_at: r?.marked_at ?? null,
      };
    }),
  };
}

export interface MarkResult {
  saved: number;
  /** students whose status changed to `absent` with this call (for the Telegram hook / notifications) */
  newly_absent: { student_id: string; class_id: string; date: string }[];
}

export async function markAttendance(
  c: Ctx,
  input: { class_id: string; date: string; lesson_no: number | null; records: { student_id: string; status: string; minutes_late?: number; note?: string | null }[] },
): Promise<MarkResult> {
  assertClassManage(c, input.class_id);
  const before = await c.db.select("attendance", { eq: { class_id: input.class_id, date: input.date } });
  const res = await c.db.markAttendanceBulk(c.actor, input);
  const newly = input.records
    .filter((r) => r.status === "absent")
    .filter((r) => !before.some((b) => b.student_id === r.student_id && (b.lesson_no ?? 0) === (input.lesson_no ?? 0) && b.status === "absent"))
    .map((r) => ({ student_id: r.student_id, class_id: input.class_id, date: input.date }));
  if (newly.length) await createAbsenceNotifications(c, newly);
  return { saved: res.saved, newly_absent: newly };
}

/** in-app notifications for guardians that have an account */
async function createAbsenceNotifications(c: Ctx, items: { student_id: string; date: string }[]): Promise<void> {
  try {
    const links = await c.db.select("student_guardians", { in: { student_id: items.map((i) => i.student_id) } });
    if (!links.length) return;
    const guardians = await c.db.select("guardians", { in: { id: [...new Set(links.map((l) => l.guardian_id))] } });
    const students = await c.db.select("students", { in: { id: items.map((i) => i.student_id) } });
    // a guardian who switched absence notices off (school_notification_prefs.absence) gets no in-app notice either
    const prefs = await prefsFor(c.db, guardians.map((g) => g.user_id).filter((u): u is string => !!u));
    const rows = items.flatMap((it) => {
      const st = students.find((s) => s.id === it.student_id);
      return links
        .filter((l) => l.student_id === it.student_id)
        .map((l) => guardians.find((g) => g.id === l.guardian_id))
        .filter((g): g is NonNullable<typeof g> => !!g?.user_id && prefs.get(g.user_id)?.absence !== false)
        .map((g) => ({ user_id: g.user_id as string, type: "absence", payload: { student_id: it.student_id, student_name: st ? fullName(st) : "", date: it.date } }));
    });
    if (rows.length) await c.db.insert("notifications", rows);
  } catch {
    // notifications are best-effort and must never fail the attendance write
  }
}

/** Attendance history of one student (any role that can see the student). */
export async function studentAttendance(c: Ctx, studentId: string, from?: string, to?: string) {
  await getVisibleStudent(c, studentId);
  const start = from ?? c.year?.start_date ?? "1970-01-01";
  const end = to ?? c.today;
  const rows = await c.db.select("attendance", { eq: { student_id: studentId }, gte: { date: start }, lte: { date: end }, order: [["date", "desc"]] });
  const asc = [...rows].reverse();
  return {
    student_id: studentId, from: start, to: end, rows,
    summary: { ...countAttendance(rows), streak: absenceStreak(asc) },
    days: dayStatuses(asc),
  };
}

/** Per-student totals for a class and period (director / teacher of the class / family of a pupil in the class). */
export async function attendanceSummary(c: Ctx, classId: string, from?: string, to?: string) {
  await assertClassView(c, classId);
  const start = from ?? c.year?.start_date ?? "1970-01-01";
  const end = to ?? c.today;
  if (end < start) throw new SchoolError("invalid_input");
  const students = await scopedStudents(c, { class_id: classId, status: "active" });
  const rows = await c.db.select("attendance", { eq: { class_id: classId }, gte: { date: start }, lte: { date: end } });
  const out: AttendanceSummaryRow[] = students.map((s) => {
    const mine = rows.filter((r) => r.student_id === s.id);
    const k = countAttendance(mine);
    return { student_id: s.id, last_name: s.last_name, first_name: s.first_name, present: k.present, absent: k.absent, late: k.late, excused: k.excused, sick: k.sick, total: k.total, percent: k.percent, streak: absenceStreak(mine) };
  });
  const all = countAttendance(rows.filter((r) => students.some((s) => s.id === r.student_id)));
  return { class_id: classId, from: start, to: end, rows: out, totals: all };
}

/** Class sheet: dates x students matrix for a period (max 62 days) - used by the printable attendance sheet. */
export async function attendanceSheet(c: Ctx, classId: string, from: string, to: string) {
  assertClassManage(c, classId);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 62) throw new SchoolError("invalid_input");
  const students = await scopedStudents(c, { class_id: classId, status: "active" });
  const rows: AttendanceRecord[] = await c.db.select("attendance", { eq: { class_id: classId }, gte: { date: from }, lte: { date: to } });
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  return {
    class_id: classId, from, to, dates,
    students: students.map((s) => ({
      student_id: s.id, last_name: s.last_name, first_name: s.first_name,
      cells: dates.map((d) => rows.find((r) => r.student_id === s.id && r.date === d && r.lesson_no === null)?.status ?? null),
    })),
  };
}

export const assertCanReadAttendanceOf = async (c: Ctx, studentId: string) => {
  const st = await getVisibleStudent(c, studentId);
  if (!st) forbid();
  return st;
};
