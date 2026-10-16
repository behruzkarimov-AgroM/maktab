// Answer validation shared by the demo store and the tests. Mirrors public.submit_survey_response() in schema.sql.
import { z } from "zod";
import {
  MAX_TEXT_ANSWER,
  ROLE_HINTS,
  type Answers,
  type PublicSurveyQuestion,
  type SurveyQuestionRow,
} from "./types";

export type AnswerErrorCode = "invalid_input" | "required_missing" | "invalid_answer";
export type AnswerResult = { ok: true; clean: Answers } | { ok: false; code: AnswerErrorCode; questionId?: string };

type Q = Pick<SurveyQuestionRow | PublicSurveyQuestion, "id" | "type" | "options" | "scale_min" | "scale_max" | "required">;

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/**
 * Validates and cleans a submitted answer map against the survey's questions.
 * Unknown keys are dropped, optional blanks are skipped, text is trimmed.
 */
export function validateAnswers(questions: Q[], answers: unknown): AnswerResult {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return { ok: false, code: "invalid_input" };
  if (JSON.stringify(answers).length > 20000) return { ok: false, code: "invalid_input" };
  const input = answers as Record<string, unknown>;
  const clean: Answers = {};
  for (const q of questions) {
    const v = input[q.id];
    if (isBlank(v)) {
      if (q.required) return { ok: false, code: "required_missing", questionId: q.id };
      continue;
    }
    const ids = new Set((q.options ?? []).map((o) => o.id));
    switch (q.type) {
      case "single":
        if (typeof v !== "string" || !ids.has(v)) return { ok: false, code: "invalid_answer", questionId: q.id };
        clean[q.id] = v;
        break;
      case "multiple": {
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !ids.has(x)) || new Set(v).size !== v.length || v.length > ids.size) {
          return { ok: false, code: "invalid_answer", questionId: q.id };
        }
        clean[q.id] = v as string[];
        break;
      }
      case "scale":
        if (typeof v !== "number" || !Number.isInteger(v) || v < q.scale_min || v > q.scale_max) return { ok: false, code: "invalid_answer", questionId: q.id };
        clean[q.id] = v;
        break;
      case "yesno":
        if (v !== "yes" && v !== "no") return { ok: false, code: "invalid_answer", questionId: q.id };
        clean[q.id] = v;
        break;
      case "text": {
        if (typeof v !== "string" || v.length > MAX_TEXT_ANSWER) return { ok: false, code: "invalid_answer", questionId: q.id };
        clean[q.id] = v.trim();
        break;
      }
      default:
        return { ok: false, code: "invalid_input" };
    }
  }
  return { ok: true, clean };
}

/** Token format accepted by the API and the RPC (UUID-like, url-safe). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Request body of POST /api/surveys/submit. */
export const submitSchema = z.object({
  surveyId: z.string().min(1).max(64),
  answers: z
    .record(
      z.string().min(1).max(64),
      z.union([z.string().max(MAX_TEXT_ANSWER), z.number().int().min(-1000).max(1000), z.array(z.string().min(1).max(64)).max(20)]),
    )
    .refine((a) => Object.keys(a).length <= 100, { message: "too many answers" }),
  token: z.string().regex(TOKEN_RE),
  roleHint: z.enum(ROLE_HINTS).optional(),
  grade: z.number().int().min(1).max(11).optional(),
  /** honeypot (humans leave it empty) */
  website: z.string().max(200).optional(),
  formStartedAt: z.number().optional(),
});
export type SubmitBody = z.infer<typeof submitSchema>;
