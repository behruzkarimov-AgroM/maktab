import { api, DIRECTOR, idParam, readBody } from "@/lib/school/api-helpers";
import { slotSchema } from "@/lib/school/schemas";
import { deleteSlot, saveSlot } from "@/lib/school/service";
import type { ScheduleSlot } from "@/lib/school/types";

/** PATCH /api/school/schedule/:id (director) -> { slot } */
export const PATCH = api({ roles: DIRECTOR, mutate: true }, async ({ c, req, params }) => ({
  slot: await saveSlot(c, (await readBody(req, slotSchema)) as Omit<ScheduleSlot, "id">, idParam(params)),
}));

/** DELETE /api/school/schedule/:id (director) -> { ok } */
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, params }) => {
  await deleteSlot(c, idParam(params));
});
