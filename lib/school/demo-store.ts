// In-memory SIS backend used in DEMO mode (no Supabase env) and by unit tests.
// It mirrors the SQL schema: unique keys, cascades, and the RPC rules (ownership, ranges, locked terms, edit window, audit).
import { generateDemoData, type DemoTables } from "./demo-data";
import type { Actor, AttendanceBulkArgs, AuditRow, GradesBulkArgs, Q, SchoolDb, TermGradesBulkArgs } from "./db";
import { SchoolError } from "./errors";
import { tashkentToday } from "./grading";
import { canGradeSubjectInClass, canManageClass, isDirector, teacherClassIds, withinEditWindow } from "./permissions";
import type { TableName, TableRows } from "./types";
import { ATTENDANCE_STATUSES, GRADE_KINDS } from "./types";

type Row = Record<string, unknown>;

const UNIQUES: Partial<Record<TableName, string[][]>> = {
  school_years: [["name"]],
  terms: [["year_id", "number"]],
  classes: [["year_id", "grade", "letter"]],
  teaching_assignments: [["class_id", "subject_id"]],
  students: [["student_code"]],
  student_guardians: [["student_id", "guardian_id"]],
  schedule_slots: [["class_id", "weekday", "lesson_no"]],
  lessons: [["class_id", "date", "lesson_no"]],
  term_grades: [["student_id", "subject_id", "term_id"]],
  school_notification_prefs: [["user_id"]],
};
/** tables whose primary key is not a generated `id` column */
const NO_ID: TableName[] = ["student_guardians", "term_grades", "school_notification_prefs"];

const DEFAULTS: Partial<Record<TableName, () => Row>> = {
  school_years: () => ({ is_current: false, grading_rules: {} }),
  terms: () => ({ is_locked: false }),
  subjects: () => ({ short: "", sort_order: 0 }),
  teachers: () => ({ user_id: null, phone: null, email: null, subjects: [], hired_at: null, status: "active" }),
  classes: () => ({ homeroom_teacher_id: null, room: null }),
  teaching_assignments: () => ({ hours_per_week: 2 }),
  students: () => ({ user_id: null, middle_name: null, birth_date: null, gender: null, class_id: null, phone: null, address: null, photo_url: null, status: "active", enrolled_at: null, notes: null }),
  guardians: () => ({ user_id: null, relation: "parent", phone: null, email: null, telegram_chat_id: null }),
  student_guardians: () => ({ is_primary: false }),
  schedule_slots: () => ({ teacher_id: null, room: null }),
  lessons: () => ({ slot_id: null, teacher_id: null, topic: null, homework: null }),
  attendance: () => ({ lesson_no: null, minutes_late: 0, note: null, marked_by: null }),
  grade_entries: () => ({ kind: "daily", max_score: 5, percent: null, weight: 1, comment: null, teacher_id: null }),
  term_grades: () => ({ value: null, suggested: null, is_confirmed: false, confirmed_by: null, override_reason: null }),
  school_notification_prefs: () => ({ telegram: true, email: true, absence: true, low_grade: true, announcements: true }),
  announcements: () => ({ audience: "all", class_id: null, body: "", author_id: null, pinned: false }),
  notifications: () => ({ payload: {}, read_at: null }),
  behavior_notes: () => ({ class_id: null, teacher_id: null, kind: "neutral" }),
};

const HAS_CREATED: TableName[] = ["grade_entries", "announcements", "notifications", "behavior_notes"];
const HAS_UPDATED: TableName[] = ["term_grades", "school_notification_prefs"];

export class DemoStore implements SchoolDb {
  readonly kind = "demo" as const;
  tables: DemoTables;
  auditLog: AuditRow[] = [];
  private todayStr: string;

  constructor(today: string = tashkentToday()) {
    this.todayStr = today;
    this.tables = generateDemoData(today).tables;
  }

  today() {
    return this.todayStr;
  }
  /** tests: pretend the clock is somewhere else */
  setToday(d: string) {
    this.todayStr = d;
  }

