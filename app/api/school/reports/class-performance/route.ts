import { api, readQuery, STAFF } from "@/lib/school/api-helpers";
import { classReportQuery } from "@/lib/school/schemas";
import { classPerformance } from "@/lib/school/service";

/** GET /api/school/reports/class-performance?class_id[&term_id] -> { report: { students[{average,rank,attendance_percent,streak,risk}], class_average, distribution[], subject_averages[] } } */
export const GET = api({ roles: STAFF }, async ({ c, req }) => {
  const q = readQuery(req, classReportQuery);
  return { report: await classPerformance(c, q.class_id, q.term_id) };
});
