// Director-only service functions that fill gaps of the core API (overview, attendance overview, term confirmation status,
// audit log viewer, behavior notes, student status changes with reason, year rollover, notification stats, account (de)activation).
import { getServiceClient } from "@/lib/admin/supabase";
import type { AuditRow } from "./db";
import { addDaysStr, normalizeReason, pct, percentByKey, planRollover } from "./director-logic";
import { SchoolError } from "./errors";
import { average2 } from "./grading";
import { assertManageableAccount } from "./provision";
import { classNameOf, currentTerm, need, requireDirector, type Ctx } from "./svc-core";
import { saveStudent } from "./svc-people";
import type { AttendanceStatus, BehaviorKind, StudentStatus } from "./types";

const OK = new Set<string>(["present", "late"]);

export async function directorOverview(c: Ctx) {
  requireDirector(c);
  const students = await c.db.select("students", { eq: { status: "active" } });
  const classIds = c.classes.map((x) => x.id);
  const from = addDaysStr(c.today, -6);
  const att = classIds.length ? await c.db.select("attendance", { in: { class_id: classIds }, gte: { date: from }, lte: { date: c.today } }) : [];
  const todayMarked = new Set(att.filter((a) => a.date === c.today).map((a) => a.class_id));
  const withStudents = new Set(students.map((s) => s.class_id));
  const pending = c.classes
    .filter((x) => withStudents.has(x.id) && !todayMarked.has(x.id))
    .map((x) => ({ class_id: x.id, class_name: x.name }));
  const weekPct = percentByKey(att, (a) => a.class_id);
  const attendanceWeek = c.classes.map((x) => ({ class_id: x.id, class_name: x.name, percent: weekPct.get(x.id) ?? null }));

  const entries = await c.db.select("grade_entries", { in: { class_id: classIds, term_id: c.terms.map((t) => t.id) } });
  const gradeOfClass = new Map(c.classes.map((x) => [x.id, x.grade]));
  const grades = [...new Set(c.classes.map((x) => x.grade))].sort((a, b) => a - b);
  const termAverages = grades.map((g) => {
    const row: Record<string, number | null> = { grade: g };
    for (const t of c.terms) {
      row[`t${t.number}`] = average2(entries.filter((e) => e.term_id === t.id && gradeOfClass.get(e.class_id) === g), c.rules);
    }
    return row;
  });
  const term = currentTerm(c);
  const termAverage = term ? average2(entries.filter((e) => e.term_id === term.id), c.rules) : null;
  return { pending, attendanceWeek, termAverages, terms: c.terms.map((t) => ({ id: t.id, number: t.number })), termAverage };
}

/** which class/subject pairs have confirmed term grades for a term */
export async function termStatus(c: Ctx, termId: string) {
  requireDirector(c);
  need(c.terms.find((t) => t.id === termId));
  const [students, tgs, teachers] = await Promise.all([
    c.db.select("students", { eq: { status: "active" } }),
    c.db.select("term_grades", { eq: { term_id: termId } }),
    c.db.select("teachers"),
  ]);
  const rows = c.assignments
    .filter((a) => c.classes.some((x) => x.id === a.class_id))
    .map((a) => {
      const total = students.filter((s) => s.class_id === a.class_id).length;
      const confirmed = tgs.filter((g) => g.class_id === a.class_id && g.subject_id === a.subject_id && g.is_confirmed && g.value !== null).length;
      return {
        class_id: a.class_id, class_name: classNameOf(c, a.class_id) ?? "", subject_id: a.subject_id, teacher_id: a.teacher_id,
        teacher_name: teachers.find((t) => t.id === a.teacher_id)?.full_name ?? "", total, confirmed,
      };
    });
  return { term_id: termId, rows };
}

