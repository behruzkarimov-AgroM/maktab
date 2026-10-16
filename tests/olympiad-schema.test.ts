import { describe, it, expect } from "vitest";
import { registrationSchema, maskPhone, phoneValue, TICKET_RE } from "@/components/olympiad/types";

const year = new Date().getUTCFullYear();
const valid = {
  olympiadId: "o1",
  studentFullName: "Aziza Karimova",
  birthDate: `${year - 12}-05-10`,
  currentSchool: "School 12",
  grade: 6,
  subjectKey: "math",
  parentPhone: "+998901234567",
};
const err = (o: object) => {
  const r = registrationSchema.safeParse({ ...valid, ...o });
  return r.success ? null : r.error.issues[0].message;
};

describe("registrationSchema", () => {
  it("accepts a valid payload (extraPhone optional or empty)", () => {
    expect(registrationSchema.safeParse(valid).success).toBe(true);
    expect(registrationSchema.safeParse({ ...valid, extraPhone: "" }).success).toBe(true);
    expect(registrationSchema.safeParse({ ...valid, extraPhone: "+998911112233" }).success).toBe(true);
  });
  it("name: needs two words, letters only, 5..120", () => {
    expect(err({ studentFullName: "Aziza" })).toBe("name");
    expect(err({ studentFullName: "A B" })).toBe("name");
    expect(err({ studentFullName: "Aziza 123" })).toBe("name");
    expect(err({ studentFullName: "<b>Aziza</b> K" })).toBe("name");
    expect(err({ studentFullName: "O'tkir Karimov" })).toBeNull();
    expect(err({ studentFullName: "Иван Петров" })).toBeNull();
  });
  it("birth date: format, impossible dates, age 5..25", () => {
    expect(err({ birthDate: "10.05.2012" })).toBe("birth");
    expect(err({ birthDate: "2012-13-45" })).toBe("birth");
    expect(err({ birthDate: `${year - 2}-01-01` })).toBe("birth");
    expect(err({ birthDate: `${year - 40}-01-01` })).toBe("birth");
  });
  it("grade: integer 1..11", () => {
    expect(err({ grade: 0 })).toBe("grade");
    expect(err({ grade: 12 })).toBe("grade");
    expect(err({ grade: 5.5 })).toBe("grade");
    expect(err({ grade: 11 })).toBeNull();
  });
  it("phone: strict +998 + 9 digits", () => {
    expect(err({ parentPhone: "901234567" })).toBe("phone");
    expect(err({ parentPhone: "+99890123456" })).toBe("phone");
    expect(err({ parentPhone: "+9989012345678" })).toBe("phone");
    expect(err({ extraPhone: "123" })).toBe("phone");
  });
  it("school min length, missing olympiad", () => {
    expect(err({ currentSchool: "x" })).toBe("school");
    expect(err({ olympiadId: "" })).toBe("olympiad");
  });
});

describe("phone mask", () => {
  it("formats progressively", () => {
    expect(maskPhone("")).toBe("+998");
    expect(maskPhone("9")).toBe("+998 9");
    expect(maskPhone("901234567")).toBe("+998 90 123 45 67");
    expect(maskPhone("+998901234567")).toBe("+998 90 123 45 67");
    expect(maskPhone("90 123 45 67 99999")).toBe("+998 90 123 45 67");
  });
  it("phoneValue round-trips and handles empty", () => {
    expect(phoneValue(maskPhone("901234567"))).toBe("+998901234567");
    expect(phoneValue("")).toBe("");
    expect(phoneValue("+998")).toBe("");
  });
});

describe("TICKET_RE", () => {
  it("matches OLY-YYYY-NNNNNN only", () => {
    expect(TICKET_RE.test("OLY-2026-000123")).toBe(true);
    expect(TICKET_RE.test("OLY-2026-A1B2C3D4E5")).toBe(true);
    expect(TICKET_RE.test("OLY-2026-a1b2c3d4e5")).toBe(false);
    expect(TICKET_RE.test("OLY-2026-A1B2C3D4E")).toBe(false);
    expect(TICKET_RE.test("OLY-2026-12345")).toBe(false);
    expect(TICKET_RE.test("oly-2026-000123")).toBe(false);
    expect(TICKET_RE.test("OLY-2026-000123\n")).toBe(false);
  });
});
