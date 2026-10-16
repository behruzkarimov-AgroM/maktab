import { api, DIRECTOR, idParam, readBody } from "@/lib/school/api-helpers";
import { subjectSchema } from "@/lib/school/schemas";
import { deleteSubject, saveSubject } from "@/lib/school/service";
import type { Subject } from "@/lib/school/types";

/** PATCH /api/school/subjects/:id (director) -> { subject } */
export const PATCH = api({ roles: DIRECTOR, mutate: true }, async ({ c, req, params }) => ({
  subject: await saveSubject(c, (await readBody(req, subjectSchema)) as Omit<Subject, "id">, idParam(params)),
}));

/** DELETE /api/school/subjects/:id (director) -> { ok } (also removes its assignments, slots, grades) */
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, params }) => {
  await deleteSubject(c, idParam(params));
});
