import { api, readQuery } from "@/lib/school/api-helpers";
import { classAverageQuery } from "@/lib/school/schemas";
import { classAverage } from "@/lib/school/service";

/**
 * GET /api/school/family/class-average?student=<uuid>[&term=<uuid>] (parent: own child, student: self)
 * -> { student_id, class_id, term_id, min_students: 5, subjects: [{ subject_id, average: number|null }] }
 * `average` = mean of the class pupils' subject averages for the term, and ONLY when >= 5 pupils of the class have grades in that
 * subject (otherwise null). No individual data and no counts are returned. `term` defaults to the current term.
 */
export const GET = api({ roles: ["parent", "student"] }, async ({ c, req }) => {
  const q = readQuery(req, classAverageQuery);
  return { ...(await classAverage(c, q.student, q.term)) };
});
