import { z } from "zod";
import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import * as d from "@/lib/school/svc-director";

const schema = z.object({ user_id: z.string().min(1).max(80), active: z.boolean() });
/** POST { user_id, active } (director) -> { user_id, active }. Deactivate / reactivate a login (profiles.is_active). */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => d.setAccountActive(c, await readBody(req, schema)));
