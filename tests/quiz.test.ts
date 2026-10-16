import { describe, it, expect, beforeEach, vi } from "vitest";
import { startQuiz, submitQuiz, listQuizzes, rateLimited } from "@/app/api/quiz/_lib";
import { DEMO_QUESTIONS, DEMO_QUIZZES } from "@/components/quiz/demo";
import { submitSchema } from "@/components/quiz/types";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

const base = { name: "Ali Valiyev", grade: 5, seconds: 30 };
const id = DEMO_QUIZZES[0].id;
const qs = DEMO_QUESTIONS[id];

describe("demo quiz data integrity", () => {
  it.each(DEMO_QUIZZES.map((q) => [q.id]))("%s: each question has its correct option among options, unique ids", (qid) => {
    for (const q of DEMO_QUESTIONS[qid]) {
      const ids = q.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(q.correctOptionId);
      expect(q.explanation).not.toBeNull();
    }
  });
});

describe("startQuiz (demo)", () => {
  it("never leaks answers or explanations", async () => {
    const r = await startQuiz(id);
    expect(r).not.toBeNull();
    const json = JSON.stringify(r);
    expect(json).not.toContain("correctOptionId");
    expect(json).not.toContain("explanation");
    expect(r!.quiz.questionCount).toBe(qs.length);
  });
  it("unknown quiz -> null", async () => {
    expect(await startQuiz("nope")).toBeNull();
    expect(await submitQuiz("nope", { ...base, answers: {} })).toBeNull();
  });
  it("listQuizzes in demo mode", async () => {
    const r = await listQuizzes();
    expect(r.demo).toBe(true);
    expect(r.quizzes.length).toBe(DEMO_QUIZZES.length);
  });
});

describe("submitQuiz (demo)", () => {
  it("all correct -> 100% passed", async () => {
    const answers = Object.fromEntries(qs.map((q) => [q.id, q.correctOptionId]));
    const r = await submitQuiz(id, { ...base, answers });
    expect(r).toMatchObject({ scorePercent: 100, correct: qs.length, total: qs.length, passed: true });
    expect(r!.review.every((x) => x.isCorrect && x.explanation)).toBe(true);
  });
  it("empty answers -> 0% failed, selected null, review still lists every question", async () => {
    const r = await submitQuiz(id, { ...base, answers: {} });
    expect(r).toMatchObject({ scorePercent: 0, correct: 0, passed: false });
    expect(r!.review).toHaveLength(qs.length);
    expect(r!.review.every((x) => x.selected === null)).toBe(true);
  });
  it("unknown option ids and unknown question ids count as wrong/ignored", async () => {
    const r = await submitQuiz(id, { ...base, answers: { [qs[0].id]: "ZZ", ghost: "A" } });
    expect(r!.correct).toBe(0);
    expect(r!.review).toHaveLength(qs.length);
  });
  it("pass threshold is inclusive and rounded", async () => {
    const need = Math.ceil((DEMO_QUIZZES[0].passingScorePercent / 100) * qs.length);
    const answers = Object.fromEntries(qs.slice(0, need).map((q) => [q.id, q.correctOptionId]));
    const r = await submitQuiz(id, { ...base, answers });
    expect(r!.passed).toBe(true);
    const fewer = Object.fromEntries(qs.slice(0, need - 1).map((q) => [q.id, q.correctOptionId]));
    expect((await submitQuiz(id, { ...base, answers: fewer }))!.passed).toBe(false);
  });
});

describe("submitSchema", () => {
  const ok = { answers: { q1: "A" }, name: "Ali", grade: 5, seconds: 10 };
  it("accepts valid", () => expect(submitSchema.safeParse(ok).success).toBe(true));
  it("rejects short name, bad grade, negative / absurd seconds, bad phone, long option id", () => {
    expect(submitSchema.safeParse({ ...ok, name: "A" }).success).toBe(false);
    expect(submitSchema.safeParse({ ...ok, grade: 12 }).success).toBe(false);
    expect(submitSchema.safeParse({ ...ok, seconds: -1 }).success).toBe(false);
    expect(submitSchema.safeParse({ ...ok, seconds: 99999 }).success).toBe(false);
    expect(submitSchema.safeParse({ ...ok, phone: "12345" }).success).toBe(false);
    expect(submitSchema.safeParse({ ...ok, phone: "" }).success).toBe(true);
    expect(submitSchema.safeParse({ ...ok, answers: { q: "A".repeat(17) } }).success).toBe(false);
  });
});

describe("rateLimited (olympiad/quiz in-memory limiter)", () => {
  const req = (ip: string) => new Request("http://x", { headers: { "x-forwarded-for": ip } });
  it("blocks after max hits per bucket+ip, independent per ip/bucket", () => {
    const b = "t" + Math.random();
    expect(rateLimited(req("1.1.1.1"), b, 2, 1000)).toBe(false);
    expect(rateLimited(req("1.1.1.1"), b, 2, 1000)).toBe(false);
    expect(rateLimited(req("1.1.1.1"), b, 2, 1000)).toBe(true);
    expect(rateLimited(req("2.2.2.2"), b, 2, 1000)).toBe(false);
    expect(rateLimited(req("1.1.1.1"), b + "x", 2, 1000)).toBe(false);
  });
  it("uses first IP of x-forwarded-for and recovers after the window", () => {
    vi.useFakeTimers();
    const b = "w" + Math.random();
    expect(rateLimited(req("3.3.3.3, 9.9.9.9"), b, 1, 1000)).toBe(false);
    expect(rateLimited(req("3.3.3.3, 8.8.8.8"), b, 1, 1000)).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(rateLimited(req("3.3.3.3"), b, 1, 1000)).toBe(false);
    vi.useRealTimers();
  });
});
