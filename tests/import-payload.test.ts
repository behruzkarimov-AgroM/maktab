import { describe, expect, it } from "vitest";
import { textToBlocks } from "@/lib/admin/import/extract";
import { parseBlocks } from "@/lib/admin/import/parse";
import { psychPayload, psychQuestionsPayload, quizPayload, quizQuestionsPayload, scalesPayload, withUz } from "@/lib/admin/import/payload";
import { templateText } from "@/lib/admin/import/templates";
import type { PsychDraft, QuizDraft } from "@/lib/admin/import/types";
import { getResource } from "@/lib/admin/resources";
import { buildSchema } from "@/lib/admin/validation";

const schema = (k: string) => buildSchema(getResource(k)!, "create");
const parse = (text: string, kind: "quiz" | "psych") => parseBlocks(textToBlocks(text), { kind, lang: "auto", filename: "f.txt" }).draft;

describe("import payloads pass the real admin zod schemas", () => {
  for (const lang of ["uz", "ru", "en"] as const) {
    it(`quiz template (${lang})`, () => {
      const d = parse(templateText("quiz", lang), "quiz") as QuizDraft;
      expect(schema("academic_quizzes").safeParse(quizPayload(d, false)).success).toBe(true);
      for (const q of quizQuestionsPayload(d.questions, "quiz-1")) {
        const r = schema("academic_questions").safeParse(q);
        expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
      }
    });
    it(`psych template (${lang})`, () => {
      const d = parse(templateText("psych", lang), "psych") as PsychDraft;
      expect(schema("psych_tests").safeParse(psychPayload(d, false)).success).toBe(true);
      for (const q of psychQuestionsPayload(d.questions, "p-1")) {
        const r = schema("psych_questions").safeParse(q);
        expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
      }
      for (const s of scalesPayload(d.scales, "p-1")) {
        const r = schema("psych_result_scales").safeParse(s);
        expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
      }
    });
  }

  it("copies the source language into the required `uz` field only", () => {
    expect(withUz({ uz: "", ru: "Привет", en: "" })).toEqual({ uz: "Привет", ru: "Привет", en: "" });
    expect(withUz({ uz: "Salom", ru: "", en: "" })).toEqual({ uz: "Salom", ru: "", en: "" });
    const d = parse("Тест\n1. Вопрос?\nА) да\nБ) нет\nОтвет: А", "quiz") as QuizDraft;
    const p = quizPayload(d, false);
    expect(p.title).toEqual({ uz: "Тест", ru: "Тест", en: "" });
    expect(p.is_active).toBe(false);
    expect(quizQuestionsPayload(d.questions, 5)[0].options[0].text.uz).toBe("да");
  });
});
