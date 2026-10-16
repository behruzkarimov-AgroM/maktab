// Pure aggregation of survey responses. Produces the same JSON shape as public.survey_stats() in schema.sql.
import type { QuestionStats, SurveyQuestionRow, SurveyResponseRow, SurveyStats } from "./types";

export const MAX_TEXT_SAMPLES = 300;

export interface DateRange {
  /** inclusive ISO timestamp */
  from?: string | null;
  /** exclusive ISO timestamp */
  to?: string | null;
}

export function filterResponses<T extends { created_at: string }>(rows: T[], range: DateRange = {}): T[] {
  const from = range.from ? new Date(range.from).getTime() : null;
  const to = range.to ? new Date(range.to).getTime() : null;
  return rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return (from === null || t >= from) && (to === null || t < to);
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const present = (v: unknown) => v !== undefined && v !== null;

export function aggregateSurvey(
  surveyId: string,
  questionRows: SurveyQuestionRow[],
  responseRows: Pick<SurveyResponseRow, "answers" | "created_at" | "role_hint">[],
  range: DateRange = {},
): SurveyStats {
  const rows = filterResponses(responseRows, range);
  const questions = [...questionRows].sort((a, b) => a.sort_order - b.sort_order);

  const stats: QuestionStats[] = questions.map((q) => {
    const answered = rows.filter((r) => present(r.answers?.[q.id])).length;
    const base: QuestionStats = { id: q.id, type: q.type, answered };
    switch (q.type) {
      case "single":
        base.counts = (q.options ?? []).map((o) => ({ id: o.id, count: rows.filter((r) => r.answers?.[q.id] === o.id).length }));
        break;
      case "multiple":
        base.counts = (q.options ?? []).map((o) => ({
          id: o.id,
          count: rows.filter((r) => {
            const a = r.answers?.[q.id];
            return Array.isArray(a) && a.includes(o.id);
          }).length,
        }));
        break;
      case "yesno":
        base.counts = ["yes", "no"].map((id) => ({ id, count: rows.filter((r) => r.answers?.[q.id] === id).length }));
        break;
      case "scale": {
        const vals = rows.map((r) => r.answers?.[q.id]).filter((v): v is number => typeof v === "number");
        const distribution: { value: number; count: number }[] = [];
        for (let v = q.scale_min; v <= q.scale_max; v++) distribution.push({ value: v, count: vals.filter((x) => x === v).length });
        base.scale = {
          avg: vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
          min: vals.length ? Math.min(...vals) : null,
          max: vals.length ? Math.max(...vals) : null,
          distribution,
        };
        break;
      }
      case "text":
        base.texts = rows
          .filter((r) => typeof r.answers?.[q.id] === "string")
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, MAX_TEXT_SAMPLES)
          .map((r) => ({ text: r.answers[q.id] as string, created_at: r.created_at }));
        break;
    }
    return base;
  });

  const roleMap = new Map<string, number>();
  const dayMap = new Map<string, number>();
  for (const r of rows) {
    const role = r.role_hint ?? "unknown";
    roleMap.set(role, (roleMap.get(role) ?? 0) + 1);
    const day = new Date(r.created_at).toISOString().slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const times = rows.map((r) => r.created_at).sort();
  return {
    survey_id: surveyId,
    total: rows.length,
    first_at: times[0] ?? null,
    last_at: times[times.length - 1] ?? null,
    by_role: [...roleMap].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count || a.role.localeCompare(b.role)),
    by_day: [...dayMap].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    questions: stats,
  };
}

/** Flat table (header + rows) for CSV / XLSX export. Option ids are replaced by their labels. */
export function responsesTable(
  questions: SurveyQuestionRow[],
  responses: Pick<SurveyResponseRow, "answers" | "created_at" | "role_hint" | "grade">[],
  label: (l: unknown) => string,
  head: { date: string; role: string; grade: string },
): { header: string[]; rows: (string | number)[][] } {
  const qs = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  const header = [head.date, head.role, head.grade, ...qs.map((q, i) => `Q${i + 1}: ${label(q.question_text)}`)];
  const optLabel = (q: SurveyQuestionRow, id: string) => {
    const o = q.options?.find((x) => x.id === id);
    return o ? label(o.text) : id;
  };
  const rows = responses.map((r) => [
    r.created_at,
    r.role_hint ?? "",
    r.grade ?? "",
    ...qs.map((q) => {
      const a = r.answers?.[q.id];
      if (!present(a)) return "";
      if (q.type === "single") return optLabel(q, String(a));
      if (q.type === "multiple") return Array.isArray(a) ? a.map((x) => optLabel(q, String(x))).join("; ") : "";
      if (q.type === "scale") return typeof a === "number" ? a : "";
      return String(a);
    }),
  ]);
  return { header, rows };
}
