import { api, readQuery, STAFF } from "@/lib/school/api-helpers";
import { gradebookQuery } from "@/lib/school/schemas";
import { gradebook } from "@/lib/school/service";

/** GET /api/school/grades/gradebook?class_id&subject_id&term_id -> { gradebook: Gradebook } journal matrix with averages + suggestions */
export const GET = api({ roles: STAFF }, async ({ c, req }) => {
  const q = readQuery(req, gradebookQuery);
  return { gradebook: await gradebook(c, q.class_id, q.subject_id, q.term_id) };
});
