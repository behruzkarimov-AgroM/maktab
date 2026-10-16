// Student import: parse xlsx/csv -> validate -> preview -> commit (directors only).
import * as XLSX from "xlsx";
import { SchoolError } from "./errors";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, mapRows, nameKey, normalizeClassName, validateImport, type RawRow } from "./import-parse";
import { requireDirector, type Ctx } from "./svc-core";
import { saveStudent } from "./svc-people";
import type { ImportPreview, Student } from "./types";

export function parseWorkbook(buf: ArrayBuffer | Uint8Array): RawRow[] {
  const size = buf instanceof ArrayBuffer ? buf.byteLength : buf.length;
  if (size === 0 || size > MAX_IMPORT_BYTES) throw new SchoolError("payload_too_large", 413);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array", cellDates: false });
  } catch {
    throw new SchoolError("unsupported", 415);
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new SchoolError("unsupported", 415);
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: true });
  if (rows.length > MAX_IMPORT_ROWS) throw new SchoolError("payload_too_large", 413);
  return rows;
}

export async function previewStudentImport(c: Ctx, raw: RawRow[]): Promise<ImportPreview> {
  requireDirector(c);
  const existing = await c.db.select("students");
  return validateImport(mapRows(raw), existing, c.classes);
}

export async function commitStudentImport(
  c: Ctx,
  input: { rows: { first_name: string; last_name: string; middle_name?: string | null; birth_date?: string | null; gender?: "m" | "f" | null; class_name?: string | null; student_code?: string | null; phone?: string | null; address?: string | null; guardian_name?: string | null; guardian_phone?: string | null }[]; on_duplicate: "skip" | "update" },
) {
  requireDirector(c);
  // never trust the preview: validate again on the server
  const existing = await c.db.select("students");
  const parsed = input.rows.map((r, i) => ({
    row: i + 1, last_name: r.last_name, first_name: r.first_name, middle_name: r.middle_name ?? "", birth_date: r.birth_date ?? "", gender: r.gender ?? "",
    class_name: normalizeClassName(r.class_name ?? ""), student_code: r.student_code ?? "", phone: r.phone ?? "", address: r.address ?? "",
    guardian_name: r.guardian_name ?? "", guardian_phone: r.guardian_phone ?? "",
  }));
  const preview = validateImport(parsed, existing, c.classes);
  const byCode = new Map(existing.map((s) => [s.student_code.toLowerCase(), s]));
  const byName = new Map(existing.map((s) => [nameKey(s.last_name, s.first_name, s.birth_date), s]));
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { row: number; errors: string[] }[] = [];
  for (const r of preview.rows) {
    if (!r.ok) {
      errors.push({ row: r.row, errors: r.errors });
      continue;
    }
    const d = r.data!;
    const cls = d.class_name ? c.classes.find((x) => normalizeClassName(x.name) === d.class_name) : undefined;
    const patch: Partial<Student> = {
      first_name: d.first_name, last_name: d.last_name, middle_name: d.middle_name ?? null, birth_date: d.birth_date ?? null, gender: d.gender ?? null,
      class_id: cls?.id ?? null, phone: d.phone ?? null, address: d.address ?? null,
    };
    if (r.duplicate !== "none") {
      const hit = r.duplicate === "student_code" ? byCode.get(d.student_code!.toLowerCase()) : byName.get(nameKey(d.last_name!, d.first_name!, d.birth_date ?? null));
      if (input.on_duplicate === "update" && hit) {
        await saveStudent(c, { ...patch, class_id: cls?.id ?? hit.class_id }, hit.id);
        updated++;
      } else skipped++;
      continue;
    }
    const st = await saveStudent(c, { ...patch, student_code: d.student_code });
    byCode.set(st.student_code.toLowerCase(), st);
    byName.set(nameKey(st.last_name, st.first_name, st.birth_date), st);
    created++;
    if (d.guardian_name) {
      const g = (await c.db.insert("guardians", [{ full_name: d.guardian_name, relation: "parent", phone: d.guardian_phone ?? null }]))[0];
      await c.db.insert("student_guardians", [{ student_id: st.id, guardian_id: g.id, is_primary: true }]);
    }
  }
  await c.db.audit(c.actor, "import_students", "students", null, { created, updated, skipped, invalid: errors.length });
  return { created, updated, skipped, invalid: errors.length, errors };
}
