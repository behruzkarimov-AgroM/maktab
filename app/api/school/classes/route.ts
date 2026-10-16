import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { classSchema } from "@/lib/school/schemas";
import { listClasses, saveClass } from "@/lib/school/service";

/** GET /api/school/classes -> { classes[] } with student_count (director) and homeroom_teacher_name; scoped by role */
export const GET = api({}, async ({ c }) => ({ classes: await listClasses(c) }));

/** POST /api/school/classes (director) { grade, letter, homeroom_teacher_id?, room?, year_id? } -> { class } */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({ class: await saveClass(c, await readBody(req, classSchema)) }));
