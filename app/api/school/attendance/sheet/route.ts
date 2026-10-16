import { z } from "zod";
import { api, readQuery, STAFF } from "@/lib/school/api-helpers";
import { dateStr, uuid } from "@/lib/school/schemas";
import { attendanceSheet } from "@/lib/school/service";

/** GET /api/school/attendance/sheet?class_id&from&to (max 62 days) -> { sheet: { dates[], students:[{student_id,last_name,first_name,cells[]}] } } printable class sheet */
export const GET = api({ roles: STAFF }, async ({ c, req }) => {
  const q = readQuery(req, z.object({ class_id: uuid, from: dateStr, to: dateStr }));
  return { sheet: await attendanceSheet(c, q.class_id, q.from, q.to) };
});
