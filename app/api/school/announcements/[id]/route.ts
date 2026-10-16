import { api, idParam, readBody, STAFF } from "@/lib/school/api-helpers";
import { announcementSchema } from "@/lib/school/schemas";
import { deleteAnnouncement, saveAnnouncement } from "@/lib/school/service";

/** PATCH /api/school/announcements/:id (director, or the teacher who wrote it) full body -> { announcement } */
export const PATCH = api({ roles: STAFF, mutate: true }, async ({ c, req, params }) => ({
  announcement: await saveAnnouncement(c, await readBody(req, announcementSchema), idParam(params)),
}));

/** DELETE /api/school/announcements/:id -> { ok } */
export const DELETE = api({ roles: STAFF, mutate: true }, async ({ c, params }) => {
  await deleteAnnouncement(c, idParam(params));
});
