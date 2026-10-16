import { describe, it, expect, vi } from "vitest";
import { clamp, shuffle, timeProgress, randInt, pick } from "@/components/games/utils";
import { formatClock } from "@/components/games/useGameClock";

describe("games utils", () => {
  it("clamp", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it("shuffle keeps the multiset and does not mutate input", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...src];
    const out = shuffle(src);
    expect(src).toEqual(copy);
    expect([...out].sort()).toEqual(copy);
    expect(shuffle([])).toEqual([]);
  });
  it("shuffle is deterministic under a mocked RNG and can reorder", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(shuffle([1, 2, 3])).toEqual([2, 3, 1]);
    spy.mockRestore();
  });
  it("randInt stays inside inclusive bounds", () => {
    for (let i = 0; i < 500; i++) {
      const v = randInt(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
    expect(randInt(4, 4)).toBe(4);
  });
  it("pick returns an element", () => {
    expect([1, 2, 3]).toContain(pick([1, 2, 3]));
  });
  it("timeProgress handles no limit, zero budget, overshoot", () => {
    expect(timeProgress(1000, Infinity)).toBe(0);
    expect(timeProgress(0, 0)).toBe(0);
    expect(timeProgress(3000, 1000)).toBeCloseTo(0.75);
    expect(timeProgress(3000, -500)).toBe(1);
  });
  it("formatClock", () => {
    expect(formatClock(Infinity)).toBe("--");
    expect(formatClock(-5)).toBe("0.0");
    expect(formatClock(4500)).toBe("4.5");
    expect(formatClock(65000)).toBe("1:05");
  });
});
