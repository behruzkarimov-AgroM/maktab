import { api, DIRECTOR, idParam, readBody } from "@/lib/school/api-helpers";
import { classSchema } from "@/lib/school/schemas";
import { deleteClass, saveClass } from "@/lib/school/service";

/** PATCH /api/school/classes/:id (director) full class body -> { class } */
export const PATCH = api({ roles: DIRECTOR, mutate: true }, async ({ c, req, params }) => ({
  class: await saveClass(c, await readBody(req, classSchema), idParam(params)),
}));

/** DELETE /api/school/classes/:id (director) -> { ok } (students stay, class_id becomes null) */
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, params }) => {
  await deleteClass(c, idParam(params));
});
