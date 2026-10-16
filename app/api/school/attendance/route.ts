import { SchoolError } from "@/lib/school/errors";
import { api, readQuery } from "@/lib/school/api-helpers";
import { attendanceQuery } from "@/lib/school/schemas";
import { getAttendanceDay, studentAttendance } from "@/lib/school/service";

/**
 * GET /api/school/attendance
 *   ?class_id&date[&lesson_no]  -> { day: AttendanceDay }   roster + status per student (director / teacher of the class)
 *   ?student_id[&from&to]       -> { history }              student's records, summary, per-day statuses (any role that can see the student)
 */
export const GET = api({}, async ({ c, req }) => {
  const q = readQuery(req, attendanceQuery);
  if (q.student_id) return { history: await studentAttendance(c, q.student_id, q.from, q.to) };
  if (q.class_id && q.date) return { day: await getAttendanceDay(c, q.class_id, q.date, q.lesson_no ?? null) };
  throw new SchoolError("invalid_input");
});
