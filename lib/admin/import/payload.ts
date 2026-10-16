// Draft -> payloads for the EXISTING admin API (validated there by lib/admin/validation.ts). Client-safe, pure.
import type { LText, PsychDraft, QuestionDraft, QuizDraft, ScaleDraft } from "./types";
import { LOCALES } from "./types";

/** `uz` is required by the schemas: when the document language is not Uzbek, the source text is copied into `uz`
 *  (so nothing is lost and the TrilingualField shows what still needs translating). */
export function withUz(v: LText | null | undefined, fallback = ""): LText {
  const o: LText = { uz: v?.uz ?? "", ru: v?.ru ?? "", en: v?.en ?? "" };
  if (!o.uz.trim()) o.uz = (o.ru || o.en || fallback).trim();
  return o;
}

const optionalL = (v: LText | null | undefined): LText | null => (v && LOCALES.some((l) => v[l]?.trim()) ? withUz(v) : null);

export function quizPayload(d: QuizDraft, isActive: boolean) {
  return {
    title: withUz(d.title, "Test"),
    description: optionalL(d.description),
    subject_key: d.subject_key || "general",
    subject_name: withUz(d.subject_name, d.subject_key || "General"),
    grade: String(d.grade),
    difficulty: d.difficulty,
    duration_minutes: d.duration_minutes,
    passing_score_percent: d.passing_score_percent,
    is_active: isActive,
  };
}

export function quizQuestionsPayload(qs: QuestionDraft[], quizId: string | number) {
  return qs.map((q, i) => ({
    quiz_id: quizId,
    question_text: withUz(q.text, "?"),
    options: q.options.map((o) => ({ id: o.id, text: withUz(o.text, o.id) })),
    correct_option_id: q.correct ?? "A",
    points: q.points,
    explanation: optionalL(q.explanation),
    sort_order: i + 1,
  }));
}

export function psychPayload(d: PsychDraft, isActive: boolean) {
  return {
    title: withUz(d.title, "Test"),
    description: withUz(d.description, d.title.uz || d.title.ru || d.title.en),
    instruction: withUz(d.instruction, "-"),
    topic: d.topic,
    target_audience: d.target_audience,
    is_active: isActive,
  };
}

export function psychQuestionsPayload(qs: QuestionDraft[], testId: string | number) {
  return qs.map((q, i) => ({
    psych_test_id: testId,
    question_text: withUz(q.text, "?"),
    options: q.options.map((o) => ({ id: o.id, text: withUz(o.text, o.id), score: o.score ?? 0 })),
    sort_order: i + 1,
  }));
}

const COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#6366f1"];

export function scalesPayload(scales: ScaleDraft[], testId: string | number) {
  return scales.map((s, i) => ({
    psych_test_id: testId,
    min_score: s.min,
    max_score: s.max,
    result_title: withUz(s.title, `${s.min}-${s.max}`),
    psychological_analysis: withUz(s.analysis, s.title.uz || s.title.ru || s.title.en),
    recommendations_for_parents: withUz(s.recommendations, "-"),
    badge_color: COLORS[i % COLORS.length],
  }));
}
