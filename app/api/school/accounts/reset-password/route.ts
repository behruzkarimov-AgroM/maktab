import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { resetPassword } from "@/lib/school/provision";
import { resetPasswordSchema } from "@/lib/school/schemas";

/** POST /api/school/accounts/reset-password (director) { user_id, password? } -> { reset: { temp_password, demo } } (temp_password shown once) */
export const POST = api({ roles: DIRECTOR, mutate: true, rate: { max: 30, windowSec: 60 } }, async ({ c, req }) => ({
  reset: await resetPassword(c, await readBody(req, resetPasswordSchema)),
}));
