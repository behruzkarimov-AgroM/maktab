// Types shared by the document-import pipeline (server parsers and the client preview dialog). No server imports here.
import type { Locale } from "@/lib/types";

export type ImportKind = "quiz" | "psych" | "survey" | "game";
export const IMPORT_KINDS: ImportKind[] = ["quiz", "psych", "survey", "game"];
/** admin resource that a kind creates (roles = its write roles) */
export const KIND_RESOURCE = { quiz: "academic_quizzes", psych: "psych_tests", survey: "surveys", game: "game_content_sets" } as const;
export type GameType = "matching" | "true_false" | "quiz_race";
export const GAME_TYPES: GameType[] = ["matching", "true_false", "quiz_race"];
export type GameTypeChoice = GameType | "auto";
export type LangChoice = Locale | "auto";
export type LText = Record<Locale, string>;
export const LOCALES: Locale[] = ["uz", "ru", "en"];
export const emptyL = (): LText => ({ uz: "", ru: "", en: "" });

/** Stable machine codes; the dialog translates them (see `impw_*` keys in ui-i18n.ts). */
export type WarningCode =
  | "no_title"
  | "no_correct"
  | "few_options"
  | "many_options"
  | "dup_letters"
  | "bad_answer"
  | "key_conflict"
  | "no_score"
  | "scores_guessed"
  | "no_options_text"
  | "empty_question"
  | "default_grade"
  | "default_subject"
  | "default_topic"
  | "default_audience"
  | "default_instruction"
  | "default_description"
  | "lang_mismatch"
  | "scale_overlap"
  | "scale_gap"
  | "scale_no_text"
  | "no_scales"
  | "truncated"
  | "bad_header"
  | "type_guessed"
  | "need_options"
  | "bad_scale"
  | "bad_date"
  | "game_few_items"
  | "no_tf_answer"
  | "pair_one_side"
  | "game_type_guessed"
  | "line_skipped"
  | "generic_parser"
  | "ai_structured"
  | "ai_truncated";

export interface Warning {
  code: WarningCode;
  level: "warn" | "error";
  /** small interpolation values, e.g. the clamped limit */
  params?: Record<string, string | number>;
}

export interface OptionDraft {
  id: string;
  text: LText;
  /** psych only */
  score?: number;
}

export interface QuestionDraft {
  /** number as written in the document (informational) */
  n: number;
  text: LText;
  options: OptionDraft[];
  /** quiz only: option id or null when unknown */
  correct: string | null;
  points: number;
  explanation: LText | null;
  warnings: Warning[];
  /** 0..1 */
  confidence: number;
}

export interface ScaleDraft {
  min: number;
  max: number;
  title: LText;
  analysis: LText;
  recommendations: LText;
  warnings: Warning[];
}

export interface QuizDraft {
  kind: "quiz";
  title: LText;
  description: LText;
  subject_key: string;
  subject_name: LText;
  grade: number;
  difficulty: "easy" | "medium" | "hard";
  duration_minutes: number;
  passing_score_percent: number;
  questions: QuestionDraft[];
  warnings: Warning[];
}

export interface PsychDraft {
  kind: "psych";
  title: LText;
  description: LText;
  instruction: LText;
  topic: "interests" | "temperament" | "career" | "readiness" | "emotional";
  target_audience: "kids" | "teens" | "older" | "parents";
  questions: QuestionDraft[];
  scales: ScaleDraft[];
  warnings: Warning[];
}

export type SurveyQType = "single" | "multiple" | "scale" | "text" | "yesno";
export type SurveyAudienceId = "all" | "parents" | "students" | "teachers";

export interface SurveyQuestionDraft {
  n: number;
  type: SurveyQType;
  text: LText;
  options: OptionDraft[];
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: LText;
  scaleMaxLabel: LText;
  required: boolean;
  warnings: Warning[];
  confidence: number;
}

export interface SurveyImportDraft {
  kind: "survey";
  title: LText;
  description: LText;
  audience: SurveyAudienceId;
  startsAt: string | null;
  endsAt: string | null;
  isAnonymous: boolean;
  allowMultiple: boolean;
  questions: SurveyQuestionDraft[];
  warnings: Warning[];
}

export interface PairDraft {
  n: number;
  left: LText;
  right: LText;
  warnings: Warning[];
  confidence: number;
}
export interface StatementDraft {
  n: number;
  text: LText;
  isTrue: boolean | null;
  explanation: LText | null;
  warnings: Warning[];
  confidence: number;
}

/** Content set for a content game. Only the list that matches `gameType` is used (`questions` = quiz race). */
export interface GameImportDraft {
  kind: "game";
  gameType: GameType;
  title: LText;
  description: LText;
  subject_key: string;
  grade: number | null;
  difficulty: "easy" | "medium" | "hard";
  pairs: PairDraft[];
  statements: StatementDraft[];
  questions: QuestionDraft[];
  warnings: Warning[];
}

export type ImportDraft = QuizDraft | PsychDraft | SurveyImportDraft | GameImportDraft;

/** The reviewable items of a draft (questions / pairs / statements) with their common fields. */
export function itemsOf(d: ImportDraft): { warnings: Warning[]; confidence: number }[] {
  if (d.kind !== "game") return d.questions;
  return d.gameType === "matching" ? d.pairs : d.gameType === "true_false" ? d.statements : d.questions;
}

export interface ImportMeta {
  filename: string;
  /** detected file type (sniffed from content, never from the extension): docx, pdf, xlsx, image, ... */
  format: string;
  /** pages / sheets / slides / entries when known */
  units?: { pages?: number; sheets?: number; slides?: number };
  ocr?: boolean;
  /** mean OCR confidence 0..100 */
  ocrConfidence?: number;
  /** which parser produced the draft */
  parser?: "rules" | "generic" | "ai";
  /** extracted text (capped) so staff can check and fix it by hand */
  text?: string;
  /** looks like Uzbek written in Cyrillic */
  uzCyrillic?: boolean;
  /** text was transliterated Cyrillic -> Latin */
  transliterated?: boolean;
  detectedLang: Locale;
  /** languages that actually contain text */
  langs: Locale[];
  chars: number;
}

export interface ImportOk {
  ok: true;
  draft: ImportDraft;
  meta: ImportMeta;
}

/** Stable error codes returned by POST /api/admin/import (never raw messages). */
export const IMPORT_ERRORS = [
  "unauthorized",
  "forbidden",
  "rate_limited",
  "bad_request",
  "kind_invalid",
  "file_required",
  "file_too_large",
  "unsupported_type",
  "bad_magic",
  "zip_bomb",
  "not_docx",
  "macros_not_allowed",
  "docx_failed",
  "pdf_failed",
  "pdf_encrypted",
  "no_selectable_text",
  "empty_document",
  "no_questions",
  "validation",
  "doc_failed",
  "rtf_failed",
  "xlsx_failed",
  "odf_failed",
  "pptx_failed",
  "epub_failed",
  "image_failed",
  "encrypted_file",
  "too_many_entries",
  "ocr_disabled",
  "ocr_failed",
  "ocr_low_confidence",
  "ocr_timeout",
  "ai_unavailable",
  "ai_failed",
  "server_error",
] as const;
export type ImportErrorCode = (typeof IMPORT_ERRORS)[number];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_QUESTIONS = 300;
