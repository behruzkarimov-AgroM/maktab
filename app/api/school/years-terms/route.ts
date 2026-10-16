import { z } from "zod";
import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { termSchema, yearSchema } from "@/lib/school/schemas";
import { listYearsTerms, saveTerm, saveYear } from "@/lib/school/service";
import type { SchoolYear, Term } from "@/lib/school/types";

/** GET /api/school/years-terms -> { years[], terms[], current_year_id } (all roles) */
export const GET = api({}, async ({ c }) => ({ ...(await listYearsTerms(c)) }));

const createSchema = z.discriminatedUnion("kind", [yearSchema.extend({ kind: z.literal("year") }), termSchema.extend({ kind: z.literal("term") })]);

/** POST /api/school/years-terms (director) { kind:"year", name, start_date, end_date, is_current?, grading_rules? } | { kind:"term", year_id, number, name, start_date, end_date } -> { year } | { term } */
export const POST = api({ roles: DIRECTOR, mutate: true }, async ({ c, req }) => {
  const b = await readBody(req, createSchema);
  if (b.kind === "year") {
    const { kind, ...rest } = b;
    void kind;
    return { year: await saveYear(c, rest as unknown as Omit<SchoolYear, "id" | "is_current">) };
  }
  const { kind, ...rest } = b;
  void kind;
  return { term: await saveTerm(c, rest as unknown as Omit<Term, "id" | "is_locked">) };
});
