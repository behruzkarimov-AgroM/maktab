// DEMO MODE ONLY (no Supabase): exposes ACTIVE quizzes / psych tests created in the admin (shared in-memory demo store)
// to the public pages, next to the built-in seeds. Server-side only: answer keys and scores stay here.
import type { DemoQuestion } from "@/components/quiz/demo";
import type { QuizSummary } from "@/components/quiz/types";
import type { DemoTest } from "@/components/psych/types";
import type { LocalizedText } from "@/lib/types";
import { demoTable } from "./demo-store";

// ids of the admin's own built-in seed rows (quiz-1, psy-1 ...): the public site has its own seeds, so they are not duplicated
const SEED_ID = /^(quiz|psy)-\d+$/;
const loc = (v: unknown): LocalizedText => {
  const o = (v && typeof v === "object" ? v : {}) as Partial<LocalizedText>;
  return { uz: o.uz ?? "", ru: o.ru ?? "", en: o.en ?? "" };
};
const sortByOrder = <T extends Record<string, unknown>>(a: T[]) => [...a].sort((x, y) => Number(x.sort_order ?? 0) - Number(y.sort_order ?? 0));

function quizRows() {
  const qs = demoTable("academic_questions");
  return demoTable("academic_quizzes")
    .filter((r) => r.is_active === true && !SEED_ID.test(String(r.id)))
    .map((r) => ({ r, questions: sortByOrder(qs.filter((q) => String(q.quiz_id) === String(r.id))) }))
    .filter((x) => x.questions.length > 0);
}

export function adminDemoQuizzes(): QuizSummary[] {
  return quizRows().map(({ r, questions }) => ({
    id: String(r.id),
    title: loc(r.title),
    description: r.description ? loc(r.description) : null,
    subjectKey: String(r.subject_key ?? ""),
    subjectName: loc(r.subject_name),
    grade: Number(r.grade),
    difficulty: (["easy", "medium", "hard"].includes(String(r.difficulty)) ? r.difficulty : "medium") as QuizSummary["difficulty"],
    durationMinutes: Number(r.duration_minutes ?? 10),
    passingScorePercent: Number(r.passing_score_percent ?? 60),
    questionCount: questions.length,
  }));
}

export function adminDemoQuestions(quizId: string): DemoQuestion[] | null {
  const hit = quizRows().find((x) => String(x.r.id) === quizId);
  if (!hit) return null;
  return hit.questions.map((q) => ({
    id: String(q.id),
    text: loc(q.question_text),
    imageUrl: (q.question_image_url as string | null) ?? null,
    options: (Array.isArray(q.options) ? (q.options as Record<string, unknown>[]) : []).map((o) => ({ id: String(o.id), text: loc(o.text) })),
    points: Number(q.points ?? 1),
    correctOptionId: String(q.correct_option_id),
    explanation: q.explanation ? loc(q.explanation) : null,
  })) as DemoQuestion[];
}

export function adminDemoPsychTests(): DemoTest[] {
  const qs = demoTable("psych_questions");
  const scales = demoTable("psych_result_scales");
  return demoTable("psych_tests")
    .filter((r) => r.is_active === true && !SEED_ID.test(String(r.id)))
    .map((r) => {
      const questions = sortByOrder(qs.filter((q) => String(q.psych_test_id) === String(r.id))).map((q) => ({
        id: String(q.id),
        text: loc(q.question_text),
        options: (Array.isArray(q.options) ? (q.options as Record<string, unknown>[]) : []).map((o) => ({ id: String(o.id), text: loc(o.text), score: Number(o.score ?? 0) })),
      }));
      return {
        id: String(r.id),
        title: loc(r.title),
        description: loc(r.description),
        instruction: loc(r.instruction),
        audience: (r.target_audience ?? "kids") as DemoTest["audience"],
        topic: r.topic as DemoTest["topic"],
        questions,
        scales: scales
          .filter((s) => String(s.psych_test_id) === String(r.id))
          .map((s) => ({
            min: Number(s.min_score),
            max: Number(s.max_score),
            title: loc(s.result_title),
            analysis: loc(s.psychological_analysis),
            recommendations: loc(s.recommendations_for_parents),
            badge: String(s.badge_color ?? "#6366f1"),
          })),
      } as DemoTest;
    })
    .filter((t) => t.questions.length > 0);
}

export const adminDemoPsychTest = (id: string): DemoTest | undefined => adminDemoPsychTests().find((t) => t.id === id);
