// Service functions: announcements and in-app notifications.
import { SchoolError } from "./errors";
import { isDirector } from "./permissions";
import { forbid, need, type Ctx } from "./svc-core";
import { visibleAnnouncements } from "./svc-analytics";
import { prefsFor } from "./svc-prefs";
import type { Announcement, Audience, Notification } from "./types";

export const listAnnouncements = (c: Ctx, limit = 50) => visibleAnnouncements(c, limit);

export async function saveAnnouncement(
  c: Ctx,
  input: { audience: Audience; class_id?: string | null; title: string; body: string; publish_at?: string; pinned: boolean },
  id?: string,
): Promise<Announcement> {
  const director = isDirector(c.s);
  if (!director) {
    if (c.s.role !== "teacher") forbid();
    if (input.audience !== "class" || !input.class_id || !c.classIds.has(input.class_id)) forbid();
    if (input.pinned) forbid();
  }
  if (input.class_id) need(c.classes.find((x) => x.id === input.class_id));
  if (id) {
    const [existing] = await c.db.select("announcements", { eq: { id } });
    need(existing);
    if (!director && existing.author_id !== c.s.id) forbid();
  }
  const patch = {
    audience: input.audience, class_id: input.audience === "class" ? input.class_id ?? null : null, title: input.title, body: input.body,
    pinned: input.pinned, publish_at: input.publish_at ?? new Date().toISOString(),
  };
  const row = id ? need((await c.db.update("announcements", { eq: { id } }, patch))[0]) : (await c.db.insert("announcements", [{ ...patch, author_id: c.s.id }]))[0];
  await c.db.audit(c.actor, id ? "update" : "create", "announcements", row.id, { audience: row.audience, title: row.title });
  if (!id) await notifyAudience(c, row);
  return row;
}

export async function deleteAnnouncement(c: Ctx, id: string): Promise<void> {
  const [existing] = await c.db.select("announcements", { eq: { id } });
  need(existing);
  if (!isDirector(c.s) && existing.author_id !== c.s.id) forbid();
  await c.db.remove("announcements", { eq: { id } });
  await c.db.audit(c.actor, "delete", "announcements", id);
}

/** in-app notification for every account in the audience (best effort, capped) */
async function notifyAudience(c: Ctx, a: Announcement): Promise<void> {
  try {
    if (Date.parse(a.publish_at) > Date.now() + 60_000) return;
    const users = new Set<string>();
    const add = (ids: (string | null)[]) => ids.forEach((u) => u && users.add(u));
    if (a.audience === "all" || a.audience === "teachers") add((await c.db.select("teachers", { eq: { status: "active" } })).map((t) => t.user_id));
    if (a.audience === "all" || a.audience === "parents") add((await c.db.select("guardians")).map((g) => g.user_id));
    if (a.audience === "all" || a.audience === "students") add((await c.db.select("students", { eq: { status: "active" } })).map((s) => s.user_id));
    if (a.audience === "class" && a.class_id) {
      const sts = await c.db.select("students", { eq: { class_id: a.class_id } });
      add(sts.map((s) => s.user_id));
      const links = sts.length ? await c.db.select("student_guardians", { in: { student_id: sts.map((s) => s.id) } }) : [];
      if (links.length) add((await c.db.select("guardians", { in: { id: [...new Set(links.map((l) => l.guardian_id))] } })).map((g) => g.user_id));
    }
    users.delete(c.s.id);
    const prefs = await prefsFor(c.db, [...users]); // announcement notices can be switched off per account
    for (const u of [...users]) if (prefs.get(u)?.announcements === false) users.delete(u);
    const rows = [...users].slice(0, 500).map((user_id) => ({ user_id, type: "announcement", payload: { announcement_id: a.id, title: a.title } }));
    if (rows.length) await c.db.insert("notifications", rows);
  } catch {
    // never block the announcement
  }
}

export async function listNotifications(c: Ctx, f: { unread?: boolean; limit?: number } = {}): Promise<{ unread: number; items: Notification[] }> {
  const all = await c.db.select("notifications", { eq: { user_id: c.s.id }, order: [["created_at", "desc"]], limit: 200 });
  const items = (f.unread ? all.filter((n) => !n.read_at) : all).slice(0, f.limit ?? 50);
  return { unread: all.filter((n) => !n.read_at).length, items };
}

export async function markNotificationsRead(c: Ctx, input: { ids?: string[]; all?: boolean }): Promise<number> {
  if (!input.all && !input.ids?.length) throw new SchoolError("invalid_input");
  const q = input.all ? { eq: { user_id: c.s.id, read_at: null } } : { eq: { user_id: c.s.id, read_at: null }, in: { id: input.ids! } };
  const rows = await c.db.update("notifications", q, { read_at: new Date().toISOString() });
  return rows.length;
}
