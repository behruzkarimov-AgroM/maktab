import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { textToBlocks } from "@/lib/admin/import/extract";
import { parseBlocks } from "@/lib/admin/import/parse";
import type { PsychDraft, QuizDraft } from "@/lib/admin/import/types";
import { detectLang } from "@/lib/admin/import/text";

const fx = (n: string) => readFileSync(path.join(__dirname, "fixtures", n), "utf8");
const quiz = (text: string, lang: "auto" | "uz" | "ru" | "en" = "auto") => parseBlocks(textToBlocks(text), { kind: "quiz", lang, filename: "x.txt" });
const psych = (text: string, lang: "auto" | "uz" | "ru" | "en" = "auto") => parseBlocks(textToBlocks(text), { kind: "psych", lang, filename: "x.txt" });

describe("quiz parser: Uzbek", () => {
  const r = quiz(fx("quiz-uz.txt"));
  const d = r.draft as QuizDraft;
  it("reads header fields", () => {
    expect(r.detectedLang).toBe("uz");
    expect(d.title.uz).toBe("Matematika: kasrlar testi");
    expect(d.subject_key).toBe("math");
    expect(d.grade).toBe(5);
    expect(d.difficulty).toBe("medium");
    expect(d.duration_minutes).toBe(25);
    expect(d.passing_score_percent).toBe(70);
  });
  it("parses 4 questions with options, answers, points, explanations", () => {
    expect(d.questions).toHaveLength(4);
    const [q1, q2, q3, q4] = d.questions;
    expect(q1.text.uz).toBe("1/2 + 1/4 nechaga teng?");
    expect(q1.points).toBe(2);
    expect(q1.options.map((o) => o.text.uz)).toEqual(["3/4", "2/6", "1/6", "1/8"]);
    expect(q1.correct).toBe("A");
    expect(q1.explanation?.uz).toContain("2/4 + 1/4 = 3/4");
    expect(q2.correct).toBe("B");
    expect(q2.options).toHaveLength(4);
    // options on one line + "Savol 3:" marker + Tushuntirish
    expect(q3.options.map((o) => o.text.uz)).toEqual(["1/3", "1/2", "3/4", "2/5"]);
    expect(q3.correct).toBe("C");
    expect(q3.explanation?.uz).toContain("eng katta");
    // asterisk marker
    expect(q4.correct).toBe("A");
    expect(q4.options[0].text.uz).toBe("1/5");
  });
  it("other languages stay empty", () => {
    expect(d.title.ru).toBe("");
    expect(d.questions[0].text.en).toBe("");
  });
});

describe("quiz parser: Russian with answer key at the end", () => {
  const r = quiz(fx("quiz-ru-key.txt"));
  const d = r.draft as QuizDraft;
  it("detects Russian and cyrillic option letters", () => {
    expect(r.detectedLang).toBe("ru");
    expect(d.title.ru).toBe("Тест по русскому языку");
    expect(d.grade).toBe(7);
    expect(d.difficulty).toBe("hard");
    expect(d.duration_minutes).toBe(60);
    expect(d.subject_key).toBe("russian");
  });
  it("resolves the key table '1-В 2-А 3-2'", () => {
    expect(d.questions).toHaveLength(3);
    expect(d.questions[0].options).toHaveLength(4);
    expect(d.questions[0].correct).toBe("C"); // в) is the third option
    expect(d.questions[1].correct).toBe("A");
    expect(d.questions[2].options.map((o) => o.text.ru)).toEqual(["четыре", "пять", "шесть"]);
    expect(d.questions[2].correct).toBe("B"); // numeric answer "2"
    expect(d.questions.every((q) => !q.warnings.some((w) => w.code === "no_correct"))).toBe(true);
  });
});

describe("quiz parser: English with '*' markers and 'Answer key' list", () => {
  const d = quiz(fx("quiz-en-stars.txt")).draft as QuizDraft;
  it("uses stars and the trailing key", () => {
    expect(detectLang(fx("quiz-en-stars.txt"))).toBe("en");
    expect(d.questions).toHaveLength(3);
    expect(d.questions[0].correct).toBe("B");
    expect(d.questions[0].options[1].text.en).toBe("goes");
    expect(d.questions[1].correct).toBe("C");
    expect(d.questions[2].correct).toBe("A");
    expect(d.questions[0].explanation?.en).toContain("Third person");
    expect(d.difficulty).toBe("easy");
  });
});

