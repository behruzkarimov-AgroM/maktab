import { api, readBody, readQuery, STAFF } from "@/lib/school/api-helpers";
import { lessonSchema, lessonsQuery } from "@/lib/school/schemas";
import { listLessons, saveLesson } from "@/lib/school/service";

/** GET /api/school/lessons?class_id&from&to -> { lessons[] } (topic + homework per lesson; family may read their class) */
export const GET = api({}, async ({ c, req }) => ({ lessons: await listLessons(c, readQuery(req, lessonsQuery)) }));

/** POST /api/school/lessons (teacher of the subject in the class, or director) { class_id, subject_id, date, lesson_no, topic?, homework? } -> { lesson } (upsert) */
export const POST = api({ roles: STAFF, mutate: true }, async ({ c, req }) => ({ lesson: await saveLesson(c, await readBody(req, lessonSchema)) }));
