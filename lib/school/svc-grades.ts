// Service functions: grade entries, gradebook matrix, term grades.
import { SchoolError } from "./errors";
import { average2, suggestTermGrade } from "./grading";
import { canGradeSubjectInClass, isDirector } from "./permissions";
import { assertClassManage, assertClassView, fullName, getVisibleStudent, need, scopedStudents, type Ctx } from "./svc-core";
import { prefsFor } from "./svc-prefs";
import type { Gradebook, GradeEntry, GradeKind, TermGrade } from "./types";

function termOf(c: Ctx, termId: string) {
  return need(c.terms.find((t) => t.id === termId));
}

/** Matrix of one class + subject + term: every active student with all entries, average, suggestion and confirmed term grade. */
export async function gradebook(c: Ctx, classId: string, subjectId: string, termId: string): Promise<Gradebook> {
  assertClassManage(c, classId);
  need(c.subjects.find((s) => s.id === subjectId));
  const term = termOf(c, termId);
  const [students, entries, termGrades] = await Promise.all([
    scopedStudents(c, { class_id: classId, status: "active" }),
    c.db.select("grade_entries", { eq: { class_id: classId, subject_id: subjectId, term_id: termId }, order: [["date", "asc"], ["created_at", "asc"]] }),
    c.db.select("term_grades", { eq: { class_id: classId, subject_id: subjectId, term_id: termId } }),
  ]);
  const rows = students.map((s) => {
    const mine = entries.filter((e) => e.student_id === s.id);
    const sug = suggestTermGrade(mine, c.rules);
    return {
      student_id: s.id, last_name: s.last_name, first_name: s.first_name, entries: mine, average: average2(mine, c.rules),
      suggested: sug?.grade ?? null, term_grade: termGrades.find((t) => t.student_id === s.id) ?? null,
    };
  });
  const avgs = rows.map((r) => r.average).filter((x): x is number => x !== null);
  return {
    class_id: classId, subject_id: subjectId, term_id: termId, term_locked: term.is_locked,
    can_edit: canGradeSubjectInClass(c.s, c.assignments, classId, subjectId) && (!term.is_locked || isDirector(c.s)),
    rows, class_average: avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100 : null,
  };
}

export async function listGrades(c: Ctx, f: { student_id?: string; class_id?: string; subject_id?: string; term_id?: string }): Promise<GradeEntry[]> {
  if (!f.student_id && !f.class_id) throw new SchoolError("invalid_input");
  const eq: Record<string, string> = {};
  if (f.subject_id) eq.subject_id = f.subject_id;
  if (f.term_id) eq.term_id = f.term_id;
  if (f.student_id) {
    await getVisibleStudent(c, f.student_id);
    eq.student_id = f.student_id;
  } else {
    await assertClassView(c, f.class_id!);
    eq.class_id = f.class_id!;
  }
  const rows = await c.db.select("grade_entries", { eq, order: [["date", "asc"]] });
  return !f.student_id && (c.s.role === "parent" || c.s.role === "student") ? rows.filter((r) => c.s.studentIds.includes(r.student_id)) : rows;
}

export interface SaveGradesInput {
  class_id: string;
  subject_id: string;
  term_id: string;
  entries: { id?: string; delete?: boolean; student_id?: string; date?: string; kind?: GradeKind; score?: number; weight?: number; comment?: string | null }[];
}
/** a new grade at or below this value triggers the (opt-out) low-grade notice to the guardians */
export const LOW_GRADE_MAX = 2;

export interface NewLowGrade {
  student_id: string;
  subject_id: string;
  score: number;
  date: string;
}

export async function saveGrades(c: Ctx, input: SaveGradesInput) {
  need(c.classes.find((x) => x.id === input.class_id));
  if (!canGradeSubjectInClass(c.s, c.assignments, input.class_id, input.subject_id)) throw new SchoolError("forbidden");
  const entries = input.entries.map((e) => ({ ...e, weight: e.weight ?? c.rules.defaultWeights[e.kind ?? "daily"] }));
  const res = await c.db.saveGradesBulk(c.actor, { ...input, entries });
  // only NEW entries (no id) with a low score are announced; edits and deletions never re-notify
  const newly_low: NewLowGrade[] = entries
    .filter((e) => !e.id && !e.delete && e.student_id && typeof e.score === "number" && e.score <= LOW_GRADE_MAX)
    .map((e) => ({ student_id: e.student_id!, subject_id: input.subject_id, score: e.score!, date: e.date ?? c.today }));
  if (newly_low.length) await createLowGradeNotifications(c, newly_low);
  return { ...res, newly_low };
}

