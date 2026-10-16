import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { teacherSchema } from "@/lib/school/schemas";
import { listTeachers, saveTeacher } from "@/lib/school/service";

/** GET /api/school/teachers -> { teachers[] } director: all; teacher: only self. Each has classes[], homeroom_of[], hours_per_week */
export const GET = api({ roles: ["super_admin", "school_admin", "teacher"] }, async ({ c }) => ({ teachers: await listTeachers(c) }));

/** POST /api/school/teachers (director) -> { teacher } */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({ teacher: await saveTeacher(c, await readBody(req, teacherSchema)) }));
