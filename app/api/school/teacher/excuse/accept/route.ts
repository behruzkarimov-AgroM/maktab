import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { excuseAcceptSchema } from "@/lib/school/schemas";
import { acceptExcuse } from "@/lib/school/service";

/**
 * POST /api/school/teacher/excuse/accept { notificationId } -> { excused, notified, student_id, date }
 * The homeroom teacher (addressee of the parent's `absence_excuse` notification) or a director accepts the explanation: the pupil's
 * `absent` record(s) for that date become `excused` (audit `excuse_accept`), the notification is marked read, and the parent receives an
 * `excuse_resolved` notification. Errors: 403 forbidden (not the addressee / not the homeroom teacher), 404 not_found, 409 term_locked,
 * 409 edit_window_closed, 409 already_resolved, 422 invalid_input (wrong notification type).
 */
export const POST = api({ roles: [...DIRECTOR, "teacher"], mutate: true }, async ({ c, req }) => ({
  ...(await acceptExcuse(c, (await readBody(req, excuseAcceptSchema)).notificationId)),
}));