  private rows(t: TableName): Row[] {
    return this.tables[t] as unknown as Row[];
  }
  private match(r: Row, q?: Q): boolean {
    if (!q) return true;
    if (q.eq) for (const [k, v] of Object.entries(q.eq)) if ((r[k] ?? null) !== v) return false;
    if (q.in) for (const [k, v] of Object.entries(q.in)) if (!v.includes(r[k] as string)) return false;
    if (q.gte) for (const [k, v] of Object.entries(q.gte)) if (!((r[k] as string | number) >= v)) return false;
    if (q.lte) for (const [k, v] of Object.entries(q.lte)) if (!((r[k] as string | number) <= v)) return false;
    return true;
  }

  async select<K extends TableName>(table: K, q?: Q): Promise<TableRows[K][]> {
    let out = this.rows(table).filter((r) => this.match(r, q));
    if (q?.order?.length) {
      const ord = q.order;
      out = [...out].sort((a, b) => {
        for (const [k, dir] of ord) {
          const x = a[k] as string | number | null;
          const y = b[k] as string | number | null;
          if (x === y) continue;
          const c = (x ?? "") < (y ?? "") ? -1 : 1;
          return dir === "asc" ? c : -c;
        }
        return 0;
      });
    }
    if (q?.offset) out = out.slice(q.offset);
    if (q?.limit !== undefined) out = out.slice(0, q.limit);
    return out.map((r) => ({ ...r })) as unknown as TableRows[K][];
  }

  private checkUnique(table: TableName, row: Row, ignore?: Row) {
    for (const cols of UNIQUES[table] ?? []) {
      if (cols.some((c) => row[c] === undefined || row[c] === null)) continue;
      if (this.rows(table).some((r) => r !== ignore && cols.every((c) => r[c] === row[c]))) throw new SchoolError("conflict", 409, `${table} unique`);
    }
    if (table === "schedule_slots") {
      // mirrors schedule_slots_room_uq / schedule_slots_teacher_uq
      const room = typeof row.room === "string" ? row.room.trim().toLowerCase() : "";
      const same = (r: Row) => r !== ignore && r.weekday === row.weekday && r.lesson_no === row.lesson_no;
      if (room && this.rows(table).some((r) => same(r) && typeof r.room === "string" && r.room.trim().toLowerCase() === room)) throw new SchoolError("room_busy", 409);
      if (row.teacher_id && this.rows(table).some((r) => same(r) && r.teacher_id === row.teacher_id)) throw new SchoolError("conflict", 409, "teacher busy");
    }
    if (table === "attendance") {
      const key = (r: Row) => `${r.student_id}|${r.date}|${r.lesson_no ?? 0}`;
      if (this.rows(table).some((r) => r !== ignore && key(r) === key(row))) throw new SchoolError("conflict", 409, "attendance unique");
    }
    if (table === "school_years" && row.is_current) for (const r of this.rows(table)) if (r !== ignore && r.is_current) r.is_current = false;
  }

  private build(table: TableName, input: Row): Row {
    const row: Row = { ...(DEFAULTS[table]?.() ?? {}), ...input };
    if (!NO_ID.includes(table) && row.id === undefined) row.id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    if (HAS_CREATED.includes(table) && !row.created_at) row.created_at = nowIso;
    if (table === "announcements" && !row.publish_at) row.publish_at = nowIso;
    if (table === "attendance" && !row.marked_at) row.marked_at = nowIso;
    if (HAS_UPDATED.includes(table)) row.updated_at = nowIso;
    return row;
  }

  async insert<K extends TableName>(table: K, rows: Partial<TableRows[K]>[]): Promise<TableRows[K][]> {
    const built = rows.map((r) => this.build(table, r as Row));
    const seen: Row[] = [];
    for (const b of built) {
      this.checkUnique(table, b);
      this.rows(table).push(b);
      seen.push(b);
    }
    return seen.map((r) => ({ ...r })) as unknown as TableRows[K][];
  }

  async update<K extends TableName>(table: K, match: Q, patch: Partial<TableRows[K]>): Promise<TableRows[K][]> {
    const hit = this.rows(table).filter((r) => this.match(r, match));
    for (const r of hit) {
      const next = { ...r, ...(patch as Row) };
      this.checkUnique(table, next, r);
      Object.assign(r, patch as Row);
      if (HAS_UPDATED.includes(table)) r.updated_at = new Date().toISOString();
    }
    return hit.map((r) => ({ ...r })) as unknown as TableRows[K][];
  }

