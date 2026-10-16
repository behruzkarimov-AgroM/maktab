// Service functions: years/terms, classes, subjects, teachers, assignments, students, guardians, schedule, lessons.
import { SchoolError } from "./errors";
import { canGradeSubjectInClass, isDirector } from "./permissions";
import {
  assertClassView, classNameOf, computeStats, need, requireDirector, scopedStudents, toListItem, visibleClassIds, forbid, getVisibleStudent, type Ctx,
} from "./svc-core";
import type {
  Guardian, Lesson, ScheduleSlot, SchoolClass, SchoolYear, Student, StudentDetail, StudentListItem, Subject, Teacher, TeachingAssignment, Term,
} from "./types";

/* ------------------------------ years & terms ------------------------------ */
export async function listYearsTerms(c: Ctx) {
  const terms = await c.db.select("terms", { order: [["start_date", "asc"]] });
  return { years: c.years, terms, current_year_id: c.year?.id ?? null };
}
export async function saveYear(c: Ctx, input: Omit<SchoolYear, "id" | "is_current"> & { is_current?: boolean }, id?: string): Promise<SchoolYear> {
  requireDirector(c);
  if (input.end_date <= input.start_date) throw new SchoolError("invalid_input");
  if (input.is_current) await c.db.update("school_years", { eq: { is_current: true } }, { is_current: false });
  const row = id
    ? need((await c.db.update("school_years", { eq: { id } }, input))[0])
    : (await c.db.insert("school_years", [{ ...input, is_current: input.is_current ?? false }]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "school_years", row.id, { name: row.name });
  return row;
}
export async function saveTerm(c: Ctx, input: Omit<Term, "id" | "is_locked">, id?: string): Promise<Term> {
  requireDirector(c);
  if (input.end_date <= input.start_date) throw new SchoolError("invalid_input");
  const row = id
    ? need((await c.db.update("terms", { eq: { id } }, input))[0])
    : (await c.db.insert("terms", [{ ...input, is_locked: false }]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "terms", row.id, { number: row.number });
  return row;
}
export async function lockTerm(c: Ctx, termId: string, locked: boolean) {
  requireDirector(c);
  return c.db.lockTerm(c.actor, termId, locked);
}

/* ------------------------------ classes ------------------------------ */
export async function listClasses(c: Ctx) {
  const vis = await visibleClassIds(c);
  const students = isDirector(c.s) ? await c.db.select("students", { eq: { status: "active" } }) : [];
  const teachers = await c.db.select("teachers");
  const count = new Map<string, number>();
  for (const s of students) if (s.class_id) count.set(s.class_id, (count.get(s.class_id) ?? 0) + 1);
  return c.classes
    .filter((x) => vis.has(x.id))
    .map((x) => ({
      ...x,
      student_count: isDirector(c.s) ? count.get(x.id) ?? 0 : undefined,
      homeroom_teacher_name: teachers.find((t) => t.id === x.homeroom_teacher_id)?.full_name ?? null,
    }));
}
export async function saveClass(c: Ctx, input: { year_id?: string; grade: number; letter: string; homeroom_teacher_id?: string | null; room?: string | null }, id?: string): Promise<SchoolClass> {
  requireDirector(c);
  const letter = input.letter.trim().toUpperCase();
  const patch = { ...input, letter, name: `${input.grade}${letter}`, year_id: input.year_id ?? c.year?.id };
  if (!patch.year_id) throw new SchoolError("invalid_input");
  const row = id ? need((await c.db.update("classes", { eq: { id } }, patch))[0]) : (await c.db.insert("classes", [patch]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "classes", row.id, { name: row.name });
  return row;
}
export async function deleteClass(c: Ctx, id: string): Promise<void> {
  requireDirector(c);
  need((await c.db.select("classes", { eq: { id } }))[0]);
  await c.db.remove("classes", { eq: { id } });
  await c.db.audit(c.actor, "delete", "classes", id);
}

/* ------------------------------ subjects ------------------------------ */
export const listSubjects = (c: Ctx): Subject[] => c.subjects;
export async function saveSubject(c: Ctx, input: Omit<Subject, "id">, id?: string): Promise<Subject> {
  requireDirector(c);
  const row = id ? need((await c.db.update("subjects", { eq: { id } }, input))[0]) : (await c.db.insert("subjects", [input]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "subjects", row.id, { short: row.short });
  return row;
}
export async function deleteSubject(c: Ctx, id: string): Promise<void> {
  requireDirector(c);
  if (!(await c.db.remove("subjects", { eq: { id } }))) throw new SchoolError("not_found");
  await c.db.audit(c.actor, "delete", "subjects", id);
}

/* ------------------------------ teachers ------------------------------ */
export async function listTeachers(c: Ctx) {
  const all = await c.db.select("teachers", { order: [["full_name", "asc"]] });
  const list = isDirector(c.s) ? all : all.filter((t) => t.id === c.s.teacherId);
  return list.map((t) => ({
    ...t,
    classes: [...new Set(c.assignments.filter((a) => a.teacher_id === t.id).map((a) => classNameOf(c, a.class_id)).filter(Boolean))] as string[],
    homeroom_of: c.classes.filter((x) => x.homeroom_teacher_id === t.id).map((x) => x.name),
    hours_per_week: c.assignments.filter((a) => a.teacher_id === t.id).reduce((n, a) => n + a.hours_per_week, 0),
  }));
}
export async function saveTeacher(c: Ctx, input: Partial<Omit<Teacher, "id" | "user_id">> & { full_name: string }, id?: string): Promise<Teacher> {
  requireDirector(c);
  const row = id ? need((await c.db.update("teachers", { eq: { id } }, input))[0]) : (await c.db.insert("teachers", [input]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "teachers", row.id, { full_name: row.full_name });
  return row;
}
export async function deleteTeacher(c: Ctx, id: string): Promise<void> {
  requireDirector(c);
  if (!(await c.db.remove("teachers", { eq: { id } }))) throw new SchoolError("not_found");
  await c.db.audit(c.actor, "delete", "teachers", id);
}

/* ------------------------------ assignments ------------------------------ */
export async function listAssignments(c: Ctx, f: { class_id?: string; teacher_id?: string } = {}): Promise<TeachingAssignment[]> {
  const vis = await visibleClassIds(c);
  return c.assignments.filter((a) => vis.has(a.class_id) && (!f.class_id || a.class_id === f.class_id) && (!f.teacher_id || a.teacher_id === f.teacher_id));
}
export async function saveAssignment(c: Ctx, input: Omit<TeachingAssignment, "id">, id?: string): Promise<TeachingAssignment> {
  requireDirector(c);
  need(c.classes.find((x) => x.id === input.class_id));
  need(c.subjects.find((x) => x.id === input.subject_id));
  need((await c.db.select("teachers", { eq: { id: input.teacher_id } }))[0]);
  const row = id ? need((await c.db.update("teaching_assignments", { eq: { id } }, input))[0]) : (await c.db.insert("teaching_assignments", [input]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "teaching_assignments", row.id, { class_id: row.class_id, subject_id: row.subject_id, teacher_id: row.teacher_id });
  return row;
}
export async function deleteAssignment(c: Ctx, id: string): Promise<void> {
  requireDirector(c);
  if (!(await c.db.remove("teaching_assignments", { eq: { id } }))) throw new SchoolError("not_found");
  await c.db.audit(c.actor, "delete", "teaching_assignments", id);
}

/* ------------------------------ students ------------------------------ */
export async function listStudents(c: Ctx, f: { class_id?: string; status?: string; q?: string; with_stats?: boolean; limit?: number; offset?: number } = {}) {
  if (f.class_id) await assertClassView(c, f.class_id);
  let list = await scopedStudents(c, { class_id: f.class_id, status: f.status });
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((s) => `${s.last_name} ${s.first_name} ${s.middle_name ?? ""} ${s.student_code}`.toLowerCase().includes(q));
  }
  const total = list.length;
  list = list.slice(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? 500));
  const stats = f.with_stats ? await computeStats(c, list) : null;
  return { total, students: list.map((s): StudentListItem => toListItem(c, s, stats?.get(s.id))) };
}

export async function getStudent(c: Ctx, id: string): Promise<StudentDetail> {
  const st = await getVisibleStudent(c, id);
  const stats = (await computeStats(c, [st])).get(st.id);
  const detail: StudentDetail = { ...toListItem(c, st, stats), guardians: [] };
  if (c.s.role !== "student") {
    const links = await c.db.select("student_guardians", { eq: { student_id: id } });
    const gs = links.length ? await c.db.select("guardians", { in: { id: links.map((l) => l.guardian_id) } }) : [];
    detail.guardians = gs.map((g) => ({ ...g, is_primary: links.find((l) => l.guardian_id === g.id)?.is_primary ?? false }));
    // the Telegram chat id is a delivery address for the school only: directors see it, nobody else does
    if (!isDirector(c.s)) for (const g of detail.guardians) g.telegram_chat_id = null;
  }
  return detail;
}

async function nextStudentCode(c: Ctx): Promise<string> {
  const y = c.year ? c.year.start_date.slice(0, 4) : String(new Date().getUTCFullYear());
  const all = await c.db.select("students");
  const prefix = `ST-${y}-`;
  let max = 0;
  for (const s of all) if (s.student_code.startsWith(prefix)) max = Math.max(max, Number(s.student_code.slice(prefix.length)) || 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function saveStudent(c: Ctx, input: Partial<Omit<Student, "id" | "user_id">>, id?: string): Promise<Student> {
  requireDirector(c);
  if (input.class_id) need(c.classes.find((x) => x.id === input.class_id));
  const row = id
    ? need((await c.db.update("students", { eq: { id } }, input))[0])
    : (await c.db.insert("students", [{ ...input, student_code: input.student_code ?? (await nextStudentCode(c)), enrolled_at: input.enrolled_at ?? c.today }]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "students", row.id, { student_code: row.student_code, class_id: row.class_id, status: row.status });
  return row;
}
export async function deleteStudent(c: Ctx, id: string): Promise<void> {
  requireDirector(c);
  if (!(await c.db.remove("students", { eq: { id } }))) throw new SchoolError("not_found");
  await c.db.audit(c.actor, "delete", "students", id);
}

/* ------------------------------ guardians ------------------------------ */
export async function listGuardians(c: Ctx, f: { student_id?: string } = {}) {
  if (f.student_id) {
    await getVisibleStudent(c, f.student_id);
    if (c.s.role === "student") forbid();
  } else if (!isDirector(c.s)) forbid();
  const links = await c.db.select("student_guardians", f.student_id ? { eq: { student_id: f.student_id } } : undefined);
  const gs = f.student_id
    ? links.length ? await c.db.select("guardians", { in: { id: links.map((l) => l.guardian_id) } }) : []
    : await c.db.select("guardians", { order: [["full_name", "asc"]] });
  return gs.map((g) => ({
    ...g,
    telegram_chat_id: isDirector(c.s) ? g.telegram_chat_id : null,
    student_ids: links.filter((l) => l.guardian_id === g.id).map((l) => l.student_id),
  }));
}
export async function saveGuardian(c: Ctx, input: Partial<Omit<Guardian, "id" | "user_id">> & { student_id?: string; is_primary?: boolean }, id?: string): Promise<Guardian> {
  requireDirector(c);
  const { student_id, is_primary, ...patch } = input;
  const row = id ? need((await c.db.update("guardians", { eq: { id } }, patch))[0]) : (await c.db.insert("guardians", [patch as Partial<Guardian>]))[0];
  if (student_id) {
    need((await c.db.select("students", { eq: { id: student_id } }))[0]);
    await c.db.upsert("student_guardians", [{ student_id, guardian_id: row.id, is_primary: is_primary ?? false }], ["student_id", "guardian_id"]);
  }
  await c.db.audit(c.actor, id ? "update" : "create", "guardians", row.id, { full_name: row.full_name });
  return row;
}
export async function deleteGuardian(c: Ctx, id: string): Promise<void> {
  requireDirector(c);
  if (!(await c.db.remove("guardians", { eq: { id } }))) throw new SchoolError("not_found");
  await c.db.audit(c.actor, "delete", "guardians", id);
}
export async function linkGuardian(c: Ctx, input: { student_id: string; guardian_id: string; is_primary: boolean }): Promise<void> {
  requireDirector(c);
  need((await c.db.select("students", { eq: { id: input.student_id } }))[0]);
  need((await c.db.select("guardians", { eq: { id: input.guardian_id } }))[0]);
  await c.db.upsert("student_guardians", [input], ["student_id", "guardian_id"]);
  await c.db.audit(c.actor, "link", "student_guardians", input.student_id, { guardian_id: input.guardian_id });
}
export async function unlinkGuardian(c: Ctx, studentId: string, guardianId: string): Promise<void> {
  requireDirector(c);
  await c.db.remove("student_guardians", { eq: { student_id: studentId, guardian_id: guardianId } });
  await c.db.audit(c.actor, "unlink", "student_guardians", studentId, { guardian_id: guardianId });
}

/* ------------------------------ schedule ------------------------------ */
export async function listSchedule(c: Ctx, f: { class_id?: string; teacher_id?: string } = {}) {
  const vis = await visibleClassIds(c);
  let slots: ScheduleSlot[];
  if (f.class_id) {
    await assertClassView(c, f.class_id);
    slots = await c.db.select("schedule_slots", { eq: { class_id: f.class_id } });
  } else if (f.teacher_id) {
    if (!isDirector(c.s) && f.teacher_id !== c.s.teacherId) forbid();
    slots = await c.db.select("schedule_slots", { eq: { teacher_id: f.teacher_id } });
  } else if (isDirector(c.s)) slots = await c.db.select("schedule_slots");
  else if (c.s.role === "teacher") slots = c.s.teacherId ? await c.db.select("schedule_slots", { eq: { teacher_id: c.s.teacherId } }) : [];
  else slots = vis.size ? await c.db.select("schedule_slots", { in: { class_id: [...vis] } }) : [];
  return slots
    .map((x) => ({ ...x, class_name: classNameOf(c, x.class_id) }))
    .sort((a, b) => a.weekday - b.weekday || a.lesson_no - b.lesson_no);
}
export async function saveSlot(c: Ctx, input: Omit<ScheduleSlot, "id">, id?: string): Promise<ScheduleSlot> {
  requireDirector(c);
  if (input.end_time <= input.start_time) throw new SchoolError("invalid_input");
  need(c.classes.find((x) => x.id === input.class_id));
  need(c.subjects.find((x) => x.id === input.subject_id));
  if (input.teacher_id) {
    const clash = await c.db.select("schedule_slots", { eq: { teacher_id: input.teacher_id, weekday: input.weekday, lesson_no: input.lesson_no } });
    if (clash.some((x) => x.id !== id)) throw new SchoolError("conflict", 409, "teacher busy");
  }
  // a room hosts one class at a time (also enforced by the unique index schedule_slots_room_uq)
  const room = input.room?.trim();
  if (room) {
    const sameCell = await c.db.select("schedule_slots", { eq: { weekday: input.weekday, lesson_no: input.lesson_no } });
    if (sameCell.some((x) => x.id !== id && (x.room ?? "").trim().toLowerCase() === room.toLowerCase())) throw new SchoolError("room_busy", 409);
  }
  const row = id ? need((await c.db.update("schedule_slots", { eq: { id } }, input))[0]) : (await c.db.insert("schedule_slots", [input]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "schedule_slots", row.id, { class_id: row.class_id, weekday: row.weekday, lesson_no: row.lesson_no });
  return row;
}
export async function deleteSlot(c: Ctx, id: string): Promise<void> {
  requireDirector(c);
  if (!(await c.db.remove("schedule_slots", { eq: { id } }))) throw new SchoolError("not_found");
  await c.db.audit(c.actor, "delete", "schedule_slots", id);
}

/* ------------------------------ lessons ------------------------------ */
export async function listLessons(c: Ctx, f: { class_id: string; from?: string; to?: string }): Promise<Lesson[]> {
  await assertClassView(c, f.class_id);
  const q = { eq: { class_id: f.class_id }, gte: f.from ? { date: f.from } : undefined, lte: f.to ? { date: f.to } : undefined, order: [["date", "asc"], ["lesson_no", "asc"]] as [string, "asc"][] };
  return c.db.select("lessons", q);
}
export async function saveLesson(c: Ctx, input: { class_id: string; subject_id: string; date: string; lesson_no: number; topic?: string | null; homework?: string | null }): Promise<Lesson> {
  need(c.classes.find((x) => x.id === input.class_id));
  if (!canGradeSubjectInClass(c.s, c.assignments, input.class_id, input.subject_id)) forbid();
  if (input.date > c.today) throw new SchoolError("invalid_date");
  // a locked term freezes lesson records for teachers too (directors may still correct them)
  const lockedTerm = c.terms.find((t) => input.date >= t.start_date && input.date <= t.end_date);
  if (lockedTerm?.is_locked && !isDirector(c.s)) throw new SchoolError("term_locked");
  const slot = (await c.db.select("schedule_slots", { eq: { class_id: input.class_id, lesson_no: input.lesson_no } })).find((x) => x.subject_id === input.subject_id) ?? null;
  const teacher_id = c.s.teacherId ?? c.assignments.find((a) => a.class_id === input.class_id && a.subject_id === input.subject_id)?.teacher_id ?? null;
  const [existing] = await c.db.select("lessons", { eq: { class_id: input.class_id, date: input.date, lesson_no: input.lesson_no } });
  if (existing && existing.subject_id !== input.subject_id) throw new SchoolError("conflict", 409);
  const row = existing
    ? need((await c.db.update("lessons", { eq: { id: existing.id } }, { topic: input.topic ?? null, homework: input.homework ?? null }))[0])
    : (await c.db.insert("lessons", [{ ...input, topic: input.topic ?? null, homework: input.homework ?? null, slot_id: slot?.id ?? null, teacher_id }]))[0];
  await c.db.audit(c.actor, existing ? "update" : "create", "lessons", row.id, { date: row.date, lesson_no: row.lesson_no });
  return row;
}
