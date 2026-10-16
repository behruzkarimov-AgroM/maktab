import { api, DIRECTOR, idParam, readBody } from "@/lib/school/api-helpers";
import { teacherSchema } from "@/lib/school/schemas";
import { deleteTeacher, saveTeacher } from "@/lib/school/service";

/** PATCH /api/school/teachers/:id (director) -> { teacher } */
export const PATCH = api({ roles: DIRECTOR, mutate: true }, async ({ c, req, params }) => ({
  teacher: await saveTeacher(c, await readBody(req, teacherSchema), idParam(params)),
}));

/** DELETE /api/school/teachers/:id (director) -> { ok } (assignments removed; homeroom/slots set to null) */
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, params }) => {
  await deleteTeacher(c, idParam(params));
});