  async upsert<K extends TableName>(table: K, rows: Partial<TableRows[K]>[], onConflict: string[]): Promise<TableRows[K][]> {
    const out: Row[] = [];
    for (const input of rows as Row[]) {
      const existing = this.rows(table).find((r) => onConflict.every((c) => r[c] === input[c]));
      if (existing) {
        Object.assign(existing, input);
        if (HAS_UPDATED.includes(table)) existing.updated_at = new Date().toISOString();
        out.push({ ...existing });
      } else {
        const b = this.build(table, input);
        this.checkUnique(table, b);
        this.rows(table).push(b);
        out.push({ ...b });
      }
    }
    return out as unknown as TableRows[K][];
  }

  async remove(table: TableName, match: Q): Promise<number> {
    const doomed = this.rows(table).filter((r) => this.match(r, match));
    if (!doomed.length) return 0;
    const keep = this.rows(table).filter((r) => !doomed.includes(r));
    (this.tables as unknown as Record<string, Row[]>)[table] = keep;
    const ids = new Set(doomed.map((r) => r.id as string));
    const drop = (t: TableName, col: string) => {
      (this.tables as unknown as Record<string, Row[]>)[t] = this.rows(t).filter((r) => !ids.has(r[col] as string));
    };
    const nullify = (t: TableName, col: string) => this.rows(t).forEach((r) => ids.has(r[col] as string) && (r[col] = null));
    switch (table) {
      case "students":
        for (const t of ["attendance", "grade_entries", "term_grades", "behavior_notes", "student_guardians"] as const) drop(t, "student_id");
        break;
      case "classes":
        nullify("students", "class_id");
        for (const t of ["teaching_assignments", "schedule_slots", "lessons", "attendance", "grade_entries", "term_grades", "announcements"] as const) drop(t, "class_id");
        break;
      case "subjects":
        for (const t of ["teaching_assignments", "schedule_slots", "lessons", "grade_entries", "term_grades"] as const) drop(t, "subject_id");
        break;
      case "teachers":
        drop("teaching_assignments", "teacher_id");
        for (const [t, c] of [["classes", "homeroom_teacher_id"], ["schedule_slots", "teacher_id"], ["lessons", "teacher_id"], ["grade_entries", "teacher_id"], ["behavior_notes", "teacher_id"]] as const) nullify(t, c);
        break;
      case "guardians":
        drop("student_guardians", "guardian_id");
        break;
      case "terms":
        drop("grade_entries", "term_id");
        drop("term_grades", "term_id");
        break;
      case "school_years":
        drop("terms", "year_id");
        drop("classes", "year_id");
        break;
      default:
        break;
    }
    return doomed.length;
  }

  async audit(actor: Actor, action: string, resource: string, recordId: string | null, diff: Record<string, unknown> | null = null) {
    this.auditLog.push({ user_id: actor.id, user_email: actor.email, action, resource, record_id: recordId, diff, created_at: new Date().toISOString() });
    if (this.auditLog.length > 5000) this.auditLog.splice(0, 1000);
  }

  /* ------------------------------ RPC mirrors ------------------------------ */
  private ctx(actor: Actor) {
    const classIds = teacherClassIds(actor, this.tables.classes, this.tables.teaching_assignments);
    return { classIds, assignments: this.tables.teaching_assignments };
  }
  private asSession(actor: Actor) {
    return { ...actor, name: actor.email, studentIds: [] as string[] };
  }

