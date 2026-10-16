import { api, readBody, readQuery, STAFF } from "@/lib/school/api-helpers";
import { announcementSchema, announcementsQuery } from "@/lib/school/schemas";
import { listAnnouncements, saveAnnouncement } from "@/lib/school/service";

/** GET /api/school/announcements?limit -> { announcements[] } visible to the role (pinned first) */
export const GET = api({}, async ({ c, req }) => ({ announcements: await listAnnouncements(c, readQuery(req, announcementsQuery).limit) }));

/**
 * POST /api/school/announcements { audience: all|teachers|parents|students|class, class_id?, title, body, publish_at?, pinned? } -> { announcement }
 * Director: any audience. Teacher: only audience=class for a class they teach, not pinned.
 */
export const POST = api({ roles: STAFF, mutate: true }, async ({ c, req }) => ({ announcement: await saveAnnouncement(c, await readBody(req, announcementSchema)) }));
