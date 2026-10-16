// Pure game logic for the content-driven games (matching pairs, true/false, quiz race).
// No React, no IO: everything here is unit-tested (tests/content-games.test.ts).
import type { Difficulty } from "@/lib/types";
import type { ContentSetSummary, MatchingPair } from "./content-types";

export type Rng = () => number;

export function shuffleWith<T>(input: readonly T[], rng: Rng = Math.random): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `n` distinct random items (all of them, shuffled, when n >= length). */
export function drawItems<T>(items: readonly T[], n: number, rng: Rng = Math.random): T[] {
  const k = Math.max(0, Math.min(Math.floor(n), items.length));
  return shuffleWith(items, rng).slice(0, k);
}

export const PAIRS_MIN = 4;
export const PAIRS_MAX = 12;
/** Pairs per matching round: configured size clamped to 4..12 and to what the set has. */
export function pairsPerRound(configured: number, available: number): number {
  return Math.max(0, Math.min(Math.round(configured) || 6, PAIRS_MAX, available));
}

// ---------------------------------------------------------------- set filtering
export interface SetFilter {
  subject?: string;
  /** Student grade; sets without a grade ("any") always match. */
  grade?: number | null;
  difficulty?: Difficulty;
}
export function filterSets(sets: readonly ContentSetSummary[], f: SetFilter): ContentSetSummary[] {
  return sets.filter(
    (s) =>
      (!f.subject || s.subject_key === f.subject) &&
      (!f.difficulty || s.difficulty === f.difficulty) &&
      (f.grade == null || s.grade == null || s.grade === f.grade),
  );
}

// ---------------------------------------------------------------- matching
export interface MatchingScoreInput {
  pairs: number;
  mistakes: number;
  elapsedMs: number;
  /** 0 = no time limit */
  limitSec: number;
  multiplier: number;
}
/** 100 per pair, -15 per mistake, up to +50 per pair of speed bonus when a time limit exists. */
export function matchingScore({ pairs, mistakes, elapsedMs, limitSec, multiplier }: MatchingScoreInput): number {
  const base = pairs * 100;
  const penalty = mistakes * 15;
  const speed = limitSec > 0 ? Math.max(0, 1 - elapsedMs / (limitSec * 1000)) * pairs * 50 : 0;
  return Math.max(0, Math.round((base - penalty + speed) * multiplier));
}
export const matchingAccuracy = (matched: number, mistakes: number) => (matched + mistakes === 0 ? 0 : (matched / (matched + mistakes)) * 100);

// flip / memory mode
export interface FlipCard {
  key: string;
  pairId: string;
  side: "left" | "right";
}
export interface FlipState {
  cards: FlipCard[];
  /** indexes currently face up (0..2, unmatched) */
  flipped: number[];
  matched: string[];
  mistakes: number;
  moves: number;
  /** true while a mismatching pair is shown and waiting to be turned back */
  locked: boolean;
}
export function flipInit(pairs: readonly MatchingPair[], rng: Rng = Math.random): FlipState {
  const cards: FlipCard[] = pairs.flatMap((p) => [
    { key: `${p.id}:l`, pairId: p.id, side: "left" as const },
    { key: `${p.id}:r`, pairId: p.id, side: "right" as const },
  ]);
  return { cards: shuffleWith(cards, rng), flipped: [], matched: [], mistakes: 0, moves: 0, locked: false };
}
export function flipCard(s: FlipState, idx: number): FlipState {
  const card = s.cards[idx];
  if (!card || s.locked || s.flipped.includes(idx) || s.matched.includes(card.pairId)) return s;
  const flipped = [...s.flipped, idx];
  if (flipped.length < 2) return { ...s, flipped };
  const [a, b] = flipped.map((i) => s.cards[i]);
  if (a.pairId === b.pairId) return { ...s, flipped: [], matched: [...s.matched, a.pairId], moves: s.moves + 1 };
  return { ...s, flipped, mistakes: s.mistakes + 1, moves: s.moves + 1, locked: true };
}
/** Turns a mismatching pair face down again. */
export const flipResolve = (s: FlipState): FlipState => (s.locked ? { ...s, flipped: [], locked: false } : s);