  async markAttendanceBulk(actor: Actor, a: AttendanceBulkArgs) {
    const s = this.asSession(actor);
    const { classIds } = this.ctx(actor);
    if (!this.tables.classes.some((c) => c.id === a.class_id)) throw new SchoolError("not_found");
    if (!canManageClass(s, a.class_id, classIds)) throw new SchoolError("forbidden");
    if (a.date > this.todayStr) throw new SchoolError("invalid_date");
    if (!withinEditWindow(s, a.date, this.todayStr)) throw new SchoolError("edit_window_closed");
    if (a.lesson_no !== null && (a.lesson_no < 1 || a.lesson_no > 8 || !Number.isInteger(a.lesson_no))) throw new SchoolError("invalid_input");
    if (!a.records.length || a.records.length > 100) throw new SchoolError("invalid_input");
    for (const r of a.records) {
      if (!(ATTENDANCE_STATUSES as string[]).includes(r.status)) throw new SchoolError("invalid_status");
      const late = r.minutes_late ?? 0;
      if (!Number.isInteger(late) || late < 0 || late > 240) throw new SchoolError("invalid_input");
      if (!this.tables.students.some((st) => st.id === r.student_id && st.class_id === a.class_id)) throw new SchoolError("student_not_in_class");
    }
    for (const r of a.records) {
      const lesson_no = a.lesson_no;
      const existing = this.tables.attendance.find((x) => x.student_id === r.student_id && x.date === a.date && (x.lesson_no ?? 0) === (lesson_no ?? 0));
      const patch = {
        class_id: a.class_id, status: r.status as never, minutes_late: r.status === "late" ? (r.minutes_late ?? 0) : 0,
        note: r.note ? r.note.slice(0, 200) : null, marked_by: actor.id, marked_at: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, patch);
      else this.tables.attendance.push({ id: crypto.randomUUID(), student_id: r.student_id, date: a.date, lesson_no, ...patch });
    }
    await this.audit(actor, "attendance_bulk", "attendance", a.class_id, { date: a.date, lesson_no: a.lesson_no, count: a.records.length });
    return { saved: a.records.length };
  }

  async saveGradesBulk(actor: Actor, a: GradesBulkArgs) {
    const s = this.asSession(actor);
    const { assignments } = this.ctx(actor);
    const dir = isDirector(s);
    const term = this.tables.terms.find((t) => t.id === a.term_id);
    const cls = this.tables.classes.find((c) => c.id === a.class_id);
    if (!term || !cls) throw new SchoolError("not_found");
    if (term.year_id !== cls.year_id) throw new SchoolError("term_not_in_year");
    if (!canGradeSubjectInClass(s, assignments, a.class_id, a.subject_id)) throw new SchoolError("forbidden");
    if (term.is_locked && !dir) throw new SchoolError("term_locked");
    if (!a.entries.length || a.entries.length > 300) throw new SchoolError("invalid_input");
    const teacherId = actor.teacherId ?? assignments.find((x) => x.class_id === a.class_id && x.subject_id === a.subject_id)?.teacher_id ?? null;
    type Op = { del: string } | { id?: string; row: Record<string, unknown> };
    const ops: Op[] = [];
    for (const e of a.entries) {
      if (e.delete) {
        if (!e.id) throw new SchoolError("invalid_input");
        if (!this.tables.grade_entries.some((g) => g.id === e.id && g.class_id === a.class_id && g.subject_id === a.subject_id && g.term_id === a.term_id)) throw new SchoolError("not_found");
        ops.push({ del: e.id });
        continue;
      }
      const kind = e.kind ?? "daily";
      if (!(GRADE_KINDS as string[]).includes(kind)) throw new SchoolError("invalid_kind");
      if (typeof e.score !== "number" || !(e.score >= 1 && e.score <= 5)) throw new SchoolError("invalid_score");
      const weight = e.weight ?? 1;
      if (!(weight > 0 && weight <= 10)) throw new SchoolError("invalid_input");
      if (!e.student_id || !e.date) throw new SchoolError("invalid_input");
      if (e.date < term.start_date || e.date > term.end_date) throw new SchoolError("date_out_of_term");
      if (e.date > this.todayStr) throw new SchoolError("invalid_date");
      if (!this.tables.students.some((st) => st.id === e.student_id && st.class_id === a.class_id)) throw new SchoolError("student_not_in_class");
      if (e.id && !this.tables.grade_entries.some((g) => g.id === e.id && g.class_id === a.class_id && g.subject_id === a.subject_id && g.term_id === a.term_id && g.student_id === e.student_id)) throw new SchoolError("not_found");
      ops.push({ id: e.id, row: { student_id: e.student_id, date: e.date, kind, score: Math.round(e.score * 10) / 10, weight, comment: e.comment ? e.comment.slice(0, 300) : null } });
    }
    let saved = 0;
    let deleted = 0;
    for (const op of ops) {
      if ("del" in op) {
        this.tables.grade_entries = this.tables.grade_entries.filter((g) => g.id !== op.del);
        deleted++;
      } else if (op.id) {
        Object.assign(this.tables.grade_entries.find((g) => g.id === op.id)!, op.row);
        saved++;
      } else {
        this.tables.grade_entries.push({
          id: crypto.randomUUID(), class_id: a.class_id, subject_id: a.subject_id, term_id: a.term_id, max_score: 5, percent: null,
          teacher_id: teacherId, created_at: new Date().toISOString(), ...(op.row as object),
        } as TableRows["grade_entries"]);
        saved++;
      }
    }
    await this.audit(actor, "grades_bulk", "grade_entries", a.class_id, { subject_id: a.subject_id, term_id: a.term_id, saved, deleted });
    return { saved, deleted };
  }

