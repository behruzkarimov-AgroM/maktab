// Role / ownership rules for the school portal. Pure functions (client-safe); the SQL RLS in supabase/schema.sql mirrors them.
import type { SchoolClass, SchoolRole, SchoolSession, Student, TeachingAssignment } from "./types";
import { DIRECTOR_ROLES } from "./types";

export type Scope = "all" | "own_classes" | "own_subject_classes" | "own_children" | "self" | "own" | "none";
export type Resource =
  | "years_terms" | "classes" | "subjects" | "teachers" | "assignments" | "students" | "guardians" | "schedule" | "lessons"
  | "attendance" | "grades" | "term_grades" | "announcements" | "notifications" | "reports" | "import" | "accounts" | "dashboard" | "behavior";

interface Rule {
  read: Partial<Record<SchoolRole, Scope>>;
  write: Partial<Record<SchoolRole, Scope>>;
}
const D: Partial<Record<SchoolRole, Scope>> = { super_admin: "all", school_admin: "all" };
const FAMILY_READ: Partial<Record<SchoolRole, Scope>> = { parent: "own_children", student: "self" };

/**
 * The permission matrix (documented in docs/SIS.md). `read`/`write` map a role to the visible/editable scope.
 * A role that is absent has no access.
 */
export const MATRIX: Record<Resource, Rule> = {
  years_terms: { read: { ...D, teacher: "all", parent: "all", student: "all" }, write: { ...D } },
  classes: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D } },
  subjects: { read: { ...D, teacher: "all", parent: "all", student: "all" }, write: { ...D } },
  teachers: { read: { ...D, teacher: "own" }, write: { ...D } },
  assignments: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D } },
  students: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D } },
  guardians: { read: { ...D, teacher: "own_classes", parent: "own_children" }, write: { ...D } },
  schedule: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D } },
  lessons: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D, teacher: "own_subject_classes" } },
  attendance: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D, teacher: "own_classes" } },
  grades: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D, teacher: "own_subject_classes" } },
  term_grades: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D, teacher: "own_subject_classes" } },
  announcements: { read: { ...D, teacher: "all", parent: "all", student: "all" }, write: { ...D, teacher: "own_classes" } },
  notifications: { read: { ...D, teacher: "own", parent: "own", student: "own" }, write: { ...D, teacher: "own", parent: "own", student: "own" } },
  reports: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: {} },
  import: { read: { ...D }, write: { ...D } },
  accounts: { read: { ...D }, write: { ...D } },
  dashboard: { read: { ...D, teacher: "own", parent: "own", student: "own" }, write: {} },
  behavior: { read: { ...D, teacher: "own_classes", ...FAMILY_READ }, write: { ...D, teacher: "own_classes" } },
};

export const isDirector = (s: Pick<SchoolSession, "role">): boolean => DIRECTOR_ROLES.includes(s.role);

export function scopeOf(role: SchoolRole, resource: Resource, mode: "read" | "write"): Scope {
  return MATRIX[resource][mode][role] ?? "none";
}
export const can = (role: SchoolRole, resource: Resource, mode: "read" | "write"): boolean => scopeOf(role, resource, mode) !== "none";

/** Class ids a teacher may manage: classes where they teach any subject + their homeroom classes. */
export function teacherClassIds(s: Pick<SchoolSession, "teacherId">, classes: Pick<SchoolClass, "id" | "homeroom_teacher_id">[], assignments: Pick<TeachingAssignment, "class_id" | "teacher_id">[]): Set<string> {
  const out = new Set<string>();
  if (!s.teacherId) return out;
  for (const a of assignments) if (a.teacher_id === s.teacherId) out.add(a.class_id);
  for (const c of classes) if (c.homeroom_teacher_id === s.teacherId) out.add(c.id);
  return out;
}

export function teachesSubjectInClass(s: Pick<SchoolSession, "teacherId">, assignments: Pick<TeachingAssignment, "class_id" | "subject_id" | "teacher_id">[], classId: string, subjectId: string): boolean {
  return !!s.teacherId && assignments.some((a) => a.class_id === classId && a.subject_id === subjectId && a.teacher_id === s.teacherId);
}

/** attendance marking / class-level management: directors, or teachers who teach (or are homeroom of) the class. */
export function canManageClass(s: SchoolSession, classId: string, classIds: Set<string>): boolean {
  return isDirector(s) || (s.role === "teacher" && classIds.has(classId));
}

/** grade writing: directors, or the teacher assigned to this subject in this class. */
export function canGradeSubjectInClass(s: SchoolSession, assignments: Pick<TeachingAssignment, "class_id" | "subject_id" | "teacher_id">[], classId: string, subjectId: string): boolean {
  return isDirector(s) || (s.role === "teacher" && teachesSubjectInClass(s, assignments, classId, subjectId));
}

/** whether the session may see a student's record */
export function canViewStudent(s: SchoolSession, student: Pick<Student, "id" | "class_id">, classIds: Set<string>): boolean {
  if (isDirector(s)) return true;
  if (s.role === "teacher") return !!student.class_id && classIds.has(student.class_id);
  return s.studentIds.includes(student.id);
}

/** Teachers may edit attendance of past days only inside this window (directors: unlimited). Mirrors the SQL RPC. */
export const TEACHER_EDIT_WINDOW_DAYS = 14;
export function withinEditWindow(s: Pick<SchoolSession, "role">, date: string, today: string): boolean {
  if (isDirector(s)) return true;
  const diff = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
  return diff <= TEACHER_EDIT_WINDOW_DAYS;
}

/** which announcements a role may see; mirrors SQL announcement_visible() */
export function announcementVisible(
  s: SchoolSession,
  a: { audience: string; class_id: string | null; publish_at: string },
  now: Date,
  visibleClassIds: Set<string>,
): boolean {
  if (isDirector(s)) return true;
  if (Date.parse(a.publish_at) > now.getTime()) return false;
  switch (a.audience) {
    case "all": return true;
    case "teachers": return s.role === "teacher";
    case "parents": return s.role === "parent";
    case "students": return s.role === "student";
    case "class": return !!a.class_id && visibleClassIds.has(a.class_id);
    default: return false;
  }
}
