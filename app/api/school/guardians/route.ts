import { z } from "zod";
import { api, DIRECTOR, readBody, readQuery } from "@/lib/school/api-helpers";
import { guardianSchema, uuid } from "@/lib/school/schemas";
import { listGuardians, saveGuardian } from "@/lib/school/service";

/** GET /api/school/guardians?student_id -> { guardians[] } (director: all when no student_id; teacher/parent: guardians of a visible student; students: forbidden) */
export const GET = api({}, async ({ c, req }) => ({ guardians: await listGuardians(c, readQuery(req, z.object({ student_id: uuid.optional() }))) }));

/** POST /api/school/guardians (director) { full_name, relation?, phone?, email?, telegram_chat_id?, student_id?, is_primary? } -> { guardian } (links to student_id when given) */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({ guardian: await saveGuardian(c, await readBody(req, guardianSchema)) }));
