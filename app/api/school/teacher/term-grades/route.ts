import { z } from "zod";
import { api, readBody } from "@/lib/school/api-helpers";
import { termGradesBulkSchema, uuid } from "@/lib/school/schemas";
import { saveTermGrades } from "@/lib/school/service";

const body = termGradesBulkSchema.extend({
  /** legacy shape: why the confirmed value differs from the suggestion, keyed by student id (merged into rows[].override_reason) */
  reasons: z.record(uuid, z.string().trim().max(300)).optional(),
});

/**
 * POST /api/school/teacher/term-grades { class_id, subject_id, term_id, rows:[{student_id,value,override_reason?}], reasons?: {student_id: text} } -> { saved }
 * Same as POST /grades/term. The override reason is stored in term_grades.override_reason (and mirrored to audit_log).
 */
export const POST = api({ roles: ["teacher"], mutate: true }, async ({ c, req }) => {
  const { reasons, ...input } = await readBody(req, body);
  const rows = input.rows.map((r) => ({ ...r, override_reason: r.override_reason ?? reasons?.[r.student_id] ?? null }));
  const res = await saveTermGrades(c, { ...input, rows });
  const overrides = rows.filter((r) => r.override_reason).map((r) => ({ student_id: r.student_id, reason: r.override_reason, value: r.value }));
  if (overrides.length) {
    try {
      await c.db.audit(c.actor, "term_grade_override", "term_grades", input.class_id, { subject_id: input.subject_id, term_id: input.term_id, overrides });
    } catch {
      // the audit mirror is best effort
    }
  }
  return res;
});
