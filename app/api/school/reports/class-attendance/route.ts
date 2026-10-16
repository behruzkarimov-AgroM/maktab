import { SchoolError } from "@/lib/school/errors";
import { api, readQuery, STAFF } from "@/lib/school/api-helpers";
import { classReportQuery } from "@/lib/school/schemas";
import { attendanceSheet } from "@/lib/school/service";

/** GET /api/school/reports/class-attendance?class_id&from&to (max 62 days) -> { report: { dates[], students[{cells[]}] } } class attendance sheet */
export const GET = api({ roles: STAFF }, async ({ c, req }) => {
  const q = readQuery(req, classReportQuery);
  if (!q.from || !q.to) throw new SchoolError("invalid_input");
  return { report: await attendanceSheet(c, q.class_id, q.from, q.to) };
});