/** attendance of all classes for a period: per-class counts, per-day percent, absence reasons */
export async function attendanceOverview(c: Ctx, from: string, to: string) {
  requireDirector(c);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw new SchoolError("invalid_input");
  const classIds = c.classes.map((x) => x.id);
  const rows = classIds.length ? await c.db.select("attendance", { in: { class_id: classIds }, gte: { date: from }, lte: { date: to } }) : [];
  const students = await c.db.select("students", { eq: { status: "active" } });
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const classes = c.classes.map((cl) => {
    const mine = rows.filter((r) => r.class_id === cl.id);
    const cnt: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0, sick: 0 };
    for (const r of mine) cnt[r.status]++;
    const byDate = percentByKey(mine, (r) => r.date);
    return {
      class_id: cl.id, class_name: cl.name, grade: cl.grade, students: students.filter((s) => s.class_id === cl.id).length,
      counts: cnt, total: mine.length, percent: pct(cnt.present + cnt.late, mine.length), days: dates.map((d) => byDate.get(d) ?? null),
    };
  });
  const reasons = new Map<string, { reason: string; count: number }>();
  for (const r of rows) {
    if (OK.has(r.status)) continue;
    const key = normalizeReason(r.note) || `~${r.status}`;
    const e = reasons.get(key) ?? reasons.set(key, { reason: key.startsWith("~") ? "" : (r.note ?? "").trim(), count: 0 }).get(key)!;
    e.count++;
  }
  const reasonList = [...reasons.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count).slice(0, 12);
  const dayTotals = percentByKey(rows, (r) => r.date);
  return { from, to, dates, classes, day_percent: dates.map((d) => ({ date: d, percent: dayTotals.get(d) ?? null })), reasons: reasonList };
}

/* ------------------------------ audit ------------------------------ */
export interface AuditQuery { resource?: string; action?: string; q?: string; from?: string; to?: string; record_id?: string; limit?: number }
export async function listAudit(c: Ctx, f: AuditQuery): Promise<AuditRow[]> {
  requireDirector(c);
  const limit = Math.min(f.limit ?? 200, 500);
  let rows: AuditRow[];
  if (c.db.kind === "demo") {
    const { getDemoStore } = await import("./demo-store");
    rows = [...getDemoStore().auditLog];
  } else {
    const svc = getServiceClient();
    if (!svc) throw new SchoolError("not_configured", 501);
    let b = svc.from("audit_log").select("user_id,user_email,action,resource,record_id,diff,created_at").order("created_at", { ascending: false }).limit(1000);
    if (f.resource) b = b.eq("resource", f.resource);
    if (f.record_id) b = b.eq("record_id", f.record_id);
    const { data, error } = await b;
    if (error) throw new SchoolError("db_error", 500);
    rows = (data ?? []) as AuditRow[];
  }
  const q = f.q?.trim().toLowerCase();
  return rows
    .filter((r) => (!f.resource || r.resource === f.resource) && (!f.action || r.action === f.action) && (!f.record_id || r.record_id === f.record_id))
    .filter((r) => (!f.from || r.created_at.slice(0, 10) >= f.from) && (!f.to || r.created_at.slice(0, 10) <= f.to))
    .filter((r) => !q || `${r.user_email ?? ""} ${r.action} ${r.resource} ${r.record_id ?? ""} ${JSON.stringify(r.diff ?? {})}`.toLowerCase().includes(q))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
}

/* ------------------------------ notes ------------------------------ */
export async function listNotes(c: Ctx, studentId: string) {
  requireDirector(c);
  const notes = await c.db.select("behavior_notes", { eq: { student_id: studentId }, order: [["date", "desc"]] });
  return notes;
}
export async function addNote(c: Ctx, input: { student_id: string; kind: BehaviorKind; text: string; date?: string }) {
  requireDirector(c);
  const [st] = await c.db.select("students", { eq: { id: input.student_id } });
  need(st);
  const [row] = await c.db.insert("behavior_notes", [{ student_id: st.id, class_id: st.class_id, teacher_id: null, date: input.date ?? c.today, kind: input.kind, text: input.text }]);
  await c.db.audit(c.actor, "create", "behavior_notes", row.id, { student_id: st.id, kind: input.kind });
  return row;
}
export async function deleteNote(c: Ctx, id: string) {
  requireDirector(c);
  if (!(await c.db.remove("behavior_notes", { eq: { id } }))) throw new SchoolError("not_found");
  await c.db.audit(c.actor, "delete", "behavior_notes", id);
}

