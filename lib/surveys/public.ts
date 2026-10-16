// Pure mappers from stored rows to the public (anonymous) shape. Used by the demo path, normalisers and tests.
import type { LocalizedText } from "@/lib/types";
import {
  emptyL,
  type PublicSurvey,
  type PublicSurveyQuestion,
  type SurveyAudience,
  type SurveyOption,
  type SurveyQuestionType,
  QUESTION_TYPES,
  SURVEY_AUDIENCES,
} from "./types";

export const toLoc = (v: unknown): LocalizedText => {
  if (typeof v === "string") return { uz: v, ru: v, en: v };
  const o = (v && typeof v === "object" ? v : {}) as Partial<LocalizedText>;
  return { uz: String(o.uz ?? ""), ru: String(o.ru ?? ""), en: String(o.en ?? "") };
};

type Rec = Record<string, unknown>;

export function isOpenNow(s: Record<string, unknown>, now = Date.now()): boolean {
  if (!s.is_active) return false;
  if (typeof s.starts_at === "string" && s.starts_at && new Date(s.starts_at).getTime() > now) return false;
  if (typeof s.ends_at === "string" && s.ends_at && new Date(s.ends_at).getTime() < now) return false;
  return true;
}

export function normQuestion(r: Rec): PublicSurveyQuestion {
  const type = (QUESTION_TYPES as readonly string[]).includes(String(r.type)) ? (r.type as SurveyQuestionType) : "text";
  const options: SurveyOption[] = (Array.isArray(r.options) ? (r.options as Rec[]) : []).map((o) => ({ id: String(o.id), text: toLoc(o.text) }));
  return {
    id: String(r.id),
    type,
    question_text: toLoc(r.question_text),
    options: type === "single" || type === "multiple" ? options : [],
    scale_min: Number(r.scale_min ?? 1),
    scale_max: Number(r.scale_max ?? 5),
    scale_min_label: r.scale_min_label ? toLoc(r.scale_min_label) : emptyL(),
    scale_max_label: r.scale_max_label ? toLoc(r.scale_max_label) : emptyL(),
    required: r.required !== false,
    sort_order: Number(r.sort_order ?? 0),
  };
}

export function normSurvey(r: Rec, questions?: Rec[]): PublicSurvey {
  const audience = (SURVEY_AUDIENCES as readonly string[]).includes(String(r.audience)) ? (r.audience as SurveyAudience) : "all";
  const qs = questions ? [...questions].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)).map(normQuestion) : undefined;
  return {
    id: String(r.id),
    title: toLoc(r.title),
    description: toLoc(r.description),
    audience,
    starts_at: typeof r.starts_at === "string" ? r.starts_at : null,
    ends_at: typeof r.ends_at === "string" ? r.ends_at : null,
    is_anonymous: r.is_anonymous !== false,
    allow_multiple_responses: r.allow_multiple_responses === true,
    question_count: typeof r.question_count === "number" ? r.question_count : (qs?.length ?? 0),
    ...(qs ? { questions: qs } : {}),
  };
}
