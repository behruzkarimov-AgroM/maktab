import type { Difficulty, LocalizedText } from "@/lib/types";

export const GAME_SLUGS = ["schulte-table", "memory-matrix", "mental-math", "stroop-test", "logic-seq", "matching-pairs", "true-false", "quiz-race"] as const;
export type GameSlug = (typeof GAME_SLUGS)[number];

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/**
 * Per-difficulty config (stored in brain_games.config JSONB, admin editable).
 * Meaning of `grid` depends on the game:
 *  - schulte-table: grid side (3/4/5)
 *  - memory-matrix: starting matrix side
 *  - mental-math:   largest operand
 *  - stroop-test:   number of ink colors in play (3..6)
 *  - logic-seq:     pattern complexity (1..3)
 *  - matching-pairs: pairs per round (4..12); time_limit = whole round (0 = none)
 *  - true-false:    lives; time_limit = whole round
 *  - quiz-race:     questions per round; time_limit = seconds PER QUESTION
 * `time_limit` is seconds (0 = no limit where it makes sense), `multiplier` scales the final score.
 */
export interface DifficultyConfig {
  grid: number;
  time_limit: number;
  multiplier: number;
}
export type GameConfig = Record<Difficulty, DifficultyConfig>;

export interface GameMeta {
  slug: GameSlug;
  title: LocalizedText;
  description: LocalizedText;
  howTo: LocalizedText;
  skill: LocalizedText;
  icon: string; // emoji
  config: GameConfig;
}

export interface GameResult {
  score: number;
  /** Elapsed play time in ms measured from performance.now() deltas. */
  timeMs: number;
  /** 0..100 */
  accuracy: number;
  /** Cleared/won (true) vs. time over / lives lost (false) - only affects sounds/confetti. */
  completed: boolean;
}

export interface LeaderboardEntry {
  id: string;
  player_name: string;
  student_grade: number | null;
  difficulty: Difficulty;
  score: number;
  completion_time_ms: number;
  accuracy_percent: number;
  created_at: string;
}

/** Props every game component receives from the shell. */
export interface GameProps {
  config: DifficultyConfig;
  difficulty: Difficulty;
  onFinish: (result: GameResult) => void;
}
