import { api, DIRECTOR, readBody, readQuery } from "@/lib/school/api-helpers";
import { assignmentSchema, assignmentsQuery } from "@/lib/school/schemas";
import { listAssignments, saveAssignment } from "@/lib/school/service";
import type { TeachingAssignment } from "@/lib/school/types";

/** GET /api/school/assignments?class_id&teacher_id -> { assignments[] } (scoped by role) */
export const GET = api({}, async ({ c, req }) => ({ assignments: await listAssignments(c, readQuery(req, assignmentsQuery)) }));

/** POST /api/school/assignments (director) { class_id, subject_id, teacher_id, hours_per_week? } -> { assignment }; 409 conflict if the class already has this subject */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({
  assignment: await saveAssignment(c, (await readBody(req, assignmentSchema)) as Omit<TeachingAssignment, "id">),
}));
