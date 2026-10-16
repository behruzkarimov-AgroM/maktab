import { api, DIRECTOR, idParam, readBody } from "@/lib/school/api-helpers";
import { studentPatchSchema } from "@/lib/school/schemas";
import { deleteStudent, getStudent, saveStudent } from "@/lib/school/service";

/** GET /api/school/students/:id -> { student: StudentDetail } (with guardians, stats, risk) */
export const GET = api({}, async ({ c, params }) => ({ student: await getStudent(c, idParam(params)) }));

/** PATCH /api/school/students/:id (director) partial body -> { student } */
export const PATCH = api({ roles: DIRECTOR, mutate: true }, async ({ c, req, params }) => ({
  student: await saveStudent(c, await readBody(req, studentPatchSchema), idParam(params)),
}));

/** DELETE /api/school/students/:id (director) -> { ok } (hard delete; prefer status=transferred/expelled) */
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, params }) => {
  await deleteStudent(c, idParam(params));
});
