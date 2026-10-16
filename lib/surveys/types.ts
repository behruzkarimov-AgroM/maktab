// Shared (client + server safe) types for the surveys module. No scoring: every answer is data, never "right".
import type { LocalizedText } from "@/lib/types";

export const QUESTION_TYPES = ["single", "multiple", "scale", "text", "yesno"] as const;
export type SurveyQuestionType = (typeof QUESTION_TYPES)[number];
export const CHOICE_TYPES: SurveyQuestionType[] = ["single", "multiple"];

export const SURVEY_AUDIENCES = ["all", "parents", "students", "teachers"] as const;
export type SurveyAudience = (typeof SURVEY_AUDIENCES)[number];

export const ROLE_HINTS = ["parent", "student", "teacher", "other"] as const;
export type RoleHint = (typeof ROLE_HINTS)[number];

export const MAX_TEXT_ANSWER = 1000;
export const MAX_OPTIONS = 10;

/** A single stored answer value. single/yesno: string, multiple: string[], scale: integer, text: string. */
export type AnswerValue = string | number | string[];
export type Answers = Record<string, AnswerValue>;

export interface SurveyOption {
  id: string;
  text: LocalizedText;
}

/** Question as sent to anonymous visitors (no internals). */
export interface PublicSurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  question_text: LocalizedText;
  options: SurveyOption[];
  scale_min: number;
  scale_max: number;
  scale_min_label: LocalizedText;
  scale_max_label: LocalizedText;
  required: boolean;
  sort_order: number;
}

export interface PublicSurvey {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  audience: SurveyAudience;
  starts_at: string | null;
  ends_at: string | null;
  is_anonymous: boolean;
  allow_multiple_responses: boolean;
  question_count: number;
  /** present for get_survey, absent for list_surveys */
  questions?: PublicSurveyQuestion[];
}

/* ------------------------------ statistics ------------------------------ */

export interface QuestionStats {
  id: string;
  type: SurveyQuestionType;
  /** number of responses that answered this question */
  answered: number;
  /** single / multiple / yesno */
  counts?: { id: string; count: number }[];
  /** scale */
  scale?: { avg: number | null; min: number | null; max: number | null; distribution: { value: number; count: number }[] };
  /** text (newest first, capped) */
  texts?: { text: string; created_at: string }[];
}

export interface SurveyStats {
  survey_id: string;
  total: number;
  first_at: string | null;
  last_at: string | null;
  by_role: { role: string; count: number }[];
  by_day: { date: string; count: number }[];
  questions: QuestionStats[];
}

/** Row shapes as stored (DB columns / demo store). */
export interface SurveyQuestionRow {
  id: string;
  survey_id: string;
  type: SurveyQuestionType;
  question_text: LocalizedText;
  options: SurveyOption[];
  scale_min: number;
  scale_max: number;
  scale_min_label?: LocalizedText | null;
  scale_max_label?: LocalizedText | null;
  required: boolean;
  sort_order: number;
  created_at?: string;
}

export interface SurveyRow {
  id: string;
  title: LocalizedText;
  description?: LocalizedText | null;
  audience: SurveyAudience;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  is_anonymous: boolean;
  allow_multiple_responses: boolean;
  created_at?: string;
}

export interface SurveyResponseRow {
  id: string;
  survey_id: string;
  respondent_token_hash: string;
  role_hint: RoleHint | null;
  grade: number | null;
  answers: Answers;
  created_at: string;
}

export const emptyL = (): LocalizedText => ({ uz: "", ru: "", en: "" });
