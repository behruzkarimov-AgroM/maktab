import { describe, expect, it } from "vitest";
import { importDocument } from "@/lib/admin/import";
import { textToBlocks } from "@/lib/admin/import/extract";
import { parseExtra } from "@/lib/admin/import/parse-extra";
import { gameDraftPayload, surveyDraftPayload } from "@/lib/admin/import/payload-extra";
import { templateDocx, templateText } from "@/lib/admin/import/templates";
import type { GameImportDraft, GameType, SurveyImportDraft } from "@/lib/admin/import/types";
import { validateGameDraft } from "@/lib/admin/game-content-types";
import { draftToRows, validateDraftRows } from "@/lib/admin/surveys-create";
import { docxFromParts, table } from "./fixtures/build-docx";

const survey = (t: string, lang: "auto" | "uz" | "ru" | "en" = "auto") => parseExtra(textToBlocks(t), { kind: "survey", lang, filename: "s.txt" }).draft as SurveyImportDraft;
const game = (t: string, gameType: GameType | "auto" = "auto") => parseExtra(textToBlocks(t, true), { kind: "game", lang: "auto", gameType, filename: "g.txt" }).draft as GameImportDraft;
const all = (sel: unknown[]) => sel.map(() => true);

describe("survey parser", () => {
  const d = survey(templateText("survey", "uz"));
  it("reads header and every question type", () => {
    expect(d.title.uz).toBe("Ota-onalar mamnunligi");
    expect(d.audience).toBe("parents");
    expect(d.startsAt).toBe("2026-01-10T00:00:00.000Z");
    expect(d.endsAt).toBe("2026-02-10T00:00:00.000Z");
    expect(d.isAnonymous).toBe(true);
    expect(d.questions.map((q) => q.type)).toEqual(["scale", "multiple", "single", "yesno", "text"]);
    expect(d.questions[0]).toMatchObject({ scaleMin: 1, scaleMax: 5 });
    expect(d.questions[0].scaleMinLabel.uz).toBe("Yoqmaydi");
    expect(d.questions[0].scaleMaxLabel.uz).toBe("Juda yoqadi");
    expect(d.questions[1].options.map((o) => o.text.uz)).toEqual(["Sport", "Rassomlik", "Dasturlash"]);
    expect(d.questions[2].options).toHaveLength(3);
    expect(d.questions.every((q) => q.warnings.length === 0)).toBe(true);
  });
  it("round-trips through the real survey validation", () => {
    for (const lang of ["uz", "ru", "en"] as const) {
      const x = survey(templateText("survey", lang));
      expect(x.questions.map((q) => q.type)).toEqual(["scale", "multiple", "single", "yesno", "text"]);
      const rows = validateDraftRows(draftToRows(surveyDraftPayload(x, all(x.questions))));
      expect(rows.survey.is_active).toBe(false);
      expect(rows.questions).toHaveLength(5);
    }
  });
  it("detects types from markers, glyphs, dashed scales and underscores", () => {
    const x = survey(
      [
        "Nomi: Test",
        "Auditoriya: O'qituvchilar",
        "Anonim: Yo'q",
        "1. Baholang (1-10)",
        "2. Qaysilarini bilasiz? (Multiple)",
        "A) bir",
        "B) ikki",
        "3. Tanlang",
        "○ birinchi",
        "○ ikkinchi",
        "4. Fikringiz",
        "__________",
        "5. Davom etasizmi?",
        "Ha",
        "Yo'q",
        "6. Yomonmi?",
        "Shkala: 0..4 (Yomon → A'lo)",
        "7. Mustaqil savol",
      ].join("\n"),
    );
    expect(x.audience).toBe("teachers");
    expect(x.isAnonymous).toBe(false);
    expect(x.questions.map((q) => q.type)).toEqual(["scale", "multiple", "single", "text", "yesno", "scale", "text"]);
    expect(x.questions[0]).toMatchObject({ scaleMin: 1, scaleMax: 10 });
    expect(x.questions[5]).toMatchObject({ scaleMin: 0, scaleMax: 4 });
    expect(x.questions[6].warnings.map((w) => w.code)).toContain("type_guessed");
  });
  it("flags missing options and invalid scales; bad dates produce warnings", () => {
    const x = survey("Nomi: T\nBoshlanish: 31.02.2026\n1. Tanlang?\nA) faqat bitta\n2. Baho (7-3)");
    expect(x.warnings.map((w) => w.code)).toContain("bad_date");
    expect(x.questions[0].warnings.map((w) => w.code)).toContain("need_options");
    expect(x.questions[1].warnings.map((w) => w.code)).toContain("bad_scale");
  });
  it("supports Russian and multi-language documents", () => {
    const x = survey("[UZ] Nomi: Salom\n[RU] Название: Привет\n[UZ] 1. Qalaysiz?\n[RU] 1. Как дела?\nA) yaxshi\nB) yomon");
    expect(x.title).toMatchObject({ uz: "Salom", ru: "Привет" });
    expect(x.questions[0].text.ru).toBe("Как дела?");
    expect(x.questions[0].type).toBe("single");
  });
  it("parses survey docx", async () => {
    const out = await importDocument(new Uint8Array(await templateDocx("survey", "ru")), "s.docx", "survey", "auto");
    expect((out.draft as SurveyImportDraft).questions).toHaveLength(5);
    expect(out.meta.detectedLang).toBe("ru");
  });
});

