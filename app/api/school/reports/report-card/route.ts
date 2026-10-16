import { api, readQuery } from "@/lib/school/api-helpers";
import { reportCardQuery } from "@/lib/school/schemas";
import { reportCard } from "@/lib/school/service";

/** GET /api/school/reports/report-card?student_id[&term_id] -> { report: ReportCard } (term_id omitted = whole year). Any role that can see the student. */
export const GET = api({}, async ({ c, req }) => {
  const q = readQuery(req, reportCardQuery);
  return { report: await reportCard(c, q.student_id, q.term_id) };
});
