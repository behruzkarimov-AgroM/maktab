import { describe, expect, it } from "vitest";
import {
  connectInit, connectPick, drawItems, filterSets, flipCard, flipInit, flipResolve, matchingAccuracy, matchingScore, pairsPerRound, quizInit,
  quizPoints, quizResolve, quizUseLifeline, tfAnswer, tfInit, tfPoints, tfSkip, tfTimeUp, type Rng,
} from "@/components/games/content-logic";
import { buildRound, checkAnswer, summarize, wrongOptionIds } from "@/components/games/content-core";
import { SEED_CONTENT_SETS } from "@/components/games/content-demo";
import type { ContentSetSummary } from "@/components/games/content-types";
import { GameDraftError, createGameSetFromDraft } from "@/lib/admin/game-content-create";
import { validateGameDraft, validateGameItems, type GameContentDraft, type GameContentSetRow } from "@/lib/admin/game-content-types";
import { RESOURCE_MAP } from "@/lib/admin/resources";
import { buildSchema } from "@/lib/admin/validation";

/** Deterministic RNG (LCG) so shuffles are reproducible. */
function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const L = (t: string) => ({ uz: t, ru: t, en: t });
const pairs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, left: L(`L${i + 1}`), right: L(`R${i + 1}`) }));
const tf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, statement: L(`S${i + 1}`), is_true: i % 2 === 0, explanation: i % 2 ? L("why") : null }));
const quiz = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`, question: L(`Q${i + 1}`), options: ["A", "B", "C", "D"].map((o) => ({ id: o, text: L(o) })), correct_option_id: "B", explanation: null,
  }));

describe("drawItems / pairsPerRound", () => {
  it("draws n distinct items and never more than available", () => {
    const items = pairs(10);
    const a = drawItems(items, 6, seeded(1));
    expect(a).toHaveLength(6);
    expect(new Set(a.map((x) => x.id)).size).toBe(6);
    expect(drawItems(items, 99, seeded(2))).toHaveLength(10);
    expect(drawItems(items, 0)).toEqual([]);
    expect(drawItems(items, -3)).toEqual([]);
  });
  it("is random but reproducible per seed, and does not mutate the input", () => {
    const items = pairs(12);
    const copy = JSON.stringify(items);
    expect(drawItems(items, 6, seeded(5)).map((x) => x.id)).toEqual(drawItems(items, 6, seeded(5)).map((x) => x.id));
    expect(drawItems(items, 6, seeded(5)).map((x) => x.id)).not.toEqual(drawItems(items, 6, seeded(6)).map((x) => x.id));
    expect(JSON.stringify(items)).toBe(copy);
  });
  it("pairsPerRound clamps to 12 and to the set size", () => {
    expect(pairsPerRound(8, 20)).toBe(8);
    expect(pairsPerRound(30, 40)).toBe(12);
    expect(pairsPerRound(12, 7)).toBe(7);
    expect(pairsPerRound(0, 9)).toBe(6);
  });
});

describe("filterSets", () => {
  const mk = (id: string, subject: string, grade: number | null, difficulty: "easy" | "medium" | "hard"): ContentSetSummary => ({
    id, game_type: "matching", title: L(id), description: L(""), subject_key: subject, grade, difficulty, item_count: 5,
  });
  const sets = [mk("a", "english", 3, "easy"), mk("b", "math", 4, "medium"), mk("c", "math", null, "hard")];
  it("filters by subject / difficulty and treats grade-less sets as 'any grade'", () => {
    expect(filterSets(sets, {}).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(filterSets(sets, { subject: "math" }).map((s) => s.id)).toEqual(["b", "c"]);
    expect(filterSets(sets, { difficulty: "easy" }).map((s) => s.id)).toEqual(["a"]);
    expect(filterSets(sets, { grade: 4 }).map((s) => s.id)).toEqual(["b", "c"]);
    expect(filterSets(sets, { grade: 3, subject: "english" }).map((s) => s.id)).toEqual(["a"]);
  });
});

describe("matching: scoring", () => {
  it("rewards pairs, penalises mistakes, adds a speed bonus only with a time limit", () => {
    expect(matchingScore({ pairs: 6, mistakes: 0, elapsedMs: 0, limitSec: 0, multiplier: 1 })).toBe(600);
    expect(matchingScore({ pairs: 6, mistakes: 2, elapsedMs: 0, limitSec: 0, multiplier: 1 })).toBe(570);
    expect(matchingScore({ pairs: 6, mistakes: 0, elapsedMs: 0, limitSec: 60, multiplier: 1 })).toBe(900);
    expect(matchingScore({ pairs: 6, mistakes: 0, elapsedMs: 30_000, limitSec: 60, multiplier: 1 })).toBe(750);
    expect(matchingScore({ pairs: 6, mistakes: 0, elapsedMs: 90_000, limitSec: 60, multiplier: 1 })).toBe(600);
    expect(matchingScore({ pairs: 6, mistakes: 0, elapsedMs: 0, limitSec: 0, multiplier: 2 })).toBe(1200);
  });
  it("never goes negative and computes accuracy", () => {
    expect(matchingScore({ pairs: 1, mistakes: 50, elapsedMs: 0, limitSec: 0, multiplier: 1 })).toBe(0);
    expect(matchingAccuracy(6, 2)).toBe(75);
    expect(matchingAccuracy(0, 0)).toBe(0);
  });
});

describe("matching: flip mode", () => {
  const start = () => flipInit(pairs(4), seeded(3));
  const idxOf = (s: ReturnType<typeof start>, pairId: string, side: "left" | "right") => s.cards.findIndex((c) => c.pairId === pairId && c.side === side);
  it("creates two cards per pair", () => {
    const s = start();
    expect(s.cards).toHaveLength(8);
    expect(s.cards.filter((c) => c.pairId === "p1").map((c) => c.side).sort()).toEqual(["left", "right"]);
  });
  it("keeps a matching pair face up and counts nothing as a mistake", () => {
    let s = start();
    s = flipCard(s, idxOf(s, "p1", "left"));
    expect(s.flipped).toHaveLength(1);
    s = flipCard(s, idxOf(s, "p1", "right"));
    expect(s.matched).toEqual(["p1"]);
    expect(s.flipped).toEqual([]);
    expect(s.mistakes).toBe(0);
    expect(s.moves).toBe(1);
  });
  it("locks on a mismatch until resolved, ignores clicks meanwhile and on the same card", () => {
    let s = start();
    const a = idxOf(s, "p1", "left");
    s = flipCard(s, a);
    expect(flipCard(s, a)).toBe(s); // same card twice
    s = flipCard(s, idxOf(s, "p2", "right"));
    expect(s.locked).toBe(true);
    expect(s.mistakes).toBe(1);
    expect(flipCard(s, idxOf(s, "p3", "left"))).toBe(s); // locked
    s = flipResolve(s);
    expect(s.locked).toBe(false);
    expect(s.flipped).toEqual([]);
    expect(flipResolve(s)).toBe(s);
  });
  it("can be completed", () => {
    let s = start();
    for (const id of ["p1", "p2", "p3", "p4"]) {
      s = flipCard(s, idxOf(s, id, "left"));
      s = flipCard(s, idxOf(s, id, "right"));
    }
    expect(s.matched).toHaveLength(4);
    expect(flipCard(s, 0)).toBe(s); // matched cards are inert
  });
});

describe("matching: connect mode", () => {
  it("selects, switches selection on the same side, matches and counts mistakes", () => {
    let s = connectInit();
    s = connectPick(s, "left", "p1");
    expect(s.selected).toEqual({ side: "left", id: "p1" });
    s = connectPick(s, "left", "p2"); // switch
    expect(s.selected).toEqual({ side: "left", id: "p2" });
    s = connectPick(s, "left", "p2"); // deselect
    expect(s.selected).toBeNull();
    s = connectPick(connectPick(s, "left", "p1"), "right", "p3"); // wrong
    expect(s.mistakes).toBe(1);
    expect(s.wrong).toEqual({ left: "p1", right: "p3" });
    expect(s.selected).toBeNull();
    s = connectPick(connectPick(s, "right", "p1"), "left", "p1"); // right first, then left: match
    expect(s.matched).toEqual(["p1"]);
    expect(s.mistakes).toBe(1);
    expect(connectPick(s, "left", "p1")).toBe(s); // matched ones are inert
  });
});

describe("true/false engine", () => {
  it("scores with a growing combo and resets it on a mistake", () => {
    expect(tfPoints(1, 1)).toBe(10);
    expect(tfPoints(2, 1)).toBe(13);
    expect(tfPoints(5, 1)).toBe(20);
    expect(tfPoints(99, 1)).toBe(30); // capped at +200%
    expect(tfPoints(1, 2)).toBe(20);
    let s = tfInit(10, 3);
    s = tfAnswer(s, true, 1);
    s = tfAnswer(s, true, 1);
    expect(s).toMatchObject({ score: 23, combo: 2, bestCombo: 2, correct: 2, index: 2 });
    s = tfAnswer(s, false, 1);
    expect(s).toMatchObject({ combo: 0, bestCombo: 2, wrong: 1, lives: 2, score: 23 });
    s = tfAnswer(s, true, 1);
    expect(s.score).toBe(33);
  });
  it("ends when lives are gone, when questions run out, or on time-up; frozen afterwards", () => {
    let s = tfInit(10, 2);
    s = tfAnswer(tfAnswer(s, false, 1), false, 1);
    expect(s.over).toBe("lives");
    expect(tfAnswer(s, true, 1)).toBe(s);
    let d = tfInit(2, 3);
    d = tfAnswer(tfAnswer(d, true, 1), true, 1);
    expect(d.over).toBe("done");
    const t = tfTimeUp(tfInit(5, 3));
    expect(t.over).toBe("time");
    expect(tfTimeUp(s).over).toBe("lives"); // first end reason wins
  });
  it("skip moves on without penalty", () => {
    const s = tfSkip(tfInit(3, 3));
    expect(s).toMatchObject({ index: 1, lives: 3, wrong: 0, score: 0, over: null });
    expect(tfSkip(tfSkip(s)).over).toBe("done");
  });
  it("lives are at least 1", () => {
    expect(tfInit(5, 0).lives).toBe(1);
  });
});

describe("quiz race engine", () => {
  it("gives a speed bonus (up to +50), a streak bonus (up to +50) and applies the multiplier", () => {
    expect(quizPoints({ remainingMs: 0, totalMs: 15000, streak: 1, multiplier: 1 })).toBe(100);
    expect(quizPoints({ remainingMs: 15000, totalMs: 15000, streak: 1, multiplier: 1 })).toBe(150);
    expect(quizPoints({ remainingMs: 7500, totalMs: 15000, streak: 1, multiplier: 1 })).toBe(125);
    expect(quizPoints({ remainingMs: 0, totalMs: 15000, streak: 3, multiplier: 1 })).toBe(120);
    expect(quizPoints({ remainingMs: 0, totalMs: 15000, streak: 99, multiplier: 1 })).toBe(150);
    expect(quizPoints({ remainingMs: 15000, totalMs: 15000, streak: 1, multiplier: 2 })).toBe(300);
    expect(quizPoints({ remainingMs: 99999, totalMs: 15000, streak: 1, multiplier: 1 })).toBe(150); // clamped
    expect(quizPoints({ remainingMs: -5, totalMs: 0, streak: 1, multiplier: 1 })).toBe(100);
  });
  it("tracks score, streak, outcomes and finishes after the last question", () => {
    let s = quizInit(3);
    s = quizResolve(s, { kind: "correct", points: 120 });
    s = quizResolve(s, { kind: "wrong" });
    expect(s).toMatchObject({ index: 2, score: 120, streak: 0, bestStreak: 1, correct: 1, wrong: 1, over: false });
    s = quizResolve(s, { kind: "timeout" });
    expect(s).toMatchObject({ wrong: 2, over: true });
    expect(quizResolve(s, { kind: "correct", points: 999 })).toBe(s);
  });
  it("skip is neutral: no streak reset, not counted as wrong", () => {
    let s = quizInit(4);
    s = quizResolve(s, { kind: "correct", points: 100 });
    s = quizResolve(s, { kind: "skip" });
    expect(s).toMatchObject({ streak: 1, skipped: 1, wrong: 0, index: 2 });
  });
  it("each lifeline can only be used once", () => {
    let s = quizInit(5);
    s = quizUseLifeline(s, "fifty");
    expect(s.lifelines).toEqual({ fifty: true, skip: false, time: false });
    expect(quizUseLifeline(s, "fifty")).toBe(s);
  });
});

describe("server-side round building (no answer leaks)", () => {
  const row = (game_type: GameContentSetRow["game_type"], items: GameContentSetRow["items"]): GameContentSetRow => ({
    id: "x1", game_type, title: L("T"), description: L("D"), subject_key: "general", grade: null, difficulty: "easy", items, is_active: true, sort_order: 0,
  });
  it("true_false rounds contain only statements; quiz rounds hide the correct option and explanation", () => {
    const t = JSON.stringify(buildRound(row("true_false", tf(8)), 5, seeded(1)));
    expect(t).not.toMatch(/is_true|explanation/);
    const q = buildRound(row("quiz_race", quiz(8)), 5, seeded(1));
    expect(JSON.stringify(q)).not.toMatch(/correct_option_id|explanation/);
    expect(q.game_type === "quiz_race" && q.questions).toHaveLength(5);
    const m = buildRound(row("matching", pairs(8)), 6, seeded(1));
    expect(m.game_type === "matching" && m.pairs).toHaveLength(6);
  });
  it("seed sets are all valid and playable", () => {
    expect(SEED_CONTENT_SETS.length).toBeGreaterThanOrEqual(3);
    for (const s of SEED_CONTENT_SETS) {
      expect(validateGameItems(s.game_type, s.items)).toEqual([]);
      expect(summarize(s).item_count).toBe(s.items.length);
    }
    expect(new Set(SEED_CONTENT_SETS.map((s) => s.game_type))).toEqual(new Set(["matching", "true_false", "quiz_race"]));
  });
  it("checkAnswer: true/false and quiz, explanation only when set", () => {
    const t = row("true_false", tf(5));
    expect(checkAnswer(t, "s1", "true")).toEqual({ correct: true, explanation: null });
    expect(checkAnswer(t, "s1", "false")?.correct).toBe(false);
    expect(checkAnswer(t, "s2", "true")).toMatchObject({ correct: false, explanation: L("why") });
    expect(checkAnswer(t, "nope", "true")).toBeNull();
    const z = row("quiz_race", quiz(5));
    expect(checkAnswer(z, "q1", "B")).toMatchObject({ correct: true, correct_option_id: "B" });
    expect(checkAnswer(z, "q1", "A")).toMatchObject({ correct: false, correct_option_id: "B" });
    expect(checkAnswer(z, "q1", "")?.correct).toBe(false);
    expect(checkAnswer(row("matching", pairs(5)), "p1", "x")).toBeNull();
  });
  it("50/50 hides two wrong options and never the right one", () => {
    const z = row("quiz_race", quiz(5));
    for (let i = 0; i < 20; i++) {
      const w = wrongOptionIds(z, "q1", seeded(i))!;
      expect(w).toHaveLength(2);
      expect(w).not.toContain("B");
      expect(new Set(w).size).toBe(2);
    }
    const two = row("quiz_race", [...quiz(5).slice(0, 4), { ...quiz(5)[4], options: [{ id: "A", text: L("a") }, { id: "B", text: L("b") }] }]);
    expect(wrongOptionIds(two, "q5")).toEqual([]);
    expect(wrongOptionIds(row("matching", pairs(5)), "p1")).toBeNull();
  });
});

describe("content validation (validateGameItems / admin schema / draft)", () => {
  it("matching needs >=4 pairs, true_false and quiz_race >=5", () => {
    expect(validateGameItems("matching", pairs(4))).toEqual([]);
    expect(validateGameItems("matching", pairs(3)).map((i) => i.message)).toContain("at least 4 items are required");
    expect(validateGameItems("true_false", tf(5))).toEqual([]);
    expect(validateGameItems("true_false", tf(4))).not.toEqual([]);
    expect(validateGameItems("quiz_race", quiz(5))).toEqual([]);
    expect(validateGameItems("quiz_race", quiz(4))).not.toEqual([]);
  });
  it("rejects duplicate ids, empty uz text, wrong shapes and bad quiz options", () => {
    expect(validateGameItems("matching", [...pairs(4), { id: "p1", left: L("a"), right: L("b") }]).map((i) => i.message)).toContain("duplicate item id");
    expect(validateGameItems("matching", [...pairs(4), { id: "z", left: { uz: "", ru: "x", en: "x" }, right: L("b") }])).not.toEqual([]);
    expect(validateGameItems("true_false", [...tf(5), { id: "z", statement: L("s") }])).not.toEqual([]); // is_true missing
    expect(validateGameItems("quiz_race", pairs(6))).not.toEqual([]);
    const bad = quiz(5);
    bad[2] = { ...bad[2], correct_option_id: "Z" };
    expect(validateGameItems("quiz_race", bad).map((i) => i.message)).toContain("correct answer is not one of the options");
    const dup = quiz(5);
    dup[0] = { ...dup[0], options: [{ id: "A", text: L("a") }, { id: "A", text: L("b") }] };
    expect(validateGameItems("quiz_race", dup).map((i) => i.message)).toContain("duplicate option ids");
    const one = quiz(5);
    one[1] = { ...one[1], options: [{ id: "B", text: L("a") }] };
    expect(validateGameItems("quiz_race", one)).not.toEqual([]);
    expect(validateGameItems("quiz_race", "nope")).not.toEqual([]);
    expect(validateGameItems("bogus" as never, [])).not.toEqual([]);
  });
  const res = RESOURCE_MAP.game_content_sets;
  const base = { game_type: "true_false", title: L("T"), description: L(""), subject_key: "general", grade: "", difficulty: "medium", is_active: true, sort_order: 0 };
  it("the admin resource is registered for super_admin + methodist in the games group", () => {
    expect(res.group).toBe("mind");
    expect(res.write.sort()).toEqual(["methodist", "super_admin"]);
    expect(res.read).not.toContain("psychologist");
  });
  it("buildSchema validates items per type on create and update", () => {
    const create = buildSchema(res, "create");
    expect(create.safeParse({ ...base, items: tf(5) }).success).toBe(true);
    expect(create.safeParse({ ...base, items: tf(3) }).success).toBe(false);
    expect(create.safeParse({ ...base, game_type: "quiz_race", items: tf(5) }).success).toBe(false);
    const dupId = create.safeParse({ ...base, game_type: "matching", items: [...pairs(4), pairs(1)[0]] });
    expect(dupId.success).toBe(false);
    // update: game_type is create-only, so the type is inferred from the items
    const update = buildSchema(res, "update");
    expect(update.safeParse({ items: quiz(5) }).success).toBe(true);
    const badUpdate = update.safeParse({ items: [...quiz(4), { ...quiz(5)[4], correct_option_id: "Q" }] });
    expect(badUpdate.success).toBe(false);
    if (!badUpdate.success) expect(badUpdate.error.issues[0].path.slice(0, 2)).toEqual(["items", "4"]);
  });
  const draft: GameContentDraft<"matching"> = { game_type: "matching", title: L("Vocab"), subject_key: "english", grade: 3, difficulty: "easy", items: pairs(5) };
  it("validateGameDraft checks metadata + items", () => {
    expect(validateGameDraft(draft)).toEqual([]);
    expect(validateGameDraft({ ...draft, subject_key: "Bad Key" }).map((i) => i.path)).toContain("subject_key");
    expect(validateGameDraft({ ...draft, grade: 12 }).map((i) => i.path)).toContain("grade");
    expect(validateGameDraft({ ...draft, title: { uz: "", ru: "x", en: "x" } }).map((i) => i.path)).toContain("title");
    expect(validateGameDraft({ ...draft, items: pairs(2) }).map((i) => i.path)).toContain("items");
  });
  it("createGameSetFromDraft stores an (inactive by default) set in the demo store; invalid drafts throw with issues", async () => {
    const row = await createGameSetFromDraft(draft);
    expect(row.id).toBeTruthy();
    expect(row).toMatchObject({ game_type: "matching", subject_key: "english", grade: 3, is_active: false });
    expect(row.items).toHaveLength(5);
    const live = await createGameSetFromDraft({ ...draft, is_active: true, grade: null });
    expect(live.is_active).toBe(true);
    await expect(createGameSetFromDraft({ ...draft, items: pairs(1) })).rejects.toBeInstanceOf(GameDraftError);
    await expect(createGameSetFromDraft({ ...draft, items: pairs(1) })).rejects.toMatchObject({ issues: expect.any(Array) });
  });
});
