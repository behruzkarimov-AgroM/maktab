// Creates a survey with its questions from a typed draft. This is the single entry point other code
// (e.g. the Word / PDF importer) should call: it normalises the draft, runs the SAME validation as the admin
// forms (zod + cross-field rules), writes through the shared store (Supabase or demo) and records an audit entry.
//
//   const { survey, questions } = await createSurveyFromDraft(draft, session);
//
// Callers MUST have authorised the user first (e.g. lib/admin/auth.guard("surveys", "write")).
import type { LocalizedText } from "@/lib/types";
import { CHOICE_TYPES, QUESTION_TYPES, SURVEY_AUDIENCES } from "@/lib/surveys/types";
import { logAudit } from "./audit";
import { RESOURCE_MAP } from "./resources";
import { createMany, createRow, deleteRow } from "./store";
import type { CreateSurveyResult, DraftIssue, DraftText, SurveyDraft } from "./survey-types";
import type { AdminSession } from "./types";
import { buildSchema, normalize } from "./validation";

export const MAX_DRAFT_QUESTIONS = 100;
const LETTERS = "ABCDEFGHIJ";
const OPTION_ID = /^[A-Za-z0-9_-]{1,32}$/;

export class SurveyDraftError extends Error {
  override name = "SurveyDraftError";
  constructor(public issues: DraftIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  }
}

/** String -> all languages; partial object -> missing languages copy the first filled one. */
export function fillText(v: DraftText | null | undefined): LocalizedText {
  if (v == null) return { uz: "", ru: "", en: "" };
  if (typeof v === "string") {
    const s = v.trim();
    return { uz: s, ru: s, en: s };
  }
  const parts = { uz: (v.uz ?? "").trim(), ru: (v.ru ?? "").trim(), en: (v.en ?? "").trim() };
  const first = parts.uz || parts.ru || parts.en;
  return { uz: parts.uz || first, ru: parts.ru || first, en: parts.en || first };
}

export interface DraftRows {
  survey: Record<string, unknown>;
  questions: Record<string, unknown>[];
}

/** Pure mapping draft -> DB row shapes (no I/O). Throws SurveyDraftError for structural problems. */
export function draftToRows(draft: SurveyDraft): DraftRows {
  const issues: DraftIssue[] = [];
  if (!draft || typeof draft !== "object") throw new SurveyDraftError([{ path: "draft", message: "draft is required" }]);
  if (!Array.isArray(draft.questions) || draft.questions.length === 0) issues.push({ path: "questions", message: "at least one question is required" });
  if (Array.isArray(draft.questions) && draft.questions.length > MAX_DRAFT_QUESTIONS) issues.push({ path: "questions", message: `at most ${MAX_DRAFT_QUESTIONS} questions` });
  const audience = draft.audience ?? "all";
  if (!(SURVEY_AUDIENCES as readonly string[]).includes(audience)) issues.push({ path: "audience", message: "invalid audience" });

  const survey = {
    title: fillText(draft.title),
    description: fillText(draft.description),
    audience,
    starts_at: draft.startsAt || null,
    ends_at: draft.endsAt || null,
    is_active: draft.isActive ?? false,
    is_anonymous: draft.isAnonymous ?? true,
    allow_multiple_responses: draft.allowMultipleResponses ?? false,
  };

  const questions = (Array.isArray(draft.questions) ? draft.questions : []).map((q, i) => {
    const at = `questions.${i}`;
    if (!q || !(QUESTION_TYPES as readonly string[]).includes(q.type)) {
      issues.push({ path: `${at}.type`, message: "invalid question type" });
      return {} as Record<string, unknown>;
    }
    const choice = CHOICE_TYPES.includes(q.type);
    const options = choice
      ? (q.options ?? []).map((o, k) => ({
          id: o.id && OPTION_ID.test(o.id) && !(q.options ?? []).slice(0, k).some((p) => p.id === o.id) ? o.id : LETTERS[k] ?? `O${k + 1}`,
          text: fillText(o.text),
        }))
      : [];
    return {
      type: q.type,
      question_text: fillText(q.text),
      options,
      scale_min: q.type === "scale" ? (q.scaleMin ?? 1) : 1,
      scale_max: q.type === "scale" ? (q.scaleMax ?? 5) : 5,
      scale_min_label: fillText(q.type === "scale" ? q.scaleMinLabel : ""),
      scale_max_label: fillText(q.type === "scale" ? q.scaleMaxLabel : ""),
      required: q.required ?? true,
      sort_order: i + 1,
    } as Record<string, unknown>;
  });

  if (issues.length) throw new SurveyDraftError(issues);
  return { survey, questions };
}

/** Validates rows with the admin zod schemas (same rules as the forms); throws SurveyDraftError. */
export function validateDraftRows(rows: DraftRows): DraftRows {
  const issues: DraftIssue[] = [];
  const surveyRes = RESOURCE_MAP.surveys;
  const qRes = RESOURCE_MAP.survey_questions;
  const s = buildSchema(surveyRes, "create").safeParse(rows.survey);
  if (!s.success) for (const i of s.error.issues) issues.push({ path: i.path.join("."), message: i.message });
  const questions: Record<string, unknown>[] = [];
  rows.questions.forEach((q, idx) => {
    const r = buildSchema(qRes, "create").safeParse({ ...q, survey_id: "pending" });
    if (!r.success) for (const i of r.error.issues) issues.push({ path: `questions.${idx}.${i.path.join(".")}`, message: i.message });
    else {
      const { survey_id: _omit, ...rest } = normalize(qRes, r.data as Record<string, unknown>);
      void _omit;
      questions.push(rest);
    }
  });
  if (issues.length || !s.success) throw new SurveyDraftError(issues);
  return { survey: normalize(surveyRes, s.data as Record<string, unknown>), questions };
}

/**
 * Creates the survey and all questions. If inserting the questions fails the survey is removed again
 * (no half-created surveys). An imported survey is INACTIVE unless `draft.isActive` is true.
 */
export async function createSurveyFromDraft(draft: SurveyDraft, session?: AdminSession): Promise<CreateSurveyResult> {
  const rows = validateDraftRows(draftToRows(draft));
  const survey = await createRow(RESOURCE_MAP.surveys, rows.survey);
  try {
    const questions = await createMany(
      RESOURCE_MAP.survey_questions,
      rows.questions.map((q) => ({ ...q, survey_id: survey.id })),
    );
    if (session) await logAudit(session, "create", "surveys", survey.id, { source: "draft", questions: questions.length });
    return { survey, questions };
  } catch (e) {
    await deleteRow(RESOURCE_MAP.surveys, String(survey.id)).catch(() => false);
    throw e;
  }
}
