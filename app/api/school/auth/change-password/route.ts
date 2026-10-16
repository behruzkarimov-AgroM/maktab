import { api, readBody } from "@/lib/school/api-helpers";
import { changePassword } from "@/lib/school/account";
import { changePasswordSchema } from "@/lib/school/schemas";

/**
 * POST /api/school/auth/change-password { current_password, new_password } -> { changed: true }
 * Any signed-in school user (also while `must_change_password` is set). Errors: 403 wrong_password, 422 weak_password
 * (8-72 chars, a letter and a digit, not common, not the e-mail name, different from the current one), 429 rate_limited (5 / 10 min).
 */
export const POST = api({ mutate: true, allowMustChange: true, rate: { max: 5, windowSec: 600 }, rateKey: "school:chpw" }, async ({ s, req }) => {
  const b = await readBody(req, changePasswordSchema, 4096);
  await changePassword(s, b.current_password, b.new_password);
  return { changed: true };
});