describe("game content parsers", () => {
  it("matching: dashes, equals, tabs and 2-column docx tables", async () => {
    const g = game("Nomi: Hayvonlar\n1. cat - mushuk\ndog = it\nbird\tqush\nfish — baliq\nbezovta qator");
    expect(g.gameType).toBe("matching");
    expect(g.pairs.map((p) => [p.left.uz, p.right.uz])).toEqual([["cat", "mushuk"], ["dog", "it"], ["bird", "qush"], ["fish", "baliq"]]);
    expect(g.warnings.map((w) => w.code)).toContain("line_skipped");
    const buf = await docxFromParts(["Nomi: Jadval", table([["So'z", "Tarjima"], ["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]])]);
    const out = await importDocument(new Uint8Array(buf), "t.docx", "game", "auto", "matching");
    const d = out.draft as GameImportDraft;
    expect(d.pairs.length).toBeGreaterThanOrEqual(4);
    expect(d.pairs.some((p) => p.left.uz === "e" && p.right.uz === "f")).toBe(true);
  });
  it("true/false: markers, suffix words, +/-, answers on their own line and Izoh", () => {
    const g = game(
      [
        "Nomi: TF",
        "1. Yer yumaloq. (To'g'ri)",
        "Izoh: Sharsimon.",
        "2. Quyosh sovuq. (F)",
        "3. Suv ho'l. - True",
        "4. Olma qizil +",
        "5. Ot uchadi -",
        "6. Qor issiq",
        "Javob: Noto'g'ri",
      ].join("\n"),
      "true_false",
    );
    expect(g.statements.map((s) => s.isTrue)).toEqual([true, false, true, true, false, false]);
    expect(g.statements[0].explanation?.uz).toBe("Sharsimon.");
    expect(g.statements[0].text.uz).toBe("Yer yumaloq.");
  });
  it("auto-detects the type", () => {
    expect(game("a - b\nc - d\ne - f\ng - h").gameType).toBe("matching");
    expect(game("1. A (T)\n2. B (F)\n3. C (T)\n4. D (F)\n5. E (T)").gameType).toBe("true_false");
    const q = game("1. Q?\nA) x\nB) y\nJavob: A\n2. Q2?\nA) x\nB) y\nJavob: B");
    expect(q.gameType).toBe("quiz_race");
    expect(q.questions[1].correct).toBe("B");
  });
  it("warns when a set is too small", () => {
    const g = game("Nomi: kichik\na - b\nc - d");
    expect(g.warnings.map((w) => w.code)).toContain("game_few_items");
  });
  it("templates for every game type, language and format pass validateGameDraft", async () => {
    for (const type of ["matching", "true_false", "quiz_race"] as const) {
      for (const lang of ["uz", "ru", "en"] as const) {
        const txt = (await importDocument(new TextEncoder().encode(templateText("game", lang, type)), "g.txt", "game", "auto", "auto")).draft as GameImportDraft;
        expect(txt.gameType).toBe(type);
        const payload = gameDraftPayload(txt, all(txt.pairs.length ? txt.pairs : txt.statements.length ? txt.statements : txt.questions));
        expect(validateGameDraft(payload), `${type}/${lang}`).toEqual([]);
        expect(payload.is_active).toBe(false);
        const docx = (await importDocument(new Uint8Array(await templateDocx("game", lang, type)), "g.docx", "game", "auto", "auto")).draft as GameImportDraft;
        expect(docx.gameType).toBe(type);
      }
    }
  });
});
