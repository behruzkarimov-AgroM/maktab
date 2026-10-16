// Notification preferences (table school_notification_prefs): one row per account, no row = everything on.
import type { SchoolDb } from "./db";
import { SchoolError } from "./errors";
import type { Ctx } from "./svc-core";
import { DEFAULT_PREFS, type PrefsFields } from "./types";

/** Channels the server cannot deliver on. E-mail notices are not implemented: the flag is always reported (and stored) as false. */
export const UNAVAILABLE_CHANNELS = ["email"] as const;

export type PrefsView = PrefsFields & { updated_at: string | null; unavailable: string[] };

const pick = (r: Partial<PrefsFields> | undefined): PrefsFields => ({
  telegram: r?.telegram ?? DEFAULT_PREFS.telegram,
  email: false, // not available (no e-mail channel): never reported as on
  absence: r?.absence ?? DEFAULT_PREFS.absence,
  low_grade: r?.low_grade ?? DEFAULT_PREFS.low_grade,
  announcements: r?.announcements ?? DEFAULT_PREFS.announcements,
});

export async function getPrefs(c: Ctx): Promise<PrefsView> {
  const [row] = await c.db.select("school_notification_prefs", { eq: { user_id: c.s.id } });
  return { ...pick(row), updated_at: row?.updated_at ?? null, unavailable: [...UNAVAILABLE_CHANNELS] };
}

export async function savePrefs(c: Ctx, patch: Partial<PrefsFields>): Promise<PrefsView> {
  if (patch.email === true) throw new SchoolError("channel_unavailable", 422);
  const [row] = await c.db.select("school_notification_prefs", { eq: { user_id: c.s.id } });
  const next = { ...pick(row), ...patch };
  const [saved] = await c.db.upsert("school_notification_prefs", [{ user_id: c.s.id, ...next, updated_at: new Date().toISOString() }], ["user_id"]);
  return { ...pick(saved), updated_at: saved?.updated_at ?? null, unavailable: [...UNAVAILABLE_CHANNELS] };
}

/** switches of many accounts at once (accounts without a row get the defaults). Never throws: on error everybody is "all on". */
export async function prefsFor(db: SchoolDb, userIds: string[]): Promise<Map<string, PrefsFields>> {
  const out = new Map<string, PrefsFields>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return out;
  try {
    for (let i = 0; i < ids.length; i += 200) {
      for (const r of await db.select("school_notification_prefs", { in: { user_id: ids.slice(i, i + 200) } })) out.set(r.user_id, pick(r));
    }
  } catch {
    // preferences must never block a notification
  }
  for (const id of ids) if (!out.has(id)) out.set(id, { ...DEFAULT_PREFS });
  return out;
}
