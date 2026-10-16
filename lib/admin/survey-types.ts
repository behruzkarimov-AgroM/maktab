// Types for creating surveys programmatically (e.g. from a parsed Word / PDF document). Client-safe.
import type { SurveyAudience, SurveyQuestionType } from "@/lib/surveys/types";
import type { Row } from "./types";

/** Text in one or more languages. A plain string is used for all three; missing languages fall back to the first filled one. */
export type DraftText = string | { uz?: string; ru?: string; en?: string };

export interface SurveyDraftOption {
  /** optional: letters A, B, C... are assigned when omitted or not url-safe */
  id?: string;
  text: DraftText;
}

export interface SurveyDraftQuestion {
  type: SurveyQuestionType;
  text: DraftText;
  /** single / multiple only (2..10) */
  options?: SurveyDraftOption[];
  /** scale only; defaults 1..5 */
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: DraftText;
  scaleMaxLabel?: DraftText;
  /** default true */
  required?: boolean;
}

export interface SurveyDraft {
  title: DraftText;
  description?: DraftText;
  /** default "all" */
  audience?: SurveyAudience;
  /** ISO strings; null/omitted = no limit */
  startsAt?: string | null;
  endsAt?: string | null;
  /** default FALSE: an imported survey stays hidden until a person reviews and activates it */
  isActive?: boolean;
  /** default true */
  isAnonymous?: boolean;
  /** default false */
  allowMultipleResponses?: boolean;
  questions: SurveyDraftQuestion[];
}

export interface CreateSurveyResult {
  survey: Row;
  questions: Row[];
}

export interface DraftIssue {
  /** e.g. "title" or "questions.2.options" */
  path: string;
  message: string;
}
