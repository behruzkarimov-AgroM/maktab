import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatNumber, formatTime } from "@/lib/format";

describe("lib/format", () => {
  const iso = "2026-10-29T07:33:00Z"; // 12:33 Asia/Tashkent
  it("formats uz dates with month names (no 'M10')", () => {
    expect(formatDate("uz", iso)).toBe("29 oktabr 2026");
    expect(formatDate("uz", iso, { month: "short" })).toBe("29 okt 2026");
    expect(formatDateTime("uz", iso)).toBe("29 oktabr 2026, 12:33");
  });
  it("uses Tashkent time zone for the day boundary", () => {
    expect(formatDate("uz", "2026-12-31T20:00:00Z")).toBe("1 yanvar 2027");
  });
  it("formats ru/en via Intl", () => {
    expect(formatDate("en", iso)).toBe("29 October 2026");
    expect(formatDate("ru", iso)).toContain("октября");
    expect(formatTime("en", iso)).toBe("12:33");
  });
  it("returns empty string for invalid input", () => {
    expect(formatDate("uz", "nope")).toBe("");
    expect(formatNumber("uz", NaN)).toBe("");
  });
  it("groups numbers", () => {
    expect(formatNumber("uz", 1644)).toBe("1 644");
    expect(formatNumber("en", 1644)).toBe("1,644");
  });
});
