// Server-side loader for the admin survey results page. Callers MUST have passed lib/admin/auth.guard() first.
// Supabase: public.survey_stats() through the signed-in staff member's own client (the function re-checks the role);
// demo mode: the pure aggregator over the in-memory store.
import { demoTable } from "./demo-store";
import { RESOURCE_MAP } from "./resources";
import { getRow, listRows, StoreError } from "./store";
import { getUserClient, isConfigured } from "./supabase";
import { aggregateSurvey, filterResponses, type DateRange } from "@/lib/surveys/aggregate";
import type { SurveyQuestionRow, SurveyResponseRow, SurveyStats } from "@/lib/surveys/types";
import type { Row } from "./types";

export const MAX_EXPORT_ROWS = 10000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" bounds (UTC): from is inclusive, `to` is the END of that day (exclusive next midnight). Null on a malformed date. */
export function parseRange(from?: string | null, to?: string | null): DateRange | null {
  const out: DateRange = {};
  if (from) {
    if (!DAY.test(from) || Number.isNaN(Date.parse(from))) return null;
    out.from = `${from}T00:00:00.000Z`;
  }
  if (to) {
    if (!DAY.test(to) || Number.isNaN(Date.parse(to))) return null;
    out.to = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86400000).toISOString();
  }
  if (out.from && out.to && out.from >= out.to) return null;
  return out;
}

export type ExportResponse = Pick<SurveyResponseRow, "created_at" | "role_hint" | "grade" | "answers">;

export interface SurveyResults {
  survey: Row;
  questions: SurveyQuestionRow[];
  stats: SurveyStats;
  /** only when requested (export) */
  responses?: ExportResponse[];
  truncated?: boolean;
}

export async function loadSurveyResults(id: string, range: DateRange, withRows: boolean): Promise<SurveyResults | null> {
  const survey = await getRow(RESOURCE_MAP.surveys, id);
  if (!survey) return null;
  const questions = (await listRows(RESOURCE_MAP.survey_questions, { all: true, filters: { survey_id: id } })).rows as unknown as SurveyQuestionRow[];
  const byOrder = [...questions].sort((a, b) => a.sort_order - b.sort_order);

  if (!isConfigured()) {
    const all = demoTable("survey_responses").filter((r) => String(r.survey_id) === id) as unknown as SurveyResponseRow[];
    const stats = aggregateSurvey(id, byOrder, all, range);
    if (!withRows) return { survey, questions: byOrder, stats };
    const responses = filterResponses(all, range)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, MAX_EXPORT_ROWS)
      .map(({ created_at, role_hint, grade, answers }) => ({ created_at, role_hint, grade, answers }));
    return { survey, questions: byOrder, stats, responses };
  }

  const c = await getUserClient();
  const { data, error } = await c.rpc("survey_stats", { p_survey: id, p_from: range.from ?? null, p_to: range.to ?? null });
  if (error) {
    if (/forbidden/.test(error.message)) throw new StoreError("forbidden", 403);
    throw new StoreError(error.message, 500);
  }
  const stats = data as SurveyStats;
  if (!withRows) return { survey, questions: byOrder, stats };
  let q = c
    .from("survey_responses")
    .select("created_at,role_hint,grade,answers")
    .eq("survey_id", id)
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_ROWS);
  if (range.from) q = q.gte("created_at", range.from);
  if (range.to) q = q.lt("created_at", range.to);
  const rows = await q;
  if (rows.error) throw new StoreError(rows.error.message, 500);
  const responses = (rows.data ?? []) as ExportResponse[];
  return { survey, questions: byOrder, stats, responses, truncated: stats.total > responses.length };
}
