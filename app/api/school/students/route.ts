import { api, DIRECTOR, readBody, readQuery } from "@/lib/school/api-helpers";
import { studentSchema, studentsQuery } from "@/lib/school/schemas";
import { listStudents, saveStudent } from "@/lib/school/service";

/** GET /api/school/students?class_id&status&q&with_stats=1&limit&offset -> { total, students[] } (scoped by role) */
export const GET = api({}, async ({ c, req }) => {
  const f = readQuery(req, studentsQuery);
  return { ...(await listStudents(c, { ...f, with_stats: f.with_stats === "1" })) };
});

/** POST /api/school/students (director) -> { student } */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({ student: await saveStudent(c, await readBody(req, studentSchema)) }));
