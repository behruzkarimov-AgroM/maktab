import { z } from "zod";
import { api, readQuery } from "@/lib/school/api-helpers";
import { dateStr, uuid } from "@/lib/school/schemas";
import { attendanceSummary } from "@/lib/school/service";

/** GET /api/school/attendance/summary?class_id[&from&to] -> { summary: { rows: AttendanceSummaryRow[], totals } } (default: school year to date) */
export const GET = api({}, async ({ c, req }) => {
  const q = readQuery(req, z.object({ class_id: uuid, from: dateStr.optional(), to: dateStr.optional() }));
  return { summary: await attendanceSummary(c, q.class_id, q.from, q.to) };
});
