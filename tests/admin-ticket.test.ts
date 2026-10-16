import { describe, it, expect } from "vitest";
import { extractTicket } from "@/lib/admin/ticket";
import { csvSafe, buildSchema } from "@/lib/admin/validation";
import { RESOURCE_MAP } from "@/lib/admin/resources";
import { checkScales } from "@/lib/admin/scales";

describe("extractTicket", () => {
  it("accepts legacy 6-digit and new 10-hex formats, case-insensitive, inside URLs/JSON", () => {
    expect(extractTicket("oly-2026-000123")).toBe("OLY-2026-000123");
    expect(extractTicket("OLY-2026-a1B2c3D4e5")).toBe("OLY-2026-A1B2C3D4E5");
    expect(extractTicket('{"t":"https://x/?q=OLY-2026-0123456789"}')).toBe("OLY-2026-0123456789");
    expect(extractTicket("OLY-2026-12345")).toBeNull();
    expect(extractTicket(null)).toBeNull();
  });
});

describe("csvSafe", () => {
  it("neutralises formulas but keeps phones/numbers", () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe("'=HYPERLINK(\"x\")");
    expect(csvSafe("@cmd")).toBe("'@cmd");
    expect(csvSafe("+998 90 123 45 67")).toBe("+998 90 123 45 67");
    expect(csvSafe("-5")).toBe("-5");
    expect(csvSafe("hello")).toBe("hello");
  });
});

describe("question schema", () => {
  const sc = buildSchema(RESOURCE_MAP.academic_questions, "create");
  const opt = (id: string) => ({ id, text: { uz: id, ru: "", en: "" } });
  const base = { question_text: { uz: "q", ru: "", en: "" }, options: [opt("A"), opt("B")], points: 1, quiz_id: "x" };
  it("rejects a correct id that is not among options and decimal points", () => {
    expect(sc.safeParse({ ...base, correct_option_id: "A" }).success).toBe(true);
    expect(sc.safeParse({ ...base, correct_option_id: "D" }).success).toBe(false);
    expect(sc.safeParse({ ...base, correct_option_id: "A", points: 1.5 }).success).toBe(false);
  });
  it("url fields accept only http(s)", () => {
    const s = buildSchema(RESOURCE_MAP.site_settings, "update");
    expect(s.safeParse({ virtual_tour_url: "javascript:alert(1)" }).success).toBe(false);
    expect(s.safeParse({ virtual_tour_url: "https://a.uz/x" }).success).toBe(true);
  });
});

describe("decimal scales", () => {
  it("flags gaps between decimal ranges", () => {
    const s = (id: number, a: number, b: number) => ({ id, min_score: a, max_score: b });
    expect(checkScales([s(1, 0, 4.5), s(2, 5, 9)]).some((i) => i.kind === "gap")).toBe(true);
  });
});
