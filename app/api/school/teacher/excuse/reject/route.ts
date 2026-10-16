import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { excuseRejectSchema } from "@/lib/school/schemas";
import { rejectExcuse } from "@/lib/school/service";

/**
 * POST /api/school/teacher/excuse/reject { notificationId, comment } -> { rejected:true, notified, student_id, date }
 * The homeroom teacher (addressee of the parent's `absence_excuse` notification) or a director rejects the explanation: attendance stays
 * `absent` (audit `excuse_reject`), the notification is marked read, and the parent receives an `excuse_resolved` notification with
 * `status:"rejected"` and the teacher's `comment` (3..300 characters, required). Errors: 403 forbidden (not the homeroom teacher),
 * 404 not_found, 409 already_resolved / term_locked, 422 validation.
 */
export const POST = api({ roles: [...DIRECTOR, "teacher"], mutate: true }, async ({ c, req }) => {
  const b = await readBody(req, excuseRejectSchema);
  return { ...(await rejectExcuse(c, b.notificationId, b.comment)) };
});