describe("quiz parser: warnings", () => {
  it("flags missing answer, <2 options and duplicate letters", () => {
    const d = quiz("Test\n\n1. Savol bir\nA) bir\nB) ikki\n\n2. Savol ikki\nA) faqat bitta\nJavob: A\n\n3. Savol uch\nA) x\nA) y\nJavob: A").draft as QuizDraft;
    expect(d.questions[0].warnings.map((w) => w.code)).toContain("no_correct");
    expect(d.questions[0].confidence).toBeLessThan(0.7);
    expect(d.questions[1].warnings.map((w) => w.code)).toContain("few_options");
    expect(d.questions[2].warnings.map((w) => w.code)).toContain("dup_letters");
  });
  it("falls back to defaults and warns", () => {
    const d = quiz("1. Birinchi?\nA) a\nB) b\nJavob: B", "uz").draft as QuizDraft;
    expect(d.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["no_title", "default_grade", "default_subject"]));
    expect(d.title.uz).toBe("x");
  });
  it("reports unresolvable answers", () => {
    const d = quiz("Savol 1. Q?\nA) a\nB) b\nJavob: Z").draft as QuizDraft;
    expect(d.questions[0].correct).toBeNull();
    expect(d.questions[0].warnings.map((w) => w.code)).toContain("bad_answer");
  });
  it("numbers unnumbered questions that precede an 'A)' line", () => {
    const d = quiz("Qaysi biri juft?\nA) 3\nB) 4\nJavob: B\nQaysi biri toq?\nA) 5\nB) 8\nJavob: A").draft as QuizDraft;
    expect(d.questions).toHaveLength(2);
    expect(d.questions[1].correct).toBe("A");
  });
});

describe("quiz parser: layout variants", () => {
  it("handles wrapped stems/options, (A) labels, 'To'g'ri javob' with option text and points on their own line", () => {
    const d = quiz(
      [
        "Savol 1 Quyidagilardan qaysi biri",
        "O'zbekistonning poytaxti hisoblanadi?",
        "(A) Samarqand shahri,",
        "    qadimiy shahar",
        "(B) Toshkent",
        "(C) Buxoro",
        "To'g'ri javob: B) Toshkent",
        "Ball: 3",
        "Savol 2 Eng uzun daryo?",
        "(A) Amudaryo",
        "(B) Sirdaryo",
        "Answer: b",
      ].join("\n"),
    ).draft as QuizDraft;
    expect(d.questions).toHaveLength(2);
    expect(d.questions[0].text.uz).toBe("Quyidagilardan qaysi biri O'zbekistonning poytaxti hisoblanadi?");
    expect(d.questions[0].options[0].text.uz).toBe("Samarqand shahri, qadimiy shahar");
    expect(d.questions[0].correct).toBe("B");
    expect(d.questions[0].points).toBe(3);
    expect(d.questions[1].correct).toBe("B");
  });
  it("resolves an answer given as the option text", () => {
    const d = quiz("1. Poytaxt?\nA) Samarqand\nB) Toshkent\nJavob: Toshkent").draft as QuizDraft;
    expect(d.questions[0].correct).toBe("B");
  });
  it("normalises curly apostrophes and ignores zero-width characters", () => {
    const d = quiz("1. O’zbekiston​ poytaxti?\nA) Toshkent\nB) Buxoro\nJavob: A").draft as QuizDraft;
    expect(d.questions[0].text.uz).toBe("O'zbekiston poytaxti?");
  });
  it("does not mistake decimals or years for question numbers", () => {
    const d = quiz("1. Qiymat?\nA) 3.14\nB) 2.71\nJavob: A\n2. Yil?\nA) 1991\nB) 2001\nJavob: A").draft as QuizDraft;
    expect(d.questions).toHaveLength(2);
    expect(d.questions[0].options[0].text.uz).toBe("3.14");
  });
});

describe("quiz parser: bold marker (docx style)", () => {
  it("treats the single bold option as the correct answer", () => {
    const d = quiz("1. Poytaxt?\nA) Samarqand\n**B) Toshkent**\nC) Buxoro").draft as QuizDraft;
    expect(d.questions[0].correct).toBe("B");
    expect(d.questions[0].options[1].text.uz).toBe("Toshkent");
  });
  it("ignores bold when every option is bold", () => {
    const d = quiz("1. Poytaxt?\n**A) Samarqand**\n**B) Toshkent**").draft as QuizDraft;
    expect(d.questions[0].correct).toBeNull();
  });
});

