import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { termLockSchema } from "@/lib/school/schemas";
import { lockTerm } from "@/lib/school/service";

/** POST /api/school/years-terms/lock (director) { term_id, locked } -> { term_id, is_locked }. Locked terms reject grade edits from teachers. */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => {
  const b = await readBody(req, termLockSchema);
  return { ...(await lockTerm(c, b.term_id, b.locked)) };
});
