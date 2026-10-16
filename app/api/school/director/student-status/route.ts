import { z } from "zod";
import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { uuid } from "@/lib/school/schemas";
import * as d from "@/lib/school/svc-director";

const schema = z.object({ student_id: uuid, status: z.enum(["active", "transferred", "graduated", "expelled"]), reason: z.string().trim().min(1).max(500) });
/** POST { student_id, status, reason } (director) -> { student }. Writes audit + a neutral note. */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({ student: await d.changeStudentStatus(c, await readBody(req, schema)) }));
