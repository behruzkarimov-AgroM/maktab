import { z } from "zod";
import { api, DIRECTOR, readQuery } from "@/lib/school/api-helpers";
import { uuid } from "@/lib/school/schemas";
import * as d from "@/lib/school/svc-director";

/** GET ?term_id (director) -> { term_id, rows:[{class_id,class_name,subject_id,teacher_id,teacher_name,total,confirmed}] } */
export const GET = api({ roles: DIRECTOR }, async ({ c, req }) => d.termStatus(c, readQuery(req, z.object({ term_id: uuid })).term_id));
