// Content-driven games: types + validation for `game_content_sets` (client AND server safe, no server imports).
// Used by the admin form (validation.ts), the public games API, the demo store and the Word/PDF importer
// (see game-content-create.ts -> createGameSetFromDraft).
import { z } from "zod";
import type { Difficulty, LocalizedText } from "@/lib/types";

export const GAME_CONTENT_TYPES = ["matching", "true_false", "quiz_race"] as const;
export type GameContentType = (typeof GAME_CONTENT_TYPES)[number];

/** brain_games slug that plays each content type. */
export const CONTENT_GAME_SLUG: Record<GameContentType, "matching-pairs" | "true-false" | "quiz-race"> = {
  matching: "matching-pairs",
  true_false: "true-false",
  quiz_race: "quiz-race",
};
export const CONTENT_SLUG_TYPE: Record<string, GameContentType> = {
  "matching-pairs": "matching",
  "true-false": "true_false",
  "quiz-race": "quiz_race",
};

/** Minimum number of items a set needs before it can be saved. */
export const MIN_ITEMS: Record<GameContentType, number> = { matching: 4, true_false: 5, quiz_race: 5 };
export const MAX_ITEMS = 300;
export const MAX_OPTIONS = 6;
export const MIN_OPTIONS = 2;

export interface MatchingItem {
  id: string;
  left: LocalizedText;
  right: LocalizedText;
}
export interface TrueFalseItem {
  id: string;
  statement: LocalizedText;
  is_true: boolean;
  explanation?: LocalizedText | null;
}
export interface QuizOption {
  id: string;
  text: LocalizedText;
}
export interface QuizRaceItem {
  id: string;
  question: LocalizedText;
  options: QuizOption[];
  correct_option_id: string;
  explanation?: LocalizedText | null;
}
export type GameContentItem = MatchingItem | TrueFalseItem | QuizRaceItem;
export interface GameContentItemsByType {
  matching: MatchingItem[];
  true_false: TrueFalseItem[];
  quiz_race: QuizRaceItem[];
}

/** Subject keys offered in the admin (free text is allowed through the API, e.g. from an importer). */
export const SUBJECT_KEYS = ["english", "uzbek", "russian", "math", "science", "geography", "history", "informatics", "general", "other"] as const;
export const SUBJECT_LABELS: Record<string, LocalizedText> = {
  english: { uz: "Ingliz tili", ru: "Английский язык", en: "English" },
  uzbek: { uz: "Ona tili", ru: "Узбекский язык", en: "Uzbek" },
  russian: { uz: "Rus tili", ru: "Русский язык", en: "Russian" },
  math: { uz: "Matematika", ru: "Математика", en: "Mathematics" },
  science: { uz: "Tabiiy fanlar", ru: "Естествознание", en: "Science" },
  geography: { uz: "Geografiya", ru: "География", en: "Geography" },
  history: { uz: "Tarix", ru: "История", en: "History" },
  informatics: { uz: "Informatika", ru: "Информатика", en: "Informatics" },
  general: { uz: "Umumiy bilim", ru: "Общие знания", en: "General knowledge" },
  other: { uz: "Boshqa", ru: "Другое", en: "Other" },
};

/** Everything an importer (Word/PDF) must provide to create a content set. */
export interface GameContentDraft<T extends GameContentType = GameContentType> {
  game_type: T;
  title: LocalizedText;
  description?: LocalizedText;
  subject_key: string;
  /** 1..11 or null for "any grade". */
  grade?: number | null;
  difficulty: Difficulty;
  items: GameContentItemsByType[T];
  is_active?: boolean;
  sort_order?: number;
}

// ---------------------------------------------------------------- zod
const part = z.string().max(2000);
/** uz is mandatory (primary language), ru/en may be empty and fall back to uz in the UI. */
const loc = z.object({ uz: part.trim().min(1), ru: part, en: part });
const locOpt = z.object({ uz: part, ru: part, en: part }).nullish();
const itemId = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

export const matchingItemSchema = z.object({ id: itemId, left: loc, right: loc });
export const trueFalseItemSchema = z.object({ id: itemId, statement: loc, is_true: z.boolean(), explanation: locOpt });
export const quizRaceItemSchema = z.object({
  id: itemId,
  question: loc,
  options: z.array(z.object({ id: itemId, text: loc })).min(MIN_OPTIONS).max(MAX_OPTIONS),
  correct_option_id: itemId,
  explanation: locOpt,
});

const SCHEMAS = { matching: matchingItemSchema, true_false: trueFalseItemSchema, quiz_race: quizRaceItemSchema } as const;

export interface ItemIssue {
  /** Dot path relative to the items array, e.g. "2.options.1.text". */
  path: string;
  message: string;
}

/** Validates the `items` array of a set. Returns [] when valid. Shared by the form, API, importer and tests. */
export function validateGameItems(type: GameContentType, items: unknown): ItemIssue[] {
  const issues: ItemIssue[] = [];
  if (!(GAME_CONTENT_TYPES as readonly string[]).includes(type)) return [{ path: "", message: "unknown game type" }];
  if (!Array.isArray(items)) return [{ path: "", message: "items must be an array" }];
  if (items.length < MIN_ITEMS[type]) issues.push({ path: "", message: `at least ${MIN_ITEMS[type]} items are required` });
  if (items.length > MAX_ITEMS) issues.push({ path: "", message: `at most ${MAX_ITEMS} items` });
  const seen = new Set<string>();
  items.forEach((raw, i) => {
    const r = SCHEMAS[type].safeParse(raw);
    if (!r.success) {
      for (const is of r.error.issues) issues.push({ path: [i, ...is.path].join("."), message: is.message });
      return;
    }
    const it = r.data as { id: string; options?: { id: string }[]; correct_option_id?: string };
    if (seen.has(it.id)) issues.push({ path: `${i}.id`, message: "duplicate item id" });
    seen.add(it.id);
    if (type === "quiz_race") {
      const ids = (it.options ?? []).map((o) => o.id);
      if (new Set(ids).size !== ids.length) issues.push({ path: `${i}.options`, message: "duplicate option ids" });
      if (!ids.includes(String(it.correct_option_id))) issues.push({ path: `${i}.correct_option_id`, message: "correct answer is not one of the options" });
    }
  });
  return issues;
}

/** Row stored in `game_content_sets` (also the admin API row shape). */
export interface GameContentSetRow {
  id: string;
  game_type: GameContentType;
  title: LocalizedText;
  description: LocalizedText;
  subject_key: string;
  grade: number | null;
  difficulty: Difficulty;
  items: GameContentItem[];
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

/** Shape-level draft check (metadata + items). Returns [] when valid. */
export function validateGameDraft(draft: GameContentDraft): ItemIssue[] {
  const issues: ItemIssue[] = [];
  if (!loc.safeParse(draft.title).success) issues.push({ path: "title", message: "title.uz is required" });
  if (!/^[a-z0-9_-]{1,40}$/.test(draft.subject_key)) issues.push({ path: "subject_key", message: "subject_key must be a lowercase slug" });
  if (draft.grade != null && !(Number.isInteger(draft.grade) && draft.grade >= 1 && draft.grade <= 11)) issues.push({ path: "grade", message: "grade must be 1..11" });
  if (!["easy", "medium", "hard"].includes(draft.difficulty)) issues.push({ path: "difficulty", message: "invalid difficulty" });
  for (const is of validateGameItems(draft.game_type, draft.items)) issues.push({ path: `items${is.path ? "." + is.path : ""}`, message: is.message });
  return issues;
}
