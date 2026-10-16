import { api, DIRECTOR, idParam, readBody } from "@/lib/school/api-helpers";
import { guardianSchema } from "@/lib/school/schemas";
import { deleteGuardian, saveGuardian } from "@/lib/school/service";

/** PATCH /api/school/guardians/:id (director) -> { guardian } */
export const PATCH = api({ roles: DIRECTOR, mutate: true }, async ({ c, req, params }) => ({
  guardian: await saveGuardian(c, await readBody(req, guardianSchema), idParam(params)),
}));

/** DELETE /api/school/guardians/:id (director) -> { ok } */
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, params }) => {
  await deleteGuardian(c, idParam(params));
});
