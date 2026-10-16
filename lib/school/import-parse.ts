// Pure helpers for the student import (xlsx / csv): header mapping, value normalisation, validation, duplicate detection.
import type { ImportPreview, ImportRowResult, SchoolClass, Student } from "./types";
import { isValidDate } from "./grading";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type RawRow = Record<string, unknown>;

const ALIASES: Record<string, string[]> = {
  last_name: ["last_name", "lastname", "last name", "surname", "familiya", "familiyasi", "фамилия"],
  first_name: ["first_name", "firstname", "first name", "name", "ism", "ismi", "имя"],
  middle_name: ["middle_name", "middlename", "middle name", "otasining ismi", "sharif", "отчество"],
  birth_date: ["birth_date", "birthdate", "birth date", "date of birth", "dob", "tugilgan sana", "tugʻilgan sana", "tug'ilgan sana", "дата рождения"],
  gender: ["gender", "sex", "jins", "пол"],
  class_name: ["class", "class_name", "sinf", "класс"],
  student_code: ["student_code", "code", "id", "kod", "код", "student id"],
  phone: ["phone", "telefon", "телефон"],
  address: ["address", "manzil", "адрес"],
  guardian_name: ["guardian_name", "guardian", "parent", "ota-ona", "ota-onasi", "родитель"],
  guardian_phone: ["guardian_phone", "parent_phone", "ota-ona telefoni", "телефон родителя"],
};
const norm = (h: string) => h.toLowerCase().replace(/[’`ʻʼ]/g, "'").replace(/\s+/g, " ").trim();
const HEADER_MAP = new Map<string, string>();
for (const [field, names] of Object.entries(ALIASES)) for (const n of names) HEADER_MAP.set(norm(n), field);

export interface ParsedRow {
  row: number; // 1-based spreadsheet data row (header excluded)
  last_name: string;
  first_name: string;
  middle_name: string;
  birth_date: string;
  gender: string;
  class_name: string;
  student_code: string;
  phone: string;
  address: string;
  guardian_name: string;
  guardian_phone: string;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());

/** Excel serial -> ISO date; common textual formats -> ISO date; otherwise the original text. */
export function normalizeDate(v: unknown): string {
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const s = str(v);
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

export function normalizeGender(v: unknown): "m" | "f" | "" | "?" {
  const s = str(v).toLowerCase();
  if (!s) return "";
  if (["m", "male", "erkak", "o'g'il", "oʻgʻil", "м", "муж", "мужской", "boy"].includes(s)) return "m";
  if (["f", "female", "ayol", "qiz", "ж", "жен", "женский", "girl"].includes(s)) return "f";
  return "?";
}

/** "5-A", "5 a", "5А" (cyrillic) -> "5A" */
export function normalizeClassName(v: unknown): string {
  return str(v).toUpperCase().replace(/[\s-]/g, "").replace(/А/g, "A").replace(/В/g, "B").replace(/С/g, "C");
}

/** maps spreadsheet rows (keys = headers) to canonical fields; unknown columns are ignored */
export function mapRows(raw: RawRow[]): ParsedRow[] {
  return raw.slice(0, MAX_IMPORT_ROWS).map((r, i) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const f = HEADER_MAP.get(norm(k));
      if (f && o[f] === undefined) o[f] = v;
    }
    return {
      row: i + 1,
      last_name: str(o.last_name), first_name: str(o.first_name), middle_name: str(o.middle_name),
      birth_date: normalizeDate(o.birth_date), gender: o.gender === undefined ? "" : String(normalizeGender(o.gender)),
      class_name: normalizeClassName(o.class_name), student_code: str(o.student_code), phone: str(o.phone), address: str(o.address),
      guardian_name: str(o.guardian_name), guardian_phone: str(o.guardian_phone),
    };
  });
}

export const nameKey = (last: string, first: string, birth: string | null) => `${last}|${first}|${birth ?? ""}`.toLowerCase();

/**
 * Validates parsed rows against the existing students and classes.
 * duplicate = existing (or earlier-in-file) student with the same student_code, or the same last+first name and birth date.
 */
export function validateImport(
  rows: ParsedRow[],
  existing: Pick<Student, "student_code" | "last_name" | "first_name" | "birth_date">[],
  classes: Pick<SchoolClass, "name">[],
): ImportPreview {
  const codes = new Set(existing.map((s) => s.student_code.toLowerCase()));
  const names = new Set(existing.map((s) => nameKey(s.last_name, s.first_name, s.birth_date)));
  const classSet = new Set(classes.map((c) => normalizeClassName(c.name)));
  const out: ImportRowResult[] = rows.map((r) => {
    const errors: string[] = [];
    if (!r.last_name) errors.push("last_name_required");
    if (!r.first_name) errors.push("first_name_required");
    if (r.last_name.length > 80 || r.first_name.length > 80) errors.push("name_too_long");
    if (r.birth_date && !isValidDate(r.birth_date)) errors.push("birth_date_invalid");
    if (r.birth_date && isValidDate(r.birth_date) && (r.birth_date > new Date().toISOString().slice(0, 10) || r.birth_date < "1990-01-01")) errors.push("birth_date_out_of_range");
    if (r.gender === "?") errors.push("gender_invalid");
    if (r.class_name && !classSet.has(r.class_name)) errors.push("class_unknown");
    if (r.student_code && (r.student_code.length < 2 || r.student_code.length > 30)) errors.push("student_code_invalid");
    if (r.phone.length > 30 || r.guardian_phone.length > 30) errors.push("phone_invalid");
    let duplicate: ImportRowResult["duplicate"] = "none";
    if (!errors.length) {
      if (r.student_code && codes.has(r.student_code.toLowerCase())) duplicate = "student_code";
      else if (names.has(nameKey(r.last_name, r.first_name, r.birth_date || null))) duplicate = "name_birth";
      if (r.student_code) codes.add(r.student_code.toLowerCase());
      names.add(nameKey(r.last_name, r.first_name, r.birth_date || null));
    }
    return {
      row: r.row, ok: errors.length === 0, errors, duplicate, action: errors.length ? "invalid" : duplicate === "none" ? "create" : "skip",
      data: {
        last_name: r.last_name, first_name: r.first_name, middle_name: r.middle_name || null, birth_date: r.birth_date || null,
        gender: (r.gender === "m" || r.gender === "f" ? r.gender : null) as "m" | "f" | null, class_name: r.class_name || null,
        student_code: r.student_code || undefined, phone: r.phone || null, address: r.address || null,
        guardian_name: r.guardian_name || null, guardian_phone: r.guardian_phone || null,
      },
    };
  });
  return {
    total: out.length,
    valid: out.filter((x) => x.ok && x.duplicate === "none").length,
    duplicates: out.filter((x) => x.ok && x.duplicate !== "none").length,
    invalid: out.filter((x) => !x.ok).length,
    rows: out,
  };
}
