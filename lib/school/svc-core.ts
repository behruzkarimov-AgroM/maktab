// Shared context + scoping helpers for the SIS service layer (server only).
import { getDb, type Actor, type SchoolDb } from "./db";
import { SchoolError } from "./errors";
import { absenceStreak, average2, computeRisk, countAttendance, resolveRules, type AttendanceCounts } from "./grading";
import { canViewStudent, isDirector, teacherClassIds } from "./permissions";
import type {
  AttendanceRecord, GradeEntry, GradingRules, RiskFlag, SchoolClass, SchoolSession, SchoolYear, Student, StudentListItem, Subject, Teacher, TeachingAssignment, Term,
} from "./types";

export interface Ctx {
  s: SchoolSession;
  actor: Actor;
  db: SchoolDb;
  today: string;
  years: SchoolYear[];
  /** the current school year (or the latest one); null only for an empty database */
  year: SchoolYear | null;
  terms: Term[]; // all terms of `year`
  classes: SchoolClass[]; // all classes of `year`
  assignments: TeachingAssignment[];
  subjects: Subject[];
  rules: GradingRules;
  /** classes a teacher may manage (empty for other roles) */
  classIds: Set<string>;
}

export const actorOf = (s: SchoolSession): Actor => ({ id: s.id, email: s.email, role: s.role, teacherId: s.teacherId, demo: s.demo });

export async function loadCtx(s: SchoolSession, opts: { yearId?: string } = {}): Promise<Ctx> {
  const db = await getDb();
  const years = await db.select("school_years", { order: [["start_date", "desc"]] });
  const year = (opts.yearId ? years.find((y) => y.id === opts.yearId) : years.find((y) => y.is_current)) ?? years[0] ?? null;
  const [terms, classes, assignments, subjects] = await Promise.all([
    year ? db.select("terms", { eq: { year_id: year.id }, order: [["number", "asc"]] }) : Promise.resolve([]),
    year ? db.select("classes", { eq: { year_id: year.id }, order: [["grade", "asc"], ["letter", "asc"]] }) : Promise.resolve([]),
    db.select("teaching_assignments"),
    db.select("subjects", { order: [["sort_order", "asc"]] }),
  ]);
  return {
    s, actor: actorOf(s), db, today: db.today(), years, year, terms, classes, assignments, subjects,
    rules: resolveRules(year?.grading_rules), classIds: teacherClassIds(s, classes, assignments),
  };
}

export const need = <T,>(v: T | null | undefined, code = "not_found"): T => {
  if (v === null || v === undefined) throw new SchoolError(code);
  return v;
};
export const forbid = (): never => {
  throw new SchoolError("forbidden");
};
export function requireDirector(c: Ctx): void {
  if (!isDirector(c.s)) forbid();
}

/** the term containing `date`, else the latest term started, else the first one */
export function currentTerm(c: Ctx, date = c.today): Term | null {
  return c.terms.find((t) => date >= t.start_date && date <= t.end_date)
    ?? [...c.terms].reverse().find((t) => t.start_date <= date)
    ?? c.terms[0] ?? null;
}

/** ids of classes visible to the session (director: all, teacher: managed, family: their children's classes) */
export async function visibleClassIds(c: Ctx): Promise<Set<string>> {
  if (isDirector(c.s)) return new Set(c.classes.map((x) => x.id));
  if (c.s.role === "teacher") return c.classIds;
  if (!c.s.studentIds.length) return new Set();
  const sts = await c.db.select("students", { in: { id: c.s.studentIds } });
  return new Set(sts.map((x) => x.class_id).filter((x): x is string => !!x));
}

export function assertClassManage(c: Ctx, classId: string): SchoolClass {
  const cls = need(c.classes.find((x) => x.id === classId));
  if (!isDirector(c.s) && !(c.s.role === "teacher" && c.classIds.has(classId))) forbid();
  return cls;
}

export async function assertClassView(c: Ctx, classId: string): Promise<SchoolClass> {
  const cls = need(c.classes.find((x) => x.id === classId));
  if (!(await visibleClassIds(c)).has(classId)) forbid();
  return cls;
}