// connect mode
export interface ConnectState {
  selected: { side: "left" | "right"; id: string } | null;
  matched: string[];
  mistakes: number;
  /** last wrong pair, for a short red flash */
  wrong: { left: string; right: string } | null;
}
export const connectInit = (): ConnectState => ({ selected: null, matched: [], mistakes: 0, wrong: null });
export function connectPick(s: ConnectState, side: "left" | "right", id: string): ConnectState {
  if (s.matched.includes(id)) return s;
  const sel = s.selected;
  if (!sel || sel.side === side) return { ...s, selected: sel && sel.side === side && sel.id === id ? null : { side, id }, wrong: null };
  if (sel.id === id) return { ...s, selected: null, matched: [...s.matched, id], wrong: null };
  const left = side === "right" ? sel.id : id;
  const right = side === "right" ? id : sel.id;
  return { ...s, selected: null, mistakes: s.mistakes + 1, wrong: { left, right } };
}

// ---------------------------------------------------------------- true / false
export interface TfState {
  index: number;
  total: number;
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  wrong: number;
  lives: number;
  over: null | "time" | "lives" | "done";
}
export const tfInit = (total: number, lives: number): TfState => ({
  index: 0, total, score: 0, combo: 0, bestCombo: 0, correct: 0, wrong: 0, lives: Math.max(1, lives), over: null,
});
/** 10 points, +25% per extra answer in a row (capped at +200%), times the difficulty multiplier. */
export const tfPoints = (combo: number, multiplier: number) => Math.round(10 * (1 + 0.25 * Math.min(Math.max(combo - 1, 0), 8)) * multiplier);
export function tfAnswer(s: TfState, correct: boolean, multiplier: number): TfState {
  if (s.over) return s;
  const index = s.index + 1;
  if (correct) {
    const combo = s.combo + 1;
    return { ...s, index, combo, bestCombo: Math.max(s.bestCombo, combo), correct: s.correct + 1, score: s.score + tfPoints(combo, multiplier), over: index >= s.total ? "done" : null };
  }
  const lives = s.lives - 1;
  return { ...s, index, combo: 0, wrong: s.wrong + 1, lives, over: lives <= 0 ? "lives" : index >= s.total ? "done" : null };
}
/** The server could not check this statement (network error): move on without any penalty. */
export const tfSkip = (s: TfState): TfState => (s.over ? s : { ...s, index: s.index + 1, over: s.index + 1 >= s.total ? "done" : null });
export const tfTimeUp =(s: TfState): TfState => (s.over ? s : { ...s, over: "time" });

// ---------------------------------------------------------------- quiz race
export interface QuizPointsInput {
  remainingMs: number;
  totalMs: number;
  /** streak INCLUDING the answer being scored */
  streak: number;
  multiplier: number;
}
/** 100 base + up to 50 speed bonus + 10 per extra streak step (max +50), times the difficulty multiplier. */
export function quizPoints({ remainingMs, totalMs, streak, multiplier }: QuizPointsInput): number {
  const frac = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const speed = Math.round(50 * frac);
  const streakBonus = 10 * Math.min(Math.max(streak - 1, 0), 5);
  return Math.round((100 + speed + streakBonus) * multiplier);
}
export type Lifeline = "fifty" | "skip" | "time";
export interface QuizState {
  index: number;
  total: number;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  wrong: number;
  skipped: number;
  lifelines: Record<Lifeline, boolean>;
  over: boolean;
}
export const quizInit = (total: number): QuizState => ({
  index: 0, total, score: 0, streak: 0, bestStreak: 0, correct: 0, wrong: 0, skipped: 0, lifelines: { fifty: false, skip: false, time: false }, over: false,
});
export type QuizOutcome = { kind: "correct"; points: number } | { kind: "wrong" } | { kind: "timeout" } | { kind: "skip" };
/** Applies the outcome of the current question and advances to the next one. */
export function quizResolve(s: QuizState, o: QuizOutcome): QuizState {
  if (s.over) return s;
  const index = s.index + 1;
  const over = index >= s.total;
  switch (o.kind) {
    case "correct": {
      const streak = s.streak + 1;
      return { ...s, index, over, streak, bestStreak: Math.max(s.bestStreak, streak), correct: s.correct + 1, score: s.score + o.points };
    }
    case "skip":
      return { ...s, index, over, skipped: s.skipped + 1 };
    default:
      return { ...s, index, over, streak: 0, wrong: s.wrong + 1 };
  }
}
export const quizUseLifeline = (s: QuizState, l: Lifeline): QuizState => (s.lifelines[l] ? s : { ...s, lifelines: { ...s.lifelines, [l]: true } });
export const quizAccuracy = (s: Pick<QuizState, "correct" | "wrong">) => (s.correct + s.wrong === 0 ? 0 : (s.correct / (s.correct + s.wrong)) * 100);
