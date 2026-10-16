import { z } from "zod";
import type { Difficulty, LocalizedText } from "@/lib/types";

export interface QuizSummary {
  id: string;
  title: LocalizedText;
  description: LocalizedText | null;
  subjectKey: string;
  subjectName: LocalizedText;
  grade: number;
  difficulty: Difficulty;
  durationMinutes: number;
  passingScorePercent: number;
  questionCount: number | null;
}

export interface QuizListResponse {
  demo: boolean;
  quizzes: QuizSummary[];
}

/** Sent to the client: NO correct answer, NO explanation. */
export interface QuizQuestion {
  id: string;
  text: LocalizedText;
  imageUrl: string | null;
  options: { id: string; text: LocalizedText }[];
  points: number;
}

export interface QuizStartResponse {
  demo: boolean;
  quiz: QuizSummary;
  questions: QuizQuestion[];
}

export const submitSchema = z.object({
  answers: z.record(z.string().max(64), z.string().max(16)).refine((o) => Object.keys(o).length <= 200),
  name: z.string().trim().min(2, "name").max(80, "name"),
  grade: z.number().int("grade").min(1, "grade").max(11, "grade"),
  phone: z.union([z.literal(""), z.string().regex(/^\+998\d{9}$/, "phone")]).optional(),
  seconds: z.number().int().min(0).max(24 * 3600),
  /** Signed start proof from POST /api/quiz/:id/start (server-side clock). */
  startToken: z.string().max(600).optional(),
});
export type SubmitInput = z.infer<typeof submitSchema>;

export interface QuestionReview {
  questionId: string;
  selected: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: LocalizedText | null;
}

export interface SubmitResult {
  scorePercent: number;
  correct: number;
  total: number;
  passed: boolean;
  review: QuestionReview[];
  /** HMAC-signed proof of this server-scored result; required by the certificate archive endpoint. */
  certToken?: string;
  /** True when the attempt exceeded the quiz duration (no certificate token issued). */
  late?: boolean;
}