/** loads a student the session may see, else forbidden / not_found */
export async function getVisibleStudent(c: Ctx, id: string): Promise<Student> {
  const [st] = await c.db.select("students", { eq: { id } });
  const student = need(st);
  if (!canViewStudent(c.s, student, c.classIds)) forbid();
  return student;
}

export async function scopedStudents(c: Ctx, f: { class_id?: string; status?: string; id?: string } = {}): Promise<Student[]> {
  const eq: Record<string, string> = {};
  if (f.class_id) eq.class_id = f.class_id;
  if (f.status) eq.status = f.status;
  if (f.id) eq.id = f.id;
  const q = { eq, order: [["last_name", "asc"], ["first_name", "asc"]] as [string, "asc" | "desc"][] };
  if (isDirector(c.s)) return c.db.select("students", q);
  if (c.s.role === "teacher") {
    const ids = [...c.classIds].filter((x) => !f.class_id || x === f.class_id);
    return ids.length ? c.db.select("students", { ...q, in: { class_id: ids } }) : [];
  }
  return c.s.studentIds.length ? c.db.select("students", { ...q, in: { id: c.s.studentIds } }) : [];
}

export const fullName = (s: Pick<Student, "first_name" | "last_name">) => `${s.last_name} ${s.first_name}`;
export const classNameOf = (c: Ctx, id: string | null) => (id ? c.classes.find((x) => x.id === id)?.name ?? null : null);

/* ------------------------------ statistics ------------------------------ */

export interface StudentStats {
  student_id: string;
  att: AttendanceCounts;
  streak: number;
  average: number | null;
  gradeCount: number;
  risk: RiskFlag[];
}

/** Year-to-date attendance + weighted average for the given students (grouped queries by class). */
export async function computeStats(c: Ctx, students: Student[]): Promise<Map<string, StudentStats>> {
  const out = new Map<string, StudentStats>();
  const classIds = [...new Set(students.map((x) => x.class_id).filter((x): x is string => !!x))];
  const ids = new Set(students.map((x) => x.id));
  if (!c.year || !classIds.length) {
    for (const st of students) out.set(st.id, emptyStats(c, st.id));
    return out;
  }
  const [att, grades] = await Promise.all([
    c.db.select("attendance", { in: { class_id: classIds }, gte: { date: c.year.start_date }, lte: { date: c.today } }),
    c.db.select("grade_entries", { in: { class_id: classIds, term_id: c.terms.map((t) => t.id) } }),
  ]);
  const attBy = new Map<string, AttendanceRecord[]>();
  for (const a of att) if (ids.has(a.student_id)) (attBy.get(a.student_id) ?? attBy.set(a.student_id, []).get(a.student_id)!).push(a);
  const grBy = new Map<string, GradeEntry[]>();
  for (const g of grades) if (ids.has(g.student_id)) (grBy.get(g.student_id) ?? grBy.set(g.student_id, []).get(g.student_id)!).push(g);
  for (const st of students) {
    const a = attBy.get(st.id) ?? [];
    const g = grBy.get(st.id) ?? [];
    const counts = countAttendance(a);
    const streak = absenceStreak(a);
    const average = average2(g, c.rules);
    const gradeCount = g.filter((x) => !c.rules.excludeKinds.includes(x.kind)).length;
    out.set(st.id, {
      student_id: st.id, att: counts, streak, average, gradeCount,
      risk: computeRisk({ attendancePercent: counts.percent, attendanceTotal: counts.total, average, gradeCount, streak }, c.rules),
    });
  }
  return out;
}

function emptyStats(c: Ctx, id: string): StudentStats {
  return { student_id: id, att: countAttendance([]), streak: 0, average: null, gradeCount: 0, risk: [] };
}

export function toListItem(c: Ctx, st: Student, stats?: StudentStats): StudentListItem {
  const item: StudentListItem = { ...st, class_name: classNameOf(c, st.class_id) };
  if (stats) {
    item.attendance_percent = stats.att.percent;
    item.average = stats.average;
    item.risk = stats.risk;
  }
  return item;
}

export const teacherName = (teachers: Teacher[], id: string | null) => (id ? teachers.find((t) => t.id === id)?.full_name ?? null : null);
