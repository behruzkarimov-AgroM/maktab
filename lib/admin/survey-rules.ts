// Cross-field rules for surveys / survey questions. Client-safe (used by validation.ts for the forms and the API).
import { CHOICE_TYPES, MAX_OPTIONS, QUESTION_TYPES, type SurveyQuestionType } from "@/lib/surveys/types";

export interface RuleIssue {
  path: (string | number)[];
  message: string;
}

const OPTION_ID = /^[A-Za-z0-9_-]{1,32}$/;
const isType = (v: unknown): v is SurveyQuestionType => typeof v === "string" && (QUESTION_TYPES as readonly string[]).includes(v);

/**
 * survey_questions: choice questions need 2..10 options with unique, url-safe ids and a non-empty Uzbek text;
 * scale questions need scale_min < scale_max inside 0..10.
 * Only the keys present in `d` are checked, so a partial update (e.g. reordering) passes.
 */
export function surveyQuestionIssues(d: Record<string, unknown>): RuleIssue[] {
  const out: RuleIssue[] = [];
  const type = d.type;
  if (type !== undefined && !isType(type)) out.push({ path: ["type"], message: "invalid question type" });

  if (isType(type) && CHOICE_TYPES.includes(type)) {
    const opts = Array.isArray(d.options) ? (d.options as Record<string, unknown>[]) : null;
    if (!opts || opts.length < 2) out.push({ path: ["options"], message: "choice questions need at least 2 options" });
    else {
      if (opts.length > MAX_OPTIONS) out.push({ path: ["options"], message: `at most ${MAX_OPTIONS} options` });
      const ids = opts.map((o) => String(o?.id ?? ""));
      if (ids.some((x) => !OPTION_ID.test(x)) || new Set(ids).size !== ids.length) out.push({ path: ["options"], message: "duplicate option ids" });
      opts.forEach((o, i) => {
        const text = o?.text as { uz?: unknown } | undefined;
        if (!text || typeof text.uz !== "string" || text.uz.trim() === "") out.push({ path: ["options", i, "text", "uz"], message: "option text is required" });
      });
    }
  }

  if (isType(type) && type === "scale") {
    const min = d.scale_min;
    const max = d.scale_max;
    if (typeof min === "number" && typeof max === "number") {
      if (min >= max) out.push({ path: ["scale_max"], message: "scale_max must be greater than scale_min" });
      if (min < 0 || max > 10) out.push({ path: ["scale_max"], message: "scale must stay within 0..10" });
    }
  }
  return out;
}

/** surveys: starts_at must not be after ends_at. */
export function surveyIssues(d: Record<string, unknown>): RuleIssue[] {
  const a = typeof d.starts_at === "string" && d.starts_at ? new Date(d.starts_at).getTime() : NaN;
  const b = typeof d.ends_at === "string" && d.ends_at ? new Date(d.ends_at).getTime() : NaN;
  if (Number.isFinite(a) && Number.isFinite(b) && a > b) return [{ path: ["ends_at"], message: "end date must be after the start date" }];
  return [];
}

/** Post-parse cleanup for a survey question: unused option/scale data is neutralised so the DB row stays tidy. */
export function normalizeSurveyQuestion(out: Record<string, unknown>): Record<string, unknown> {
  const type = out.type;
  if (isType(type) && !CHOICE_TYPES.includes(type) && "options" in out) out.options = [];
  if (Array.isArray(out.options) && isType(type) && CHOICE_TYPES.includes(type)) {
    out.options = (out.options as Record<string, unknown>[]).map((o) => {
      const t = (o.text ?? {}) as Record<string, string>;
      return { id: String(o.id), text: { uz: (t.uz ?? "").trim(), ru: (t.ru ?? "").trim(), en: (t.en ?? "").trim() } };
    });
  }
  return out;
}
