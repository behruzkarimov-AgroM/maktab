import { describe, it, expect } from "vitest";
import { checkScales, scoreRange } from "@/lib/admin/scales";

const s = (id: number, min_score: number, max_score: number) => ({ id, min_score, max_score });

describe("scoreRange", () => {
  it("sums min/max option score per question, skipping empty questions", () => {
    expect(scoreRange([{ options: [{ score: 0 }, { score: 3 }] }, { options: [{ score: 1 }, { score: 2 }] }, { options: [] }, {}])).toEqual({ lo: 1, hi: 5 });
    expect(scoreRange([])).toEqual({ lo: 0, hi: 0 });
  });
  it("treats missing score as 0", () => {
    expect(scoreRange([{ options: [{}, { score: 4 }] }])).toEqual({ lo: 0, hi: 4 });
  });
});

describe("checkScales", () => {
  it("no issues for a perfect partition", () => {
    expect(checkScales([s(1, 0, 4), s(2, 5, 9), s(3, 10, 12)], { lo: 0, hi: 12 })).toEqual([]);
  });
  it("detects gaps between scales", () => {
    expect(checkScales([s(1, 0, 4), s(2, 8, 12)], { lo: 0, hi: 12 })).toEqual([{ kind: "gap", from: 5, to: 7 }]);
  });
  it("detects gaps at the edges of the possible range", () => {
    const out = checkScales([s(1, 2, 5)], { lo: 0, hi: 8 });
    expect(out).toContainEqual({ kind: "gap", from: 0, to: 1 });
    expect(out).toContainEqual({ kind: "gap", from: 6, to: 8 });
  });
  it("detects overlap incl. shared boundary", () => {
    const out = checkScales([s(1, 0, 5), s(2, 5, 9)], { lo: 0, hi: 9 });
    expect(out.map((i) => i.kind)).toEqual(["overlap"]);
  });
  it("detects min > max as bad and does not count it for gaps", () => {
    const out = checkScales([s(1, 0, 9), s(2, 7, 3)], { lo: 0, hi: 9 });
    expect(out).toEqual([{ kind: "bad", a: s(2, 7, 3) }]);
  });
  it("empty scales: whole range is a gap; without range nothing to report", () => {
    expect(checkScales([], { lo: 0, hi: 6 })).toEqual([{ kind: "gap", from: 0, to: 6 }]);
    expect(checkScales([])).toEqual([]);
  });
  it("order independent", () => {
    expect(checkScales([s(3, 10, 12), s(1, 0, 4), s(2, 5, 9)], { lo: 0, hi: 12 })).toEqual([]);
  });
  it("a scale nested inside a bigger one is an overlap, with no false gap afterwards", () => {
    const out = checkScales([s(1, 0, 10), s(2, 2, 3), s(3, 11, 12)], { lo: 0, hi: 12 });
    expect(out.filter((i) => i.kind === "gap")).toEqual([]);
    expect(out.filter((i) => i.kind === "overlap").length).toBeGreaterThanOrEqual(1);
  });
});
