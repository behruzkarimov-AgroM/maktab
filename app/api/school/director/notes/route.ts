import { z } from "zod";
import { api, DIRECTOR, readBody, readQuery } from "@/lib/school/api-helpers";
import { dateStr, uuid } from "@/lib/school/schemas";
import * as d from "@/lib/school/svc-director";

const noteSchema = z.object({ student_id: uuid, kind: z.enum(["positive", "negative", "neutral"]), text: z.string().trim().min(1).max(1000), date: dateStr.optional() });
/** GET ?student_id -> { notes } ; POST { student_id, kind, text } -> { note } ; DELETE ?id -> {} (director) */
export const GET = api({ roles: DIRECTOR }, async ({ c, req }) => ({ notes: await d.listNotes(c, readQuery(req, z.object({ student_id: uuid })).student_id) }));
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => ({ note: await d.addNote(c, await readBody(req, noteSchema)) }));
export const DELETE = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => {
  await d.deleteNote(c, readQuery(req, z.object({ id: uuid })).id);
});
