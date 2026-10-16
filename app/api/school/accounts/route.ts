import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { createAccount } from "@/lib/school/provision";
import { accountSchema } from "@/lib/school/schemas";

/**
 * POST /api/school/accounts (director) { kind: "teacher"|"guardian"|"student", id, email, password? } -> { account: { user_id, email, temp_password, demo } }
 * Creates the login (role teacher/parent/student) and links it. temp_password is returned ONCE (null in demo mode).
 */
export const POST = api({ roles: DIRECTOR, mutate: true, rate: { max: 30, windowSec: 60 }, rateKey: "school:accounts" }, async ({ c, req }) => ({
  account: await createAccount(c, await readBody(req, accountSchema)),
}));
