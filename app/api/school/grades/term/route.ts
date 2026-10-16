import { api, readBody, readQuery, STAFF } from "@/lib/school/api-helpers";
import { termGradesBulkSchema, termGradesQuery } from "@/lib/school/schemas";
import { saveTermGrades, termGradesTable } from "@/lib/school/service";

/** GET /api/school/grades/term?class_id&subject_id&term_id -> { table: { rows:[{student_id,average,entry_count,suggested,value,is_confirmed}], term_locked, can_edit } } */
export const GET = api({ roles: STAFF }, async ({ c, req }) => {
  const q = readQuery(req, termGradesQuery);
  return { table: await termGradesTable(c, q.class_id, q.subject_id, q.term_id) };
});

/** POST /api/school/grades/term { class_id, subject_id, term_id, rows:[{student_id, value:1..5|null}] } -> { saved }; confirms the term (chorak) grade, null clears it */
export const POST = api({ roles: STAFF, mutate: true }, async ({ c, req }) => ({ ...(await saveTermGrades(c, await readBody(req, termGradesBulkSchema))) }));
