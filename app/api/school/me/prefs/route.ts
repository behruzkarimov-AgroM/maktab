import { api, readBody } from "@/lib/school/api-helpers";
import { prefsSchema } from "@/lib/school/schemas";
import { getPrefs, savePrefs } from "@/lib/school/service";

/**
 * GET /api/school/me/prefs -> { prefs: { telegram, email, absence, low_grade, announcements, updated_at } } (all roles, own row; no row = all true)
 * Meaning: `absence` = in-app + Telegram absence notices for a guardian, `telegram` / `email` = channel switches, `announcements` = in-app announcement
 * notices, `low_grade` is stored for the upcoming low-grade notice. Absence and announcement notices already honour these flags.
 */
export const GET = api({}, async ({ c }) => ({ prefs: await getPrefs(c) }));

/** PUT /api/school/me/prefs { telegram?, email?, absence?, low_grade?, announcements? } (at least one) -> { prefs } */
export const PUT = api({ mutate: true }, async ({ c, req }) => ({ prefs: await savePrefs(c, await readBody(req, prefsSchema)) }));
