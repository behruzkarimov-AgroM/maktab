import { SchoolError } from "@/lib/school/errors";
import { api, DIRECTOR, readBody } from "@/lib/school/api-helpers";
import { MAX_IMPORT_BYTES } from "@/lib/school/import-parse";
import { importCommitSchema } from "@/lib/school/schemas";
import { commitStudentImport, parseWorkbook, previewStudentImport } from "@/lib/school/service";

/**
 * POST /api/school/import/students (director)
 *  - multipart/form-data with `file` (.xlsx/.xls/.csv, max 2 MB, 1000 rows) -> { preview: ImportPreview }   (nothing is written)
 *  - application/json { rows:[...], on_duplicate: "skip"|"update" } -> { result: { created, updated, skipped, invalid, errors[] } }   (commit; re-validated server side)
 * Duplicates: same student_code, or same last+first name and birth date.
 */
export const POST = api({ roles: DIRECTOR, mutate: true, json: false }, async ({ c, req }) => {
  const ct = req.headers.get("content-type") ?? "";
  if (/^multipart\/form-data/i.test(ct)) {
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_IMPORT_BYTES + 4096) throw new SchoolError("payload_too_large", 413);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new SchoolError("invalid_input");
    if (file.size > MAX_IMPORT_BYTES) throw new SchoolError("payload_too_large", 413);
    return { preview: await previewStudentImport(c, parseWorkbook(await file.arrayBuffer())) };
  }
  if (/^application\/json/i.test(ct)) {
    return { result: await commitStudentImport(c, await readBody(req, importCommitSchema, 1024 * 1024)) };
  }
  throw new SchoolError("unsupported", 415);
});
