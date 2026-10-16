import { z } from "zod";
import { api, readQuery } from "@/lib/school/api-helpers";
import { uuid } from "@/lib/school/schemas";
import { getVisibleStudent } from "@/lib/school/service";

/**
 * GET /api/school/family/info?student_id -> { info: { class_name, room, homeroom_teacher, subjects: [{subject_id, teacher}] } }
 * Teacher names for the child's class (GET /teachers is staff-only). Names only: no phones / e-mails of teachers.
 */
export const GET = api({}, async ({ c, req }) => {
  const q = readQuery(req, z.object({ student_id: uuid }));
  const st = await getVisibleStudent(c, q.student_id);
  const cls = c.classes.find((x) => x.id === st.class_id) ?? null;
  const teachers = await c.db.select("teachers");
  const nameOf = (id: string | null | undefined) => (id ? teachers.find((t) => t.id === id)?.full_name ?? null : null);
  return {
    info: {
      class_name: cls?.name ?? null,
      room: cls?.room ?? null,
      homeroom_teacher: nameOf(cls?.homeroom_teacher_id),
      subjects: c.assignments.filter((a) => a.class_id === st.class_id).map((a) => ({ subject_id: a.subject_id, teacher: nameOf(a.teacher_id) })),
    },
  };
});
