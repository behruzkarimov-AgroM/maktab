import { api, DIRECTOR, idParam, readBody } from "@/lib/school/api-helpers";
import { assignmentSchema } from "@/lib/school/schemas";
import { deleteAssignment, saveAssignment } from "@/lib/school/service";
import type { TeachingAssignment } from "@/lib/school/types";

/** PATCH /api/school/assignments/:id (director) -> { assignment } */
export const PATCH = api({ roles: DIRECTOR, mutate: true }, async ({ c, req, params }) => ({
  assignment: await saveAssignment(c, (await readBody(req, assignmentSchema)) as Omit<TeachingAssignment, "id">, idParam(params)),
}));

/** DELETE /api/school/assignments/:id (director) -> { ok } */
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, params }) => {
  await deleteAssignment(c, idParam(params));
});
