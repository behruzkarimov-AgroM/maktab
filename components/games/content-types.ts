import type { Difficulty, LocalizedText } from "@/lib/types";
import type { GameContentType } from "@/lib/admin/game-content-types";

export type { GameContentType };

/** Value-level copy of lib/admin/game-content-types CONTENT_SLUG_TYPE: importing that module pulls zod (~110 KB) into the games page. */
export const CONTENT_SLUG_TYPE: Record<string, GameContentType> = {
  "matching-pairs": "matching",
  "true-false": "true_false",
  "quiz-race": "quiz_race",
};

/** What the set picker needs (no items, no answers). */
export interface ContentSetSummary {
  id: string;
  game_type: GameContentType;
  title: LocalizedText;
  description: LocalizedText;
  subject_key: string;
  grade: number | null;
  difficulty: Difficulty;
  item_count: number;
}

export interface MatchingPair {
  id: string;
  left: LocalizedText;
  right: LocalizedText;
}
export interface TfQuestion {
  id: string;
  statement: LocalizedText;
}
export interface QuizQuestion {
  id: string;
  question: LocalizedText;
  options: { id: string; text: LocalizedText }[];
}

/**
 * Round payloads returned by POST /api/games/content/round.
 * Matching ships both sides (inherent to a memory/connect game); true_false and quiz_race NEVER contain answers:
 * every answer is checked by POST /api/games/content/answer against the signed `token`.
 */
export interface MatchingRound {
  game_type: "matching";
  set: ContentSetSummary;
  pairs: MatchingPair[];
}
export interface TfRound {
  game_type: "true_false";
  set: ContentSetSummary;
  token: string;
  questions: TfQuestion[];
}
export interface QuizRound {
  game_type: "quiz_race";
  set: ContentSetSummary;
  token: string;
  questions: QuizQuestion[];
}
export type ContentRound = MatchingRound | TfRound | QuizRound;
/** A round before the API route signs it (no token yet). */
export type ContentRoundBody = MatchingRound | Omit<TfRound, "token"> | Omit<QuizRound, "token">;

export interface AnswerResult {
  correct: boolean;
  explanation: LocalizedText | null;
  /** quiz_race: the right option, revealed after the answer */
  correct_option_id?: string;
}

/** Props the content games receive in addition to the usual GameProps. */
export interface ContentGameExtra {
  set: ContentSetSummary;
}
