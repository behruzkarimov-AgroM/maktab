import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { subjectSchema } from "@/lib/school/schemas";
import { listSubjects, saveSubject } from "@/lib/school/service";
import type { Subject } from "@/lib/school/types";

/** GET /api/school/subjects -> { subjects[] } (all roles) */
export const GET = api({}, async ({ c }) => ({ subjects: listSubjects(c) }));

/** POST /api/school/subjects (director) { name:{uz,ru,en}, short?, sort_order? } -> { subject } */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({
  subject: await saveSubject(c, (await readBody(req, subjectSchema)) as Omit<Subject, "id">),
}));