/* ------------------------------ student status ------------------------------ */
export async function changeStudentStatus(c: Ctx, input: { student_id: string; status: StudentStatus; reason: string }) {
  requireDirector(c);
  const [before] = await c.db.select("students", { eq: { id: input.student_id } });
  need(before);
  const row = await saveStudent(c, { status: input.status }, input.student_id);
  await c.db.audit(c.actor, "status_change", "students", row.id, { from: before.status, to: input.status, reason: input.reason });
  await c.db.insert("behavior_notes", [{ student_id: row.id, class_id: row.class_id, teacher_id: null, date: c.today, kind: "neutral", text: `[${before.status} -> ${input.status}] ${input.reason}` }]);
  return row;
}

/* ------------------------------ rollover ------------------------------ */
export async function rollover(c: Ctx, input: { target_year_id: string; commit: boolean }) {
  requireDirector(c);
  const target = need(c.years.find((y) => y.id === input.target_year_id));
  if (!c.year || target.id === c.year.id) throw new SchoolError("invalid_input");
  const [targetClasses, students] = await Promise.all([
    c.db.select("classes", { eq: { year_id: target.id } }),
    c.db.select("students", { eq: { status: "active" } }),
  ]);
  const plan = planRollover(c.classes, targetClasses, students);
  if (!input.commit) return { plan, committed: false, moved: 0, graduated: 0, created_classes: 0 };
  let moved = 0;
  let graduated = 0;
  let created = 0;
  // highest grade first is irrelevant: students move to classes of another year, never in the source year
  for (const item of plan) {
    const src = c.classes.find((x) => x.id === item.from_class_id)!;
    const kids = students.filter((s) => s.class_id === src.id);
    if (item.action === "graduate") {
      for (const s of kids) await c.db.update("students", { eq: { id: s.id } }, { status: "graduated" });
      graduated += kids.length;
      continue;
    }
    let toId = item.to_class_id;
    if (!toId) {
      const [created1] = await c.db.insert("classes", [{ year_id: target.id, grade: src.grade + 1, letter: src.letter, name: `${src.grade + 1}${src.letter}`, homeroom_teacher_id: src.homeroom_teacher_id, room: src.room }]);
      toId = created1.id;
      created++;
    }
    for (const s of kids) await c.db.update("students", { eq: { id: s.id } }, { class_id: toId });
    moved += kids.length;
  }
  await c.db.audit(c.actor, "rollover", "classes", target.id, { moved, graduated, created_classes: created });
  return { plan, committed: true, moved, graduated, created_classes: created };
}

/* ------------------------------ notifications ------------------------------ */
export async function notificationStats(c: Ctx) {
  requireDirector(c);
  const items = await c.db.select("notifications", { order: [["created_at", "desc"]], limit: 2000 });
  const byType = new Map<string, { type: string; total: number; unread: number }>();
  for (const n of items) {
    const e = byType.get(n.type) ?? byType.set(n.type, { type: n.type, total: 0, unread: 0 }).get(n.type)!;
    e.total++;
    if (!n.read_at) e.unread++;
  }
  const readRate = pct(items.filter((n) => n.read_at).length, items.length);
  const recent = items.slice(0, 30).map((n) => ({ id: n.id, type: n.type, payload: n.payload, created_at: n.created_at, read: !!n.read_at }));
  return { total: items.length, unread: items.filter((n) => !n.read_at).length, read_rate: readRate, by_type: [...byType.values()].sort((a, b) => b.total - a.total), recent };
}

/* ------------------------------ accounts ------------------------------ */
export async function setAccountActive(c: Ctx, input: { user_id: string; active: boolean }) {
  await assertManageableAccount(c, input.user_id);
  if (c.db.kind !== "demo") {
    const svc = getServiceClient();
    if (!svc) throw new SchoolError("not_configured", 501);
    const { error } = await svc.from("profiles").update({ is_active: input.active }).eq("id", input.user_id);
    if (error) throw new SchoolError("db_error", 500);
  }
  await c.db.audit(c.actor, input.active ? "activate_account" : "deactivate_account", "auth", input.user_id, null);
  return { user_id: input.user_id, active: input.active };
}
