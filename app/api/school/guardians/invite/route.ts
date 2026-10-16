import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { inviteGuardian } from "@/lib/school/provision";
import { inviteGuardianSchema } from "@/lib/school/schemas";

/**
 * POST /api/school/guardians/invite (director)
 *   { guardian_id? | full_name + relation? + phone?, email, student_ids: uuid[], is_primary?, password? }
 *   -> { invite: { guardian, account: { user_id, email, temp_password, demo, must_change_password } | null, linked } }
 * Creates the guardian when `guardian_id` is omitted, links the given children, provisions the parent login with a TEMPORARY password
 * (shown once; the parent must change it at first login) and returns it. A guardian that already has a login only gets the children linked
 * (account = null). 409 conflict when the e-mail is already registered.
 */
export const POST = api({ roles: DIRECTOR, mutate: true, rate: { max: 30, windowSec: 60 }, rateKey: "school:accounts" }, async ({ c, req }) => ({
  invite: await inviteGuardian(c, await readBody(req, inviteGuardianSchema)),
}));
