import { z } from "zod";
import { api, readBody, readQuery } from "@/lib/school/api-helpers";
import { SchoolError } from "@/lib/school/errors";
import { dateStr, uuid } from "@/lib/school/schemas";
import { getVisibleStudent, fullName, listNotifications } from "@/lib/school/service";

const excuseSchema = z.object({
  student_id: uuid,
  date: dateStr,
  reason: z.enum(["sick", "family", "other"]),
  note: z.string().trim().max(500).default(""),
});

/**
 * POST /api/school/family/excuse (parent) { student_id, date, reason, note } -> { sent, delivered }
 * The attendance table is staff-write only, so the explanation travels as an in-app notification (type `absence_excuse`) to the
 * homeroom teacher (delivered when the teacher has an account) plus a copy for the parent (type `excuse_sent`, shown next to the absence).
 */
export const POST = api({ roles: ["parent"], mutate: true }, async ({ c, req }) => {
  const b = await readBody(req, excuseSchema);
  const st = await getVisibleStudent(c, b.student_id);
  if (b.date > c.today) throw new SchoolError("invalid_date");
  const rows = await c.db.select("attendance", { eq: { student_id: st.id, date: b.date } });
  if (!rows.some((r) => r.status === "absent" || r.status === "late")) throw new SchoolError("not_found");
  // one OPEN explanation per pupil and day: a new one is accepted only after the previous one was answered (accepted or rejected)
  const mine = await c.db.select("notifications", { eq: { user_id: c.s.id }, order: [["created_at", "desc"]], limit: 200 });
  const sent = mine.filter((n) => n.type === "excuse_sent" && n.payload.student_id === st.id && n.payload.date === b.date).sort((a, z) => (a.created_at < z.created_at ? 1 : -1))[0];
  if (sent) {
    const answer = mine.find((n) => n.type === "excuse_resolved" && n.payload.student_id === st.id && n.payload.date === b.date && n.created_at >= sent.created_at);
    if (!answer) throw new SchoolError("conflict", 409);
  }
  const cls = c.classes.find((x) => x.id === st.class_id);
  const teacher = cls?.homeroom_teacher_id ? (await c.db.select("teachers", { eq: { id: cls.homeroom_teacher_id } }))[0] : undefined;
  const payload = { student_id: st.id, student_name: fullName(st), class_name: cls?.name ?? "", date: b.date, reason: b.reason, note: b.note, from: c.s.name, parent_user_id: c.s.id };
  const out = [{ user_id: c.s.id, type: "excuse_sent", payload }];
  if (teacher?.user_id) out.push({ user_id: teacher.user_id, type: "absence_excuse", payload });
  await c.db.insert("notifications", out);
  await c.db.audit(c.actor, "create", "notifications", st.id, { kind: "absence_excuse", date: b.date });
  return { sent: true, delivered: !!teacher?.user_id };
});

/**
 * GET /api/school/family/excuse?student_id -> { excuses: [{date, reason, note, created_at, resolved, resolved_at, resolved_by}] }
 * explanations the signed-in parent sent for this child; `resolved: true` once the homeroom teacher accepted it
 * (POST /teacher/excuse/accept turns the absence into `excused` and sends an `excuse_resolved` notification).
 */
export const GET = api({ roles: ["parent"] }, async ({ c, req }) => {
  const q = readQuery(req, z.object({ student_id: uuid }));
  await getVisibleStudent(c, q.student_id);
  const all = await listNotifications(c, { limit: 100 });
  const resolved = all.items.filter((n) => n.type === "excuse_resolved" && n.payload.student_id === q.student_id);
  const excuses = all.items
    .filter((n) => n.type === "excuse_sent" && n.payload.student_id === q.student_id)
    .map((n) => {
      const done = resolved.find((r) => r.payload.date === n.payload.date && r.created_at >= n.created_at);
      return {
        date: String(n.payload.date), reason: String(n.payload.reason), note: String(n.payload.note ?? ""), created_at: n.created_at,
        resolved: !!done, resolved_at: done?.created_at ?? null, resolved_by: done ? String(done.payload.by ?? "") : null,
        status: done ? String(done.payload.status ?? "accepted") : "pending", comment: done && done.payload.comment ? String(done.payload.comment) : null,
      };
    });
  return { excuses };
});
