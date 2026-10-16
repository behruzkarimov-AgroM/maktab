/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminClient } from "@/lib/supabase/admin";
import * as sb from "@/lib/supabase/server";
import type { Difficulty, LocalizedText } from "@/lib/types";
import { DEMO_QUESTIONS, DEMO_QUIZZES } from "@/components/quiz/demo";
import { adminDemoQuestions, adminDemoQuizzes } from "@/lib/admin/demo-bridge";
import type { QuestionReview, QuizQuestion, QuizSummary, SubmitInput, SubmitResult } from "@/components/quiz/types";

/** @deprecated routes use enforceRateLimit (lib/rate-limit.ts); re-exported only for tests/quiz.test.ts. */
export { rateLimited } from "../olympiad/_lib";

/** null ONLY in demo mode; throws when Supabase is configured but the client cannot be created (never silently demo). */
async function getDb(): Promise<any | null> {
  if (!sb.isSupabaseConfigured()) return null;
  const c = await sb.getServerClient();
  if (!c) throw new Error("supabase_unavailable");
  return c;
}

const loc = (v: any): LocalizedText => ({ uz: v?.uz ?? "", ru: v?.ru ?? "", en: v?.en ?? "" });

function mapQuiz(r: any): QuizSummary {
  const diff = ["easy", "medium", "hard"].includes(r.difficulty) ? (r.difficulty as Difficulty) : "medium";
  return {
    id: String(r.id),
    title: loc(r.title),
    description: r.description ? loc(r.description) : null,
    subjectKey: String(r.subject_key ?? ""),
    subjectName: loc(r.subject_name),
    grade: Number(r.grade),
    difficulty: diff,
    durationMinutes: Number(r.duration_minutes ?? 10),
    passingScorePercent: Number(r.passing_score_percent ?? 60),
    questionCount: null,
  };
}

export async function listQuizzes(): Promise<{ demo: boolean; quizzes: QuizSummary[] }> {
  const db = await getDb();
  if (!db) return { demo: true, quizzes: [...DEMO_QUIZZES, ...adminDemoQuizzes()] };
  // list_quizzes() is a public-safe RPC that includes question_count (no answers, no service key needed)
  const { data, error } = await db.rpc("list_quizzes");
  if (error) throw new Error(error.message);
  const quizzes: QuizSummary[] = (Array.isArray(data) ? data : []).map((r: any) => ({
    ...mapQuiz(r),
    questionCount: r.question_count == null ? null : Number(r.question_count),
  }));
  return { demo: false, quizzes };
}
export const getQuizSummary = (id: string) => getQuiz(id);
async function getQuiz(id: string): Promise<{ demo: boolean; quiz: QuizSummary } | null> {
  const db = await getDb();
  if (!db) {
    const quiz = DEMO_QUIZZES.find((q) => q.id === id) ?? adminDemoQuizzes().find((q) => q.id === id);
    return quiz ? { demo: true, quiz } : null;
  }
  const { data, error } = await db.from("academic_quizzes").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { demo: false, quiz: mapQuiz(data) } : null;
}

/** Questions WITHOUT answers/explanations. */
export async function startQuiz(id: string) {
  const found = await getQuiz(id);
  if (!found) return null;
  let questions: QuizQuestion[];
  if (found.demo) {
    questions = (DEMO_QUESTIONS[id] ?? adminDemoQuestions(id) ?? []).map(({ id: qid, text, imageUrl, options, points }) => ({ id: qid, text, imageUrl, options, points }));
  } else {
    const db = await getDb();
    const { data, error } = await db.rpc("get_quiz_questions", { p_quiz_id: id });
    if (error) throw new Error(error.message);
    questions = (data ?? []).map((r: any) => ({
      id: String(r.id),
      text: loc(r.question_text),
      imageUrl: r.question_image_url ?? null,
      options: (Array.isArray(r.options) ? r.options : []).map((o: any) => ({ id: String(o.id), text: loc(o.text) })),
      points: Number(r.points ?? 1),
    }));
  }
  return { demo: found.demo, quiz: { ...found.quiz, questionCount: questions.length }, questions };
}

export async function submitQuiz(id: string, input: SubmitInput): Promise<SubmitResult | null> {
  const found = await getQuiz(id);
  if (!found) return null;
  const pass = found.quiz.passingScorePercent;

  if (found.demo) {
    const qs = DEMO_QUESTIONS[id] ?? adminDemoQuestions(id) ?? [];
    const review: QuestionReview[] = qs.map((q) => {
      const sel = input.answers[q.id] ?? null;
      return {
        questionId: q.id,
        selected: sel,
        correctOptionId: q.correctOptionId,
        isCorrect: sel === q.correctOptionId,
        explanation: q.explanation,
      };
    });
    const correct = review.filter((r) => r.isCorrect).length;
    const pct = qs.length ? Math.round((correct / qs.length) * 100) : 0;
    return { scorePercent: pct, correct, total: qs.length, passed: pct >= pass, review };
  }

  // service role only: anon EXECUTE on submit_quiz_attempt is revoked (docs/AUDIT-SCHEMA-REQUESTS.md)
  const db: any = getAdminClient();
  if (!db) throw new Error("service_role_required");
  const { data, error } = await db.rpc("submit_quiz_attempt", {
    p_quiz_id: id,
    p_answers: input.answers,
    p_student_name: input.name,
    p_student_grade: input.grade,
    p_parent_phone: input.phone || null,
    p_time_spent_seconds: input.seconds,
  });
  if (error) throw new Error(error.message);
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) throw new Error("empty");
  const details: any[] = r.results ?? [];
  const review: QuestionReview[] = details.map((d) => ({
    questionId: String(d.question_id ?? d.id),
    selected: d.selected ?? d.selected_option_id ?? null,
    correctOptionId: String(d.correct_option_id),
    isCorrect: !!(d.is_correct ?? d.correct),
    explanation: d.explanation ? loc(d.explanation) : null,
  }));
  const total = Number(r.total ?? review.length);
  const correct = Number(r.correct ?? review.filter((x) => x.isCorrect).length);
  const pct = Math.round(Number(r.score_percent ?? (total ? (correct / total) * 100 : 0)));
  // score_percent is rounded to an integer in SQL and `passed` is computed on that same value,
  // so the displayed percent always agrees with the pass decision.
  return { scorePercent: pct, correct, total, passed: typeof r.passed === "boolean" ? r.passed : pct >= pass, review };
}
