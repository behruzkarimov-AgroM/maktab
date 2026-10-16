import { api, readQuery } from "@/lib/school/api-helpers";
import { gradesQuery } from "@/lib/school/schemas";
import { listGrades } from "@/lib/school/service";

/** GET /api/school/grades?student_id | class_id [&subject_id&term_id] -> { grades: GradeEntry[] } (family only sees own children) */
export const GET = api({}, async ({ c, req }) => ({ grades: await listGrades(c, readQuery(req, gradesQuery)) }));
