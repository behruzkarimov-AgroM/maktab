import { api, readBody, STAFF } from "@/lib/school/api-helpers";
import { notifyAbsences, runAfter } from "@/lib/school/notify";
import { attendanceBulkSchema } from "@/lib/school/schemas";
import { markAttendance } from "@/lib/school/service";

/**
 * POST /api/school/attendance/bulk (director / teacher of the class)
 * { class_id, date, lesson_no: number|null, records:[{student_id,status,minutes_late?,note?}] } -> { saved, newly_absent[] }
 * Upserts one record per student/day/lesson. Teachers: not in the future, max 14 days back. Optionally sends Telegram messages (SCHOOL_NOTIFY_ABSENCE=on).
 */
export const POST = api({ roles: STAFF, mutate: true }, async ({ c, req }) => {
  const res = await markAttendance(c, await readBody(req, attendanceBulkSchema, 128 * 1024));
  if (res.newly_absent.length) runAfter(() => notifyAbsences(res.newly_absent));
  return { saved: res.saved, newly_absent: res.newly_absent };
});