  async saveTermGradesBulk(actor: Actor, a: TermGradesBulkArgs) {
    const s = this.asSession(actor);
    const { assignments } = this.ctx(actor);
    const term = this.tables.terms.find((t) => t.id === a.term_id);
    const cls = this.tables.classes.find((c) => c.id === a.class_id);
    if (!term || !cls) throw new SchoolError("not_found");
    if (term.year_id !== cls.year_id) throw new SchoolError("term_not_in_year");
    if (!canGradeSubjectInClass(s, assignments, a.class_id, a.subject_id)) throw new SchoolError("forbidden");
    if (term.is_locked && !isDirector(s)) throw new SchoolError("term_locked");
    if (!a.rows.length || a.rows.length > 100) throw new SchoolError("invalid_input");
    for (const r of a.rows) {
      if (r.value !== null && (!Number.isInteger(r.value) || r.value < 1 || r.value > 5)) throw new SchoolError("invalid_score");
      if (r.suggested != null && (r.suggested < 1 || r.suggested > 5)) throw new SchoolError("invalid_score");
      if (!this.tables.students.some((st) => st.id === r.student_id && st.class_id === a.class_id)) throw new SchoolError("student_not_in_class");
    }
    for (const r of a.rows) {
      const reason = r.value !== null && r.override_reason ? r.override_reason.trim().slice(0, 300) || null : null;
      const patch = { class_id: a.class_id, value: r.value, suggested: r.suggested ?? null, is_confirmed: r.value !== null, confirmed_by: r.value !== null ? actor.id : null, override_reason: reason, updated_at: new Date().toISOString() };
      const ex = this.tables.term_grades.find((t) => t.student_id === r.student_id && t.subject_id === a.subject_id && t.term_id === a.term_id);
      if (ex) Object.assign(ex, patch);
      else this.tables.term_grades.push({ student_id: r.student_id, subject_id: a.subject_id, term_id: a.term_id, ...patch });
    }
    await this.audit(actor, "term_grades_bulk", "term_grades", a.class_id, { subject_id: a.subject_id, term_id: a.term_id, saved: a.rows.length });
    return { saved: a.rows.length };
  }

  async lockTerm(actor: Actor, termId: string, locked: boolean) {
    if (!isDirector(actor)) throw new SchoolError("forbidden");
    const t = this.tables.terms.find((x) => x.id === termId);
    if (!t) throw new SchoolError("not_found");
    t.is_locked = !!locked;
    await this.audit(actor, locked ? "lock" : "unlock", "terms", termId, null);
    return { term_id: termId, is_locked: t.is_locked };
  }
}

const g = globalThis as unknown as { __schoolDemoStore?: DemoStore };
export function getDemoStore(): DemoStore {
  return (g.__schoolDemoStore ??= new DemoStore());
}
export function resetDemoStore(today?: string): DemoStore {
  g.__schoolDemoStore = new DemoStore(today);
  return g.__schoolDemoStore;
}
