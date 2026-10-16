import { describe, it, expect } from "vitest";
import { tr, emptyLocalized, LOCALES } from "@/lib/types";

describe("tr()", () => {
  it("returns the requested locale", () => {
    expect(tr({ uz: "a", ru: "b", en: "c" }, "ru")).toBe("b");
  });
  it("falls back uz -> en -> ru when the locale text is empty", () => {
    expect(tr({ uz: "a", ru: "", en: "c" }, "ru")).toBe("a");
    expect(tr({ uz: "", ru: "", en: "c" }, "ru")).toBe("c");
    expect(tr({ uz: "", ru: "r", en: "" }, "en")).toBe("r");
  });
  it("handles null / undefined / partial / all empty", () => {
    expect(tr(null, "uz")).toBe("");
    expect(tr(undefined, "en")).toBe("");
    expect(tr({ en: "x" }, "uz")).toBe("x");
    expect(tr(emptyLocalized(), "uz")).toBe("");
  });
  it("exposes the three locales with uz first", () => {
    expect(LOCALES).toEqual(["uz", "ru", "en"]);
  });
});
