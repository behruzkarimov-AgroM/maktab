import { api, readBody, readQuery } from "@/lib/school/api-helpers";
import { notificationReadSchema, notificationsQuery } from "@/lib/school/schemas";
import { listNotifications, markNotificationsRead } from "@/lib/school/service";

/** GET /api/school/notifications?unread=1&limit -> { unread: number, items: Notification[] } (own notifications) */
export const GET = api({}, async ({ c, req }) => {
  const q = readQuery(req, notificationsQuery);
  return { ...(await listNotifications(c, { unread: q.unread === "1", limit: q.limit })) };
});

/** POST /api/school/notifications { ids?: uuid[], all?: boolean } -> { marked } marks as read */
export const POST = api({ mutate: true }, async ({ c, req }) => ({ marked: await markNotificationsRead(c, await readBody(req, notificationReadSchema)) }));
