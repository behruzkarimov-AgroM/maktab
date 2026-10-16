// Server-side pure helpers for content games. They see the ANSWERS, so never import this from a client component.
// The Supabase RPCs (start_content_round / check_content_answer / content_fifty_fifty) implement the same contract.
import type { GameContentSetRow, MatchingItem, QuizRaceItem, TrueFalseItem } from "@/lib/admin/game-content-types";
import type { LocalizedText } from "@/lib/types";
import { drawItems, shuffleWith, type Rng } from "./content-logic";
import type { AnswerResult, ContentRoundBody, ContentSetSummary } from "./content-types";

export const MAX_ROUND_ITEMS = 50;

export function summarize(row: GameContentSetRow): ContentSetSummary {
  return {
    id: String(row.id),
    game_type: row.game_type,
    title: row.title,
    description: row.description ?? { uz: "", ru: "", en: "" },
    subject_key: row.subject_key,
    grade: row.grade ?? null,
    difficulty: row.difficulty,
    item_count: Array.isArray(row.items) ? row.items.length : 0,
  };
}

/** Random `n` items from the set, answers stripped (matching keeps both sides by design). */
export function buildRound(row: GameContentSetRow, n: number, rng: Rng = Math.random): ContentRoundBody {
  const count = Math.max(1, Math.min(Math.floor(n) || 1, MAX_ROUND_ITEMS));
  const set = summarize(row);
  if (row.game_type === "matching") {
    const pairs = drawItems(row.items as MatchingItem[], count, rng).map((p) => ({ id: p.id, left: p.left, right: p.right }));
    return { game_type: "matching", set, pairs };
  }
  if (row.game_type === "true_false") {
    const questions = drawItems(row.items as TrueFalseItem[], count, rng).map((q) => ({ id: q.id, statement: q.statement }));
    return { game_type: "true_false", set, questions };
  }
  const questions = drawItems(row.items as QuizRaceItem[], count, rng).map((q) => ({
    id: q.id,
    question: q.question,
    options: shuffleWith(q.options, rng).map((o) => ({ id: o.id, text: o.text })),
  }));
  return { game_type: "quiz_race", set, questions };
}

const hasText = (t: LocalizedText | null | undefined): t is LocalizedText => !!t && !!(t.uz || t.ru || t.en);

/** `answer`: "true"/"false" for true_false, the option id for quiz_race ("" = timed out / no answer). */
export function checkAnswer(row: GameContentSetRow, itemId: string, answer: string): AnswerResult | null {
  const item = (row.items as Array<TrueFalseItem | QuizRaceItem>).find((i) => i.id === itemId);
  if (!item) return null;
  const explanation = hasText(item.explanation) ? item.explanation : null;
  if (row.game_type === "true_false") {
    const it = item as TrueFalseItem;
    return { correct: answer === String(it.is_true), explanation };
  }
  if (row.game_type === "quiz_race") {
    const it = item as QuizRaceItem;
    return { correct: answer === it.correct_option_id, explanation, correct_option_id: it.correct_option_id };
  }
  return null;
}

/** 50/50 lifeline: ids of (up to) two wrong options to hide. */
export function wrongOptionIds(row: GameContentSetRow, itemId: string, rng: Rng = Math.random): string[] | null {
  if (row.game_type !== "quiz_race") return null;
  const item = (row.items as QuizRaceItem[]).find((i) => i.id === itemId);
  if (!item) return null;
  const wrong = item.options.filter((o) => o.id !== item.correct_option_id).map((o) => o.id);
  return shuffleWith(wrong, rng).slice(0, Math.min(2, Math.max(0, wrong.length - 1)));
}
