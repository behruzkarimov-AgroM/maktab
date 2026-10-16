import { z } from "zod";
import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { uuid } from "@/lib/school/schemas";
import * as d from "@/lib/school/svc-director";

const schema = z.object({ target_year_id: uuid, commit: z.boolean().default(false) });
/** POST { target_year_id, commit } (director) -> { plan[], committed, moved, graduated, created_classes }. commit=false only previews. */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => d.rollover(c, await readBody(req, schema)));
