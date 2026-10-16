/**
 * Server-side plausibility bounds for brain-game scores. The client computes the score, so the server only checks that a score is
 * physically reachable: at most `perSec` points per second of real elapsed time (+ a fixed part) at multiplier 1, scaled by the
 * configured difficulty multiplier, and never more than the per-game absolute cap. Numbers are deliberately generous (several times
 * what a very fast human reaches) so honest players are never rejected, while 100000-point forgeries are.
 */
export type GameSlugLike = string;

interface Limits {
  /** points per second of elapsed play time at multiplier 1 */
  perSec: number;
  /** fixed allowance (bonus for remaining time, finishing a round, ...) at multiplier 1 */
  fixed: number;
  /** absolute cap at multiplier 1 */
  cap: number;
  /** shortest believable run (ms) for a non-zero score */
  minMs: number;
  /** points per second of the configured time limit that can be banked as a "time left" bonus (schulte 5, logic 2) */
  bonusPerLimitSec?: number;
}

const LIMITS: Record<string, Limits> = {
  "schulte-table": { perSec: 40, fixed: 300, cap: 3000, minMs: 1500, bonusPerLimitSec: 5 },
  "memory-matrix": { perSec: 220, fixed: 300, cap: 20000, minMs: 2000 },
  "mental-math": { perSec: 110, fixed: 60, cap: 20000, minMs: 1500 },
  "stroop-test": { perSec: 90, fixed: 60, cap: 15000, minMs: 1500 },
  "logic-seq": { perSec: 120, fixed: 1000, cap: 2500, minMs: 3000, bonusPerLimitSec: 2 },
  "matching-pairs": { perSec: 150, fixed: 400, cap: 4000, minMs: 2500 },
  "true-false": { perSec: 120, fixed: 60, cap: 2000, minMs: 2000 },
  "quiz-race": { perSec: 220, fixed: 100, cap: 12000, minMs: 2000 },
};

const FALLBACK: Limits = { perSec: 150, fixed: 500, cap: 20000, minMs: 1500 };

export interface ScoreCheck {
  ok: boolean;
  reason?: "too_fast" | "score_too_high";
  max: number;
}

/** `multiplier` = the difficulty multiplier from brain_games.config (clamped 0.1..10 like the admin sanitiser). */
export function checkGameScore(game: GameSlugLike, input: { score: number; elapsedMs: number; completionMs: number; multiplier: number; timeLimitSec?: number }): ScoreCheck {
  const l = LIMITS[game] ?? FALLBACK;
  const mult = Math.min(10, Math.max(0.1, Number.isFinite(input.multiplier) ? input.multiplier : 1));
  // the claimed play time is capped by the real elapsed time at the call site; use the smaller of both for the rate bound
  const seconds = Math.max(0, Math.min(input.elapsedMs, input.completionMs + 3000)) / 1000;
  const bonus = (l.bonusPerLimitSec ?? 0) * Math.min(3600, Math.max(0, input.timeLimitSec ?? 0));
  const max = Math.round(Math.min(l.cap + bonus, l.perSec * seconds + l.fixed + bonus) * mult * 1.05);
  if (input.score > 0 && input.completionMs < l.minMs) return { ok: false, reason: "too_fast", max };
  if (input.score > max) return { ok: false, reason: "score_too_high", max };
  return { ok: true, max };
}
