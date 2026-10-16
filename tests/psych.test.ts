import { describe, it, expect } from "vitest";
import { DEMO_TESTS, getDemoTest } from "@/components/psych/demo";
import { scoreDemo, toPublic } from "@/components/psych/score";
import { badgeStyle } from "@/components/psych/badge";
import type { DemoTest } from "@/components/psych/types";

const L = (s: string) => ({ uz: s, ru: s, en: s });
const mini: DemoTest = {
  id: "mini",
  title: L("t"), description: L("d"), instruction: L("i"), audience: "kids",
  questions: [
    { id: "q1", text: L("q"), options: [{ id: "a", text: L("a"), score: 0 }, { id: "b", text: L("b"), score: 2 }] },
    { id: "q2", text: L("q"), options: [{ id: "a", text: L("a"), score: 1 }, { id: "b", text: L("b"), score: 3 }] },
  ],
  scales: [
    { min: 1, max: 2, title: L("low"), analysis: L("x"), recommendations: L("y"), badge: "green" },
    { min: 3, max: 5, title: L("high"), analysis: L("x"), recommendations: L("y"), badge: "red" },
  ],
};

describe("scoreDemo", () => {
  it("sums scores and picks the matching scale (boundaries inclusive)", () => {
    expect(scoreDemo(mini, { q1: "a", q2: "a" })?.title.en).toBe("low"); // 1
    expect(scoreDemo(mini, { q1: "b", q2: "a" })?.total_score).toBe(3);
    expect(scoreDemo(mini, { q1: "b", q2: "a" })?.title.en).toBe("high");
    expect(scoreDemo(mini, { q1: "b", q2: "b" })?.badge_color).toBe("red"); // 5
  });
  it("returns null for empty / incomplete / unknown option answers", () => {
    expect(scoreDemo(mini, {})).toBeNull();
    expect(scoreDemo(mini, { q1: "a" })).toBeNull();
    expect(scoreDemo(mini, { q1: "a", q2: "zzz" })).toBeNull();
  });
  it("returns null when the total falls in a scale gap (0)", () => {
    expect(scoreDemo(mini, { q1: "a", q2: "a" })).not.toBeNull();
    const gap = { ...mini, scales: [mini.scales[1]] };
    expect(scoreDemo(gap, { q1: "a", q2: "a" })).toBeNull();
  });
  it("ignores extra unknown question ids", () => {
    expect(scoreDemo(mini, { q1: "a", q2: "a", zz: "a" })).not.toBeNull();
  });
});

describe("toPublic", () => {
  it("strips scores and scales", () => {
    const p = toPublic(mini);
    expect(JSON.stringify(p)).not.toContain("score");
    expect(JSON.stringify(p)).not.toContain("scales");
    expect(p.questions[0].options[0]).toEqual({ id: "a", text: L("a") });
  });
});

describe("built-in demo psych tests", () => {
  it.each(DEMO_TESTS.map((t) => [t.id, t] as const))("%s: every reachable total maps to exactly one scale", (_id, t) => {
    let lo = 0, hi = 0;
    for (const q of t.questions) {
      lo += Math.min(...q.options.map((o) => o.score));
      hi += Math.max(...q.options.map((o) => o.score));
    }
    for (let s = lo; s <= hi; s++) {
      const m = t.scales.filter((x) => s >= x.min && s <= x.max);
      expect(m.length, `score ${s}`).toBe(1);
    }
  });
  it("min-all and max-all answers always produce a result", () => {
    for (const t of DEMO_TESTS) {
      const low: Record<string, string> = {}, high: Record<string, string> = {};
      for (const q of t.questions) {
        const sorted = [...q.options].sort((a, b) => a.score - b.score);
        low[q.id] = sorted[0].id;
        high[q.id] = sorted[sorted.length - 1].id;
      }
      expect(scoreDemo(t, low), t.id).not.toBeNull();
      expect(scoreDemo(t, high), t.id).not.toBeNull();
    }
  });
  it("getDemoTest unknown -> undefined", () => {
    expect(getDemoTest("nope")).toBeUndefined();
  });
});

describe("badgeStyle", () => {
  it("named, hex and fallback", () => {
    expect(badgeStyle(" GREEN ").className).toContain("emerald");
    expect(badgeStyle("#aabbcc").style?.backgroundColor).toBe("#aabbcc33");
expect(badgeStyle("not-a-color").className).toContain("sky");
  });


  it("3-digit hex produces a valid CSS colour", () => {
    expect(badgeStyle("#abc").style?.backgroundColor).toMatch(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);
  });
});
