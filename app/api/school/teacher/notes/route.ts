import { z } from "zod";
import { api, readBody, readQuery } from "@/lib/school/api-helpers";
import { dateStr, uuid } from "@/lib/school/schemas";
import { getVisibleStudent } from "@/lib/school/service";

const noteBody = z.object({
  student_id: uuid,
  kind: z.enum(["positive", "negative", "neutral"]).default("neutral"),
  text: z.string().trim().min(1).max(500),
  date: dateStr.optional(),
});

/** GET /api/school/teacher/notes?student_id -> { notes[] } behavior notes of a student of one of my classes (newest first) */
export const GET = api({ roles: ["teacher"] }, async ({ c, req }) => {
  const q = readQuery(req, z.object({ student_id: uuid }));
  await getVisibleStudent(c, q.student_id);
  const notes = await c.db.select("behavior_notes", { eq: { student_id: q.student_id }, order: [["date", "desc"]], limit: 50 });
  return { notes };
});

/** POST /api/school/teacher/notes { student_id, kind?, text, date? } -> { note } */
export const POST = api({ roles: ["teacher"], mutate: true }, async ({ c, s, req }) => {
  const b = await readBody(req, noteBody);
  const st = await getVisibleStudent(c, b.student_id);
  const [note] = await c.db.insert("behavior_notes", [
    { student_id: st.id, class_id: st.class_id, teacher_id: s.teacherId, date: b.date && b.date <= c.today ? b.date : c.today, kind: b.kind, text: b.text },
  ]);
  await c.db.audit(c.actor, "create", "behavior_notes", note.id, { student_id: st.id, kind: b.kind });
  return { note };
});