describe("multi-language [UZ]/[RU]/[EN] documents", () => {
  const d = quiz(fx("quiz-multilang.txt")).draft as QuizDraft;
  it("fills each language and shares options and answers", () => {
    expect(d.title).toEqual({ uz: "Kasrlar", ru: "Дроби", en: "Fractions" });
    expect(d.questions).toHaveLength(1);
    expect(d.questions[0].text.ru).toBe("Чему равно 1/2 + 1/4?");
    expect(d.questions[0].text.en).toBe("What is 1/2 + 1/4?");
    expect(d.questions[0].correct).toBe("A");
    expect(d.questions[0].options[0].text.uz).toBe("3/4");
    expect(d.questions[0].explanation?.ru).toContain("знаменателю");
    expect(d.subject_name.ru).toBe("Математика");
  });
});

describe("psych parser", () => {
  const r = psych(fx("psych-uz.txt"));
  const d = r.draft as PsychDraft;
  it("reads header sections", () => {
    expect(d.title.uz).toBe("Maktab xavotirligi darajasi");
    expect(d.topic).toBe("emotional");
    expect(d.target_audience).toBe("teens");
    expect(d.description.uz).toContain("maktabga munosabatini");
    expect(d.instruction.uz).toContain("o'ylamasdan");
    expect(d.instruction.uz).toContain("noto'g'ri");
  });
  it("extracts scores in three notations", () => {
    expect(d.questions).toHaveLength(3);
    for (const q of d.questions) {
      expect(q.options.map((o) => o.score)).toEqual([2, 1, 0]);
      expect(q.options[0].text.uz).toBe("Ha, doim");
    }
  });
  it("parses result scales with analysis and recommendations", () => {
    expect(d.scales).toHaveLength(3);
    expect(d.scales[0]).toMatchObject({ min: 0, max: 1 });
    expect(d.scales[0].title.uz).toBe("Past xavotir");
    expect(d.scales[0].analysis.uz).toContain("erkin");
    expect(d.scales[0].recommendations.uz).toContain("Qo'llab-quvvatlashda");
    expect(d.scales[2]).toMatchObject({ min: 5, max: 6 });
    // 0-1, 2-4, 5-6 cover 0..6 exactly
    expect(d.warnings.map((w) => w.code)).not.toContain("scale_gap");
    expect(d.warnings.map((w) => w.code)).not.toContain("scale_overlap");
  });
  it("warns about gaps/overlaps and missing scores", () => {
    const x = psych("Test\n1. Savol?\nA) Ha (5)\nB) Yo'q (0)\n\nNatijalar:\n0-2 ball: Past — a | Tavsiya: x\n2-3 ball: O'rta — b | Tavsiya: y\n").draft as PsychDraft;
    expect(x.warnings.map((w) => w.code)).toContain("scale_overlap");
    expect(x.warnings.map((w) => w.code)).toContain("scale_gap");
    const y = psych("Test\n1. Savol?\nA) Ha\nB) Yo'q").draft as PsychDraft;
    expect(y.questions[0].warnings.map((w) => w.code)).toContain("scores_guessed");
    expect(y.warnings.map((w) => w.code)).toContain("no_scales");
  });
  it("supports open-ended scales like '5+'", () => {
    const x = psych("Test\n1. S?\nA) a (3)\nB) b (0)\n\nNatijalar:\n0-1: Past — a\n2+ ball: Yuqori — b").draft as PsychDraft;
    expect(x.scales[1]).toMatchObject({ min: 2, max: 3 });
  });
});

describe("csv text layout", () => {
  it("is exposed through the same line parser", async () => {
    const { csvToBlocks } = await import("@/lib/admin/import/extract");
    const blocks = csvToBlocks("question,A,B,C,D,correct,explanation,points\n2+2?,3,4,5,6,B,Oddiy,2\n3+3?,6,7,8,9,A,,1\n", "quiz");
    const d = parseBlocks(blocks, { kind: "quiz", lang: "uz", filename: "q.csv" }).draft as QuizDraft;
    expect(d.questions).toHaveLength(2);
    expect(d.questions[0]).toMatchObject({ correct: "B", points: 2 });
    expect(d.questions[1].correct).toBe("A");
  });
});
