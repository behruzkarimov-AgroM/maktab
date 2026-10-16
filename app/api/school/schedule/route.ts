import { api, DIRECTOR, readBody, readQuery } from "@/lib/school/api-helpers";
import { scheduleQuery, slotSchema } from "@/lib/school/schemas";
import { listSchedule, saveSlot } from "@/lib/school/service";
import type { ScheduleSlot } from "@/lib/school/types";

/** GET /api/school/schedule?class_id | teacher_id -> { slots[] } sorted by weekday, lesson_no. No filter = everything the role may see (teacher: own slots) */
export const GET = api({}, async ({ c, req }) => ({ slots: await listSchedule(c, readQuery(req, scheduleQuery)) }));

/** POST /api/school/schedule (director) slot body -> { slot }; 409 conflict if the class cell or the teacher is already taken */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({
  slot: await saveSlot(c, (await readBody(req, slotSchema)) as Omit<ScheduleSlot, "id">),
}));
