import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { mapRows, normalizeClassName, normalizeDate, normalizeGender, validateImport } from "@/lib/school/import-parse";
import { importCommitSchema } from "@/lib/school/schemas";
import { parseWorkbook } from "@/lib/school/svc-import";

const classes = [{ name: "5A" }, { name: "7A" }];
const existing = [{ student_code: "ST-1", last_name: "Karimov", first_name: "Ali", birth_date: "2014-03-02" }];

describe("import normalisation", () => {
  it("dates", () => {
    expect(normalizeDate("2014-3-2")).toBe("2014-03-02");
    expect(normalizeDate("02.03.2014")).toBe("2014-03-02");
    expect(normalizeDate("2/3/2014")).toBe("2014-03-02");
    expect(normalizeDate(41730)).toBe("2014-04-01"); // Excel serial
    expect(normalizeDate("garbage")).toBe("garbage");
  });
  it("gender + class", () => {
    expect(normalizeGender("Erkak")).toBe("m");
    expect(normalizeGender("F")).toBe("f");
    expect(normalizeGender("")).toBe("");
    expect(normalizeGender("robot")).toBe("?");
    expect(normalizeClassName("5-a")).toBe("5A");
    expect(normalizeClassName("7 А")).toBe("7A"); // cyrillic A
  });
  it("maps uz/ru/en headers", () => {
    const rows = mapRows([{ Familiya: "Aliyev", Ism: "Vali", "Tug'ilgan sana": "01.02.2015", Sinf: "5-A", Jins: "erkak", Extra: "x" }]);
    expect(rows[0]).toMatchObject({ last_name: "Aliyev", first_name: "Vali", birth_date: "2015-02-01", class_name: "5A", gender: "m" });
    const ru = mapRows([{ Фамилия: "Иванов", Имя: "Иван", Класс: "7А" }]);
    expect(ru[0]).toMatchObject({ last_name: "Иванов", first_name: "Иван", class_name: "7A" });
  });
});

describe("import validation", () => {
  const rows = mapRows([
    { last_name: "New", first_name: "Student", birth_date: "2015-05-05", class: "5A" },
    { last_name: "Karimov", first_name: "Ali", birth_date: "2014-03-02", class: "5A" }, // duplicate name+birth
    { last_name: "Other", first_name: "Kid", student_code: "st-1" }, // duplicate code (case-insens.)
    { last_name: "", first_name: "NoLast" },
    { last_name: "Bad", first_name: "Date", birth_date: "31.02.2015" },
    { last_name: "Bad", first_name: "Class", class: "99Z" },
    { last_name: "Bad", first_name: "Gender", gender: "robot" },
    { last_name: "New", first_name: "Student", birth_date: "2015-05-05" }, // duplicate inside the file
  ]);
  const r = validateImport(rows, existing, classes);
  it("classifies rows", () => {
    expect(r.rows.map((x) => x.action)).toEqual(["create", "skip", "skip", "invalid", "invalid", "invalid", "invalid", "skip"]);
    expect(r.rows[1].duplicate).toBe("name_birth");
    expect(r.rows[2].duplicate).toBe("student_code");
    expect(r.rows[7].duplicate).toBe("name_birth");
    expect(r.rows[3].errors).toContain("last_name_required");
    expect(r.rows[4].errors).toContain("birth_date_invalid");
    expect(r.rows[5].errors).toContain("class_unknown");
    expect(r.rows[6].errors).toContain("gender_invalid");
  });
  it("totals", () => {
    expect(r).toMatchObject({ total: 8, valid: 1, duplicates: 3, invalid: 4 });
  });
  it("rejects absurd birth dates", () => {
    const x = validateImport(mapRows([{ last_name: "Old", first_name: "Man", birth_date: "1900-01-01" }]), [], classes);
    expect(x.rows[0].errors).toContain("birth_date_out_of_range");
  });
});

describe("workbook parsing", () => {
  it("reads xlsx and csv", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Familiya", "Ism", "Sinf"], ["Aliyev", "Vali", "5A"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const xlsx = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(parseWorkbook(xlsx)).toEqual([{ Familiya: "Aliyev", Ism: "Vali", Sinf: "5A" }]);
    const csv = new TextEncoder().encode("last_name,first_name\nAliyev,Vali\n");
    expect(parseWorkbook(csv)).toEqual([{ last_name: "Aliyev", first_name: "Vali" }]);
  });
  it("rejects empty and oversized files", () => {
    expect(() => parseWorkbook(new Uint8Array())).toThrow();
    expect(() => parseWorkbook(new Uint8Array(3 * 1024 * 1024))).toThrow();
  });
  it("commit schema caps rows", () => {
    expect(importCommitSchema.safeParse({ rows: [] }).success).toBe(false);
    expect(importCommitSchema.safeParse({ rows: [{ first_name: "A", last_name: "B" }] }).success).toBe(true);
  });
});
