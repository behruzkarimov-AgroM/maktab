// Server-side data access for the PUBLIC surveys module (pages + /api/surveys/*).
// Supabase when configured (RPCs only: anon never touches the tables), otherwise the in-memory demo store.
import { createHash, randomUUID } from "node:crypto";
import { demoTable } from "@/lib/admin/demo-store";
import { logError } from "@/lib/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isOpenNow, normSurvey } from "./public";
import { validateAnswers, type AnswerErrorCode } from "./validate";
import type { Answers, PublicSurvey, RoleHint, SurveyQuestionRow } from "./types";

type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Same formula as public.submit_survey_response(): the raw token never reaches storage and cannot be linked across surveys. */
export function hashToken(surveyId: string, token: string): string {
  return createHash("sha256").update(`survey:${surveyId}:${token}`, "utf8").digest("hex");
}

export async function listPublicSurveys(): Promise<PublicSurvey[]> {
  if (isSupabaseConfigured()) {
    try {
      const db = (await getServerClient()) as unknown as Rpc | null;
      if (!db) return [];
      const { data, error } = await db.rpc("list_surveys");
      if (error) {
        logError("surveys:list", error);
        return [];
      }
      return (Array.isArray(data) ? (data as Record<string, unknown>[]) : []).map((r) => normSurvey(r));
    } catch (e) {
      logError("surveys:list", e);
      return [];
    }
  }
  const qs = demoTable("survey_questions");
  return demoTable("surveys")
    .filter((s) => isOpenNow(s))
    .map((s) => normSurvey({ ...s, question_count: qs.filter((q) => q.survey_id === s.id).length }))
    .sort((a, b) => a.title.uz.localeCompare(b.title.uz));
}

export async function getPublicSurvey(id: string): Promise<PublicSurvey | null> {
  if (isSupabaseConfigured()) {
    if (!UUID.test(id)) return null;
    try {
      const db = (await getServerClient()) as unknown as Rpc | null;
      if (!db) return null;
      const { data, error } = await db.rpc("get_survey", { p_id: id });
      if (error || !data || typeof data !== "object") {
        if (error) logError("surveys:get", error);
        return null;
      }
      const row = data as Record<string, unknown>;
      return normSurvey(row, Array.isArray(row.questions) ? (row.questions as Record<string, unknown>[]) : []);
    } catch (e) {
      logError("surveys:get", e);
      return null;
    }
  }
  if (!DEMO_ID.test(id)) return null;
  const s = demoTable("surveys").find((x) => String(x.id) === id);
  if (!s || !isOpenNow(s)) return null;
  return normSurvey(s, demoTable("survey_questions").filter((q) => String(q.survey_id) === id));
}

export type SubmitErrorCode = AnswerErrorCode | "not_found" | "survey_closed" | "already_responded" | "unavailable" | "server";
export type SubmitResult = { ok: true } | { ok: false; code: SubmitErrorCode };

export interface SubmitInput {
  surveyId: string;
  answers: Record<string, unknown>;
  token: string;
  roleHint?: RoleHint;
  grade?: number;
}

const KNOWN: SubmitErrorCode[] = ["invalid_input", "required_missing", "invalid_answer", "not_found", "survey_closed", "already_responded"];

export async function submitSurveyResponse(input: SubmitInput): Promise<SubmitResult> {
  if (isSupabaseConfigured()) {
    if (!UUID.test(input.surveyId)) return { ok: false, code: "not_found" };
    const db = getAdminClient() as unknown as Rpc | null;
    // responses are written with the service role only (the route adds rate limits + bot traps)
    if (!db) return { ok: false, code: "unavailable" };
    try {
      const { error } = await db.rpc("submit_survey_response", {
        p_survey: input.surveyId,
        p_answers: input.answers,
        p_token: input.token,
        p_role_hint: input.roleHint ?? null,
        p_grade: input.grade ?? null,
      });
      if (!error) return { ok: true };
      const m = error.message ?? "";
      const code = KNOWN.find((c) => m.includes(c));
      if (code) return { ok: false, code };
      logError("surveys:submit", error);
      return { ok: false, code: "server" };
    } catch (e) {
      logError("surveys:submit", e);
      return { ok: false, code: "server" };
    }
  }

  // ---- demo store (mirrors the SQL function) ----
  if (!DEMO_ID.test(input.surveyId)) return { ok: false, code: "not_found" };
  const survey = demoTable("surveys").find((x) => String(x.id) === input.surveyId);
  if (!survey || !survey.is_active) return { ok: false, code: "not_found" };
  if (!isOpenNow(survey)) return { ok: false, code: "survey_closed" };
  if (survey.is_anonymous === false && !input.roleHint) return { ok: false, code: "invalid_input" };
  const hash = hashToken(input.surveyId, input.token);
  const rows = demoTable("survey_responses");
  if (!survey.allow_multiple_responses && rows.some((r) => r.survey_id === input.surveyId && r.respondent_token_hash === hash)) {
    return { ok: false, code: "already_responded" };
  }
  const questions = demoTable("survey_questions")
    .filter((q) => String(q.survey_id) === input.surveyId)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order)) as unknown as SurveyQuestionRow[];
  if (questions.length === 0) return { ok: false, code: "not_found" };
  const v = validateAnswers(questions, input.answers);
  if (!v.ok) return { ok: false, code: v.code };
  rows.push({
    id: `resp-${randomUUID()}`,
    survey_id: input.surveyId,
    respondent_token_hash: hash,
    role_hint: input.roleHint ?? null,
    grade: input.grade ?? null,
    answers: v.clean as Answers,
    created_at: new Date().toISOString(),
  } as never);
  return { ok: true };
}
