import { z } from "zod";
import { api, DIRECTOR, idParam, readBody } from "@/lib/school/api-helpers";
import { termSchema, yearSchema } from "@/lib/school/schemas";
import { saveTerm, saveYear } from "@/lib/school/service";
import type { SchoolYear, Term } from "@/lib/school/types";

const updateSchema = z.discriminatedUnion("kind", [yearSchema.extend({ kind: z.literal("year") }), termSchema.extend({ kind: z.literal("term") })]);

/** PATCH /api/school/years-terms/:id (director) same body as POST (kind = "year" | "term") -> { year } | { term } */
export const PATCH = api({ roles: DIRECTOR, mutate: true }, async ({ c, req, params }) => {
  const id = idParam(params);
  const b = await readBody(req, updateSchema);
  const { kind, ...rest } = b;
  if (kind === "year") return { year: await saveYear(c, rest as unknown as Omit<SchoolYear, "id" | "is_current">, id) };
  return { term: await saveTerm(c, rest as unknown as Omit<Term, "id" | "is_locked">, id) };
});
