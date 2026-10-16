import { z } from "zod";
import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { guardianLinkSchema, uuid } from "@/lib/school/schemas";
import { linkGuardian, unlinkGuardian } from "@/lib/school/service";

/** POST /api/school/guardians/link (director) { student_id, guardian_id, is_primary? } -> { ok } */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => {
  await linkGuardian(c, await readBody(req, guardianLinkSchema));
});

/** DELETE /api/school/guardians/link (director) JSON { student_id, guardian_id } -> { ok } */
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => {
  const b = await readBody(req, z.object({ student_id: uuid, guardian_id: uuid }));
  await unlinkGuardian(c, b.student_id, b.guardian_id);
});
