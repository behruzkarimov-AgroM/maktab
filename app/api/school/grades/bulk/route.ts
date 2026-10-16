import { api, readBody, STAFF } from "@/lib/school/api-helpers";
import { notifyLowGrades, runAfter } from "@/lib/school/notify";
import { gradesBulkSchema } from "@/lib/school/schemas";
import { saveGrades } from "@/lib/school/service";

/**
 * POST /api/school/grades/bulk -> { saved, deleted, newly_low: [{student_id, subject_id, score, date}] }
 * New grades <= 2 create an in-app `low_grade` notice for the guardians (opt-out via prefs.low_grade) and, with SCHOOL_NOTIFY_GRADES=on,
 * a Telegram message to guardians that have a chat id (prefs.telegram + prefs.low_grade respected).
 */
export const POST = api({ roles: STAFF, mutate: true }, async ({ c, req }) => {
  const res = await saveGrades(c, await readBody(req, gradesBulkSchema, 256 * 1024));
  if (res.newly_low.length) runAfter(() => notifyLowGrades(res.newly_low));
  return { ...res };
});