/** in-app notices for guardians that have an account and did not switch low-grade notices off (best effort, never fails the save) */
async function createLowGradeNotifications(c: Ctx, items: NewLowGrade[]): Promise<void> {
  try {
    const ids = [...new Set(items.map((i) => i.student_id))];
    const links = await c.db.select("student_guardians", { in: { student_id: ids } });
    if (!links.length) return;
    const guardians = await c.db.select("guardians", { in: { id: [...new Set(links.map((l) => l.guardian_id))] } });
    const students = await c.db.select("students", { in: { id: ids } });
    const prefs = await prefsFor(c.db, guardians.map((g) => g.user_id).filter((u): u is string => !!u));
    const rows = items.flatMap((it) => {
      const st = students.find((s) => s.id === it.student_id);
      return links
        .filter((l) => l.student_id === it.student_id)
        .map((l) => guardians.find((g) => g.id === l.guardian_id))
        .filter((g): g is NonNullable<typeof g> => !!g?.user_id && prefs.get(g.user_id)?.low_grade !== false)
        .map((g) => ({ user_id: g.user_id as string, type: "low_grade", payload: { student_id: it.student_id, student_name: st ? fullName(st) : "", subject_id: it.subject_id, score: it.score, date: it.date } }));
    });
    if (rows.length) await c.db.insert("notifications", rows.slice(0, 500));
  } catch {
    // notices are best-effort
  }
}

/** Term grade table: suggestion (weighted average, half-up) next to the confirmed value. */
export async function termGradesTable(c: Ctx, classId: string, subjectId: string, termId: string) {
  const gb = await gradebook(c, classId, subjectId, termId);
  return {
    class_id: classId, subject_id: subjectId, term_id: termId, term_locked: gb.term_locked, can_edit: gb.can_edit,
    rows: gb.rows.map((r) => ({
      student_id: r.student_id, last_name: r.last_name, first_name: r.first_name, average: r.average, entry_count: r.entries.length,
      suggested: r.suggested, value: r.term_grade?.value ?? null, is_confirmed: r.term_grade?.is_confirmed ?? false, override_reason: r.term_grade?.override_reason ?? null,
    })),
  };
}

export async function saveTermGrades(c: Ctx, input: { class_id: string; subject_id: string; term_id: string; rows: { student_id: string; value: number | null; override_reason?: string | null }[] }) {
  need(c.classes.find((x) => x.id === input.class_id));
  if (!canGradeSubjectInClass(c.s, c.assignments, input.class_id, input.subject_id)) throw new SchoolError("forbidden");
  const entries = await c.db.select("grade_entries", { eq: { class_id: input.class_id, subject_id: input.subject_id, term_id: input.term_id } });
  const rows = input.rows.map((r) => ({
    student_id: r.student_id, value: r.value, override_reason: r.override_reason?.trim() || null,
    suggested: average2(entries.filter((e) => e.student_id === r.student_id), c.rules),
  }));
  return c.db.saveTermGradesBulk(c.actor, { class_id: input.class_id, subject_id: input.subject_id, term_id: input.term_id, rows });
}

/** every confirmed (or, when missing, suggested) term value of a student in a subject, in term order */
export function termValuesFor(c: Ctx, entries: GradeEntry[], termGrades: TermGrade[], studentId: string, subjectId: string): (number | null)[] {
  return c.terms.map((t) => {
    const confirmed = termGrades.find((g) => g.student_id === studentId && g.subject_id === subjectId && g.term_id === t.id && g.value !== null);
    if (confirmed) return confirmed.value;
    return suggestTermGrade(entries.filter((e) => e.student_id === studentId && e.subject_id === subjectId && e.term_id === t.id), c.rules)?.grade ?? null;
  });
}
