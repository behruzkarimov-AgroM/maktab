import { describe, it, expect } from "vitest";
import { buildSchema, normalize, parseCsv, toCsv } from "@/lib/admin/validation";
import type { Field, ResourceDef } from "@/lib/admin/types";

const L = (s: string) => ({ uz: s, ru: s, en: s });
const f = (o: Partial<Field> & Pick<Field, "name" | "type">): Field => ({ label: L(o.name), ...o });
const res = (fields: Field[], extra: Partial<ResourceDef> = {}): ResourceDef => ({
  key: "t", table: "t", label: L("t"), singular: L("t"), icon: "x", group: "content",
  read: ["super_admin"], write: ["super_admin"], fields, columns: [], search: [],
  sort: { field: "id", dir: "asc" }, titleField: "title", ...extra,
});

describe("buildSchema", () => {
  const r = res([
    f({ name: "title", type: "localized", required: true }),
    f({ name: "order", type: "number", min: 0, max: 100 }),
    f({ name: "email", type: "email" }),
    f({ name: "kind", type: "select", required: true, options: [{ value: "a", label: L("a") }, { value: "b", label: L("b") }] }),
    f({ name: "grade", type: "select", options: [{ value: "1", label: L("1") }, { value: "2", label: L("2") }] }),
    f({ name: "grades", type: "grades" }),
    f({ name: "slug", type: "text", required: true, createOnly: true }),
    f({ name: "created", type: "datetime", readOnly: true }),
  ]);
  const base = { title: { uz: "A", ru: "", en: "" }, kind: "a", slug: "s" };

  it("create: requires uz of localized (ru/en may be empty)", () => {
    expect(buildSchema(r, "create").safeParse(base).success).toBe(true);
    expect(buildSchema(r, "create").safeParse({ ...base, title: { uz: "", ru: "x", en: "x" } }).success).toBe(false);
  });
  it("rejects missing required, bad select option, and out-of-range number", () => {
    const sc = buildSchema(r, "create");
    expect(sc.safeParse({ title: base.title, slug: "s" }).success).toBe(false);
    expect(sc.safeParse({ ...base, kind: "zzz" }).success).toBe(false);
    expect(sc.safeParse({ ...base, order: 101 }).success).toBe(false);
    expect(sc.safeParse({ ...base, order: "5" }).success).toBe(true); // coerced
    expect(sc.safeParse({ ...base, order: "" }).success).toBe(true); // -> null
  });
  it("numeric select is coerced and checked against options", () => {
    const sc = buildSchema(r, "create");
    expect(sc.safeParse({ ...base, grade: "2" }).success).toBe(true);
    expect(sc.safeParse({ ...base, grade: "3" }).success).toBe(false);
  });
  it("email: empty allowed when optional, invalid rejected", () => {
    const sc = buildSchema(r, "create");
    expect(sc.safeParse({ ...base, email: "" }).success).toBe(true);
    expect(sc.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
  it("grades limited to 1..11", () => {
    const sc = buildSchema(r, "create");
    expect(sc.safeParse({ ...base, grades: [1, 11] }).success).toBe(true);
    expect(sc.safeParse({ ...base, grades: [0] }).success).toBe(false);
    expect(sc.safeParse({ ...base, grades: [12] }).success).toBe(false);
  });
  it("readOnly fields are stripped; createOnly only on create", () => {
    const create = buildSchema(r, "create").parse({ ...base, created: "2020" });
    expect(create).not.toHaveProperty("created");
    expect(create).toHaveProperty("slug");
    const upd = buildSchema(r, "update").parse({ slug: "hacked", kind: "b" });
    expect(upd).not.toHaveProperty("slug");
    expect(upd).toEqual({ kind: "b" });
  });
  it("update is partial", () => {
    expect(buildSchema(r, "update").safeParse({}).success).toBe(true);
  });
  it("parent field required on create", () => {
    const rp = res(r.fields, { parent: { field: "quiz_id", resource: "quizzes" } });
    expect(buildSchema(rp, "create").safeParse(base).success).toBe(false);
    expect(buildSchema(rp, "create").safeParse({ ...base, quiz_id: 3 }).success).toBe(true);
  });
  it("repeater honours minItems/maxItems", () => {
    const rr = res([f({ name: "options", type: "repeater", minItems: 2, maxItems: 3, fields: [f({ name: "id", type: "text", required: true })] })]);
    const sc = buildSchema(rr, "create");
    expect(sc.safeParse({ options: [{ id: "A" }] }).success).toBe(false);
    expect(sc.safeParse({ options: [{ id: "A" }, { id: "B" }] }).success).toBe(true);
    expect(sc.safeParse({ options: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }] }).success).toBe(false);
  });
});

describe("normalize", () => {
  it("empty string -> null for typed optional cols, drops virtual fields", () => {
    const r = res([f({ name: "d", type: "date" }), f({ name: "img", type: "image", required: true }), f({ name: "pw", type: "password", virtual: true })]);
    expect(normalize(r, { d: "", img: "", pw: "x" })).toEqual({ d: null, img: "" });
  });
});

describe("CSV", () => {
  it("parses quotes, escaped quotes, embedded newlines, CRLF, BOM", () => {
    const rows = parseCsv('\uFEFFa,b\r\n"x,1","he said ""hi"""\r\n"multi\nline",z\r\n');
    expect(rows).toEqual([["a", "b"], ["x,1", 'he said "hi"'], ["multi\nline", "z"]]);
  });
  it("auto-detects semicolon delimiter and skips blank rows", () => {
    expect(parseCsv("a;b;c\n\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
  it("toCsv escapes and round-trips", () => {
    const rows = [["a", "b;c"], ['q"uote', "line\nbreak"], [null as unknown as string, 5]];
    const csv = toCsv(rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(parseCsv(csv)).toEqual([["a", "b;c"], ['q"uote', "line\nbreak"], ["", "5"]]);
  });
});
