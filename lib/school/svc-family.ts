// Family-facing aggregates and the excuse (absence explanation) resolution flow.
import { SchoolError } from "./errors";
import { average2 } from "./grading";
import { isDirector } from "./permissions";
import { markAttendance } from "./svc-attendance";
import { currentTerm, forbid, fullName, getVisibleStudent, need, type Ctx } from "./svc-core";

/** a class average is only published when at least this many pupils have grades in the subject (no individual can be singled out) */
export const CLASS_AVERAGE_MIN_STUDENTS = 5;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Per-subject class average for the class of `studentId` in a term, as an aggregate ONLY: a subject is reported when at least
 * CLASS_AVERAGE_MIN_STUDENTS pupils of the class have counted grades in it, otherwise `average` is null. No individual values or
 * counts are returned. The student must be visible to the caller (parent -> own child, student -> self).
 */
export async function classAverage(c: Ctx, studentId: string, termId?: string) {
  const st = await getVisibleStudent(c, studentId);
  const term = termId ? need(c.terms.find((t) => t.id === termId)) : need(currentTerm(c));
  if (!st.class_id) return { student_id: st.id, class_id: null, term_id: term.id, min_students: CLASS_AVERAGE_MIN_STUDENTS, subjects: [] };
  const entries = await c.db.select("grade_entries", { eq: { class_id: st.class_id, term_id: term.id } });
  const subjectIds = new Set([...c.assignments.filter((a) => a.class_id === st.class_id).map((a) => a.subject_id), ...entries.map((e) => e.subject_id)]);
  const subjects = [...subjectIds]
    .map((subject_id) => {
      const perStudent = new Map<string, typeof entries>();
      for (const e of entries) if (e.subject_id === subject_id) (perStudent.get(e.student_id) ?? perStudent.set(e.student_id, []).get(e.student_id)!).push(e);
      const avgs = [...perStudent.values()].map((list) => average2(list, c.rules)).filter((x): x is number => x !== null);
      const average = avgs.length >= CLASS_AVERAGE_MIN_STUDENTS ? round2(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
      return { subject_id, average, sort: c.subjects.find((s) => s.id === subject_id)?.sort_order ?? 999 };
    })
    .sort((a, b) => a.sort - b.sort)
    .map(({ subject_id, average }) => ({ subject_id, average }));
  return { student_id: st.id, class_id: st.class_id, term_id: term.id, min_students: CLASS_AVERAGE_MIN_STUDENTS, subjects };
}

/**
 * Homeroom teacher (or a director) accepts the explanation a parent sent with POST /family/excuse: the `absent` attendance of that day
 * becomes `excused`, the notification is marked read and the parent gets an `excuse_resolved` notification.
 * Rules: teacher -> only the notification addressed to them AND only while they are the homeroom teacher of the pupil's class;
 * locked term -> term_locked (directors may still accept); attendance edit window as in the attendance RPC (edit_window_closed).
 */
type ExcusePayload = { student_id?: string; date?: string; reason?: string; note?: string; parent_user_id?: string };
type ExcuseChecked = ExcusePayload & { student_id: string; date: string };

/** Loads an `absence_excuse` notification and enforces who may resolve it (addressed teacher AND homeroom teacher of the pupil's class, or a director). */
async function loadExcuse(c: Ctx, notificationId: string) {
  const [n] = await c.db.select("notifications", { eq: { id: notificationId } });
  need(n);
  if (n.type !== "absence_excuse") throw new SchoolError("invalid_input");
  if (!isDirector(c.s) && n.user_id !== c.s.id) forbid();
  const p = n.payload as ExcusePayload;
  if (!p.student_id || !p.date) throw new SchoolError("invalid_input");
  const st = need((await c.db.select("students", { eq: { id: p.student_id } }))[0]);
  const cls = need(c.classes.find((x) => x.id === st.class_id));
  if (!isDirector(c.s) && (!c.s.teacherId || cls.homeroom_teacher_id !== c.s.teacherId)) forbid();
  return { n, p: p as ExcuseChecked, st, cls };
}

/** parents that have to hear about the decision: the one who wrote the explanation, else every guardian of the pupil that has an account */
async function excuseRecipients(c: Ctx, p: ExcuseChecked, studentId: string): Promise<string[]> {
  const recipients: string[] = p.parent_user_id ? [p.parent_user_id] : [];
  if (!recipients.length) {
    const links = await c.db.select("student_guardians", { eq: { student_id: studentId } });
    const gs = links.length ? await c.db.select("guardians", { in: { id: links.map((l) => l.guardian_id) } }) : [];
    for (const g of gs) if (g.user_id) recipients.push(g.user_id);
  }
  return recipients;
}

/** true when an excuse_resolved(rejected) notice for this pupil/date was created after the explanation (a rejected explanation is final) */
async function wasRejected(c: Ctx, p: ExcuseChecked, after: string): Promise<boolean> {
  const rows = await c.db.select("notifications", { eq: { type: "excuse_resolved" } });
  return rows.some((r) => r.created_at >= after && r.payload.student_id === p.student_id && r.payload.date === p.date && r.payload.status === "rejected");
}

/**
 * Homeroom teacher (or a director) REJECTS the explanation: attendance stays `absent`, the notification is marked read and the parent gets an
 * `excuse_resolved` notification with `status:"rejected"` and the teacher's comment (required, 3..300 chars). Same permission rules as acceptExcuse.
 * A resolved explanation cannot be rejected again (already_resolved); the parent may send a new explanation afterwards.
 */
export async function rejectExcuse(c: Ctx, notificationId: string, comment: string) {
  const { n, p, st, cls } = await loadExcuse(c, notificationId);
  if (n.read_at) throw new SchoolError("already_resolved");
  const term = c.terms.find((t) => p.date >= t.start_date && p.date <= t.end_date);
  if (term?.is_locked && !isDirector(c.s)) throw new SchoolError("term_locked");
  const rows = (await c.db.select("attendance", { eq: { student_id: st.id, date: p.date } })).filter((r) => r.class_id === cls.id);
  if (!rows.some((r) => r.status === "absent") && rows.some((r) => r.status === "excused")) throw new SchoolError("already_resolved");
  const text = comment.trim().slice(0, 300);
  await c.db.update("notifications", { eq: { id: n.id, read_at: null } }, { read_at: new Date().toISOString() });
  await c.db.audit(c.actor, "excuse_reject", "attendance", st.id, { date: p.date, reason: p.reason ?? null, notification_id: n.id });
  const recipients = await excuseRecipients(c, p, st.id);
  if (recipients.length) {
    const payload = { student_id: st.id, student_name: fullName(st), class_name: cls.name, date: p.date, reason: p.reason ?? null, status: "rejected", comment: text, by: c.s.name };
    await c.db.insert("notifications", recipients.map((user_id) => ({ user_id, type: "excuse_resolved", payload })));
  }
  return { rejected: true, notified: recipients.length, student_id: st.id, date: p.date };
}

export async function acceptExcuse(c: Ctx, notificationId: string) {
  const { n, p, st, cls } = await loadExcuse(c, notificationId);
  if (n.read_at && (await wasRejected(c, p, n.created_at))) throw new SchoolError("already_resolved");
  const term = c.terms.find((t) => p.date >= t.start_date && p.date <= t.end_date);
  if (term?.is_locked && !isDirector(c.s)) throw new SchoolError("term_locked");

  const rows = (await c.db.select("attendance", { eq: { student_id: st.id, date: p.date } })).filter((r) => r.class_id === cls.id);
  const absent = rows.filter((r) => r.status === "absent");
  if (!absent.length && rows.some((r) => r.status === "excused")) throw new SchoolError("already_resolved");

  let excused = 0;
  if (absent.length) {
    const reasonNote = `excuse: ${p.reason ?? "other"}${p.note ? ` - ${p.note}` : ""}`.slice(0, 200);
    const lessonNos = [...new Set(absent.map((r) => r.lesson_no ?? null))];
    for (const lesson_no of lessonNos) {
      const mine = absent.filter((r) => (r.lesson_no ?? null) === lesson_no);
      const res = await markAttendance(c, {
        class_id: cls.id, date: p.date, lesson_no,
        records: mine.map((r) => ({ student_id: r.student_id, status: "excused", minutes_late: 0, note: r.note ?? reasonNote })),
      });
      excused += res.saved;
    }
  }
  await c.db.update("notifications", { eq: { id: n.id, read_at: null } }, { read_at: new Date().toISOString() });
  await c.db.audit(c.actor, "excuse_accept", "attendance", st.id, { date: p.date, reason: p.reason ?? null, notification_id: n.id, excused });

  // tell the parent(s)
  const recipients = await excuseRecipients(c, p, st.id);
  if (recipients.length) {
    const payload = { student_id: st.id, student_name: fullName(st), class_name: cls.name, date: p.date, reason: p.reason ?? null, status: "accepted", by: c.s.name };
    await c.db.insert("notifications", recipients.map((user_id) => ({ user_id, type: "excuse_resolved", payload })));
  }
  return { excused, notified: recipients.length, student_id: st.id, date: p.date };
}
