import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { ImportError, extractDocument, htmlToBlocks, inspectDocx, pdfTextToBlocks } from "@/lib/admin/import/extract";
import { importDocument } from "@/lib/admin/import";
import { templateDocx, templateText } from "@/lib/admin/import/templates";
import type { PsychDraft, QuizDraft } from "@/lib/admin/import/types";
import { UZ_QUIZ_LINES, docxFromLines, docxFromParts, docxWithAutoNumbering, table } from "./fixtures/build-docx";

const u8 = (b: Buffer | ArrayBuffer) => new Uint8Array(b as ArrayBuffer);
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof ImportError ? e.code : `other:${String(e)}`;
  }
}
const run = (bytes: Uint8Array, name: string, kind: "quiz" | "psych" = "quiz") => importDocument(bytes, name, kind, "auto");

describe("docx import", () => {
  it("reads headers, bold correct option, explanation, inline answer and trailing key", async () => {
    const buf = await docxFromLines(UZ_QUIZ_LINES);
    const { draft, meta } = await run(u8(buf), "fizika.docx");
    const d = draft as QuizDraft;
    expect(meta.format).toBe("docx");
    expect(meta.detectedLang).toBe("uz");
    expect(d.title.uz).toBe("E2E fizika testi");
    expect(d.subject_key).toBe("physics");
    expect(d.grade).toBe(7);
    expect(d.difficulty).toBe("easy");
    expect(d.duration_minutes).toBe(15);
    expect(d.passing_score_percent).toBe(50);
    expect(d.questions).toHaveLength(3);
    expect(d.questions[0].correct).toBe("B"); // bold marker
    expect(d.questions[0].explanation?.uz).toContain("masofaning");
    expect(d.questions[1].correct).toBe("A"); // inline answer
    expect(d.questions[2].correct).toBe("B"); // key at the end
    expect(d.questions.every((q) => q.warnings.length === 0)).toBe(true);
  });

  it("parses answer key tables and question tables", async () => {
    const buf = await docxFromParts([
      "Nomi: Jadvalli test",
      "Fan: Matematika",
      "Sinf: 5",
      table([
        ["№", "Savol", "A", "B", "C", "Javob"],
        ["1", "2+2 nechiga teng?", "3", "4", "5", "B"],
        ["2", "3*3 nechiga teng?", "6", "9", "12", "B"],
      ]),
      "Qo'shimcha",
    ]);
    const d = (await run(u8(buf), "t.docx")).draft as QuizDraft;
    expect(d.questions).toHaveLength(2);
    expect(d.questions[0].options.map((o) => o.text.uz)).toEqual(["3", "4", "5"]);
    expect(d.questions.map((q) => q.correct)).toEqual(["B", "B"]);

    const buf2 = await docxFromParts([
      "Nomi: Kalit jadvali",
      "1. Birinchi?",
      "A) a",
      "B) b",
      "2. Ikkinchi?",
      "A) c",
      "B) d",
      table([
        ["1", "B"],
        ["2", "A"],
      ]),
    ]);
    const d2 = (await run(u8(buf2), "k.docx")).draft as QuizDraft;
    expect(d2.questions.map((q) => q.correct)).toEqual(["B", "A"]);
  });

  it("parses a psych scale table", async () => {
    const buf = await docxFromParts([
      "Nomi: Jadvalli so'rovnoma",
      "1. Savol?",
      "A) Ha (2)",
      "B) Yo'q (0)",
      table([
        ["Ball", "Natija", "Tahlil", "Tavsiya"],
        ["0-1", "Past", "Past daraja", "Rahmat"],
        ["2", "Yuqori", "Yuqori daraja", "Murojaat qiling"],
      ]),
    ]);
    const d = (await run(u8(buf), "p.docx", "psych")).draft as PsychDraft;
    expect(d.scales).toHaveLength(2);
    expect(d.scales[0]).toMatchObject({ min: 0, max: 1 });
    expect(d.scales[0].title.uz).toBe("Past");
    expect(d.scales[1].recommendations.uz).toBe("Murojaat qiling");
    expect(d.warnings.map((w) => w.code)).not.toContain("scale_gap");
  });

  it("copes with Word auto-numbered questions", async () => {
    const buf = await docxWithAutoNumbering([
      { q: "Poytaxt qaysi?", opts: ["A) Toshkent", "B) Buxoro", "Javob: A"] },
      { q: "Eng katta daryo?", opts: ["A) Amudaryo", "B) Sirdaryo", "Javob: A"] },
    ]);
    const d = (await run(u8(buf), "n.docx")).draft as QuizDraft;
    expect(d.questions).toHaveLength(2);
    expect(d.questions[1].n).toBe(2);
    expect(d.questions[1].correct).toBe("A");
  });

  it("downloadable templates round-trip through the importer (all languages, both kinds)", async () => {
    for (const lang of ["uz", "ru", "en"] as const) {
      const quiz = (await run(await templateDocx("quiz", lang), `q-${lang}.docx`)).draft as QuizDraft;
      expect(quiz.questions).toHaveLength(3);
      expect(quiz.questions.map((q) => q.correct)).toEqual(["A", "C", "B"]);
      expect(quiz.questions[0].points).toBe(2);
      const txt = (await run(new TextEncoder().encode(templateText("quiz", lang)), `q-${lang}.txt`)).draft as QuizDraft;
      expect(txt.questions.map((q) => q.correct)).toEqual(["A", "C", "B"]);
      expect(txt.grade).toBe(5);
      const psy = (await run(await templateDocx("psych", lang), `p-${lang}.docx`, "psych")).draft as PsychDraft;
      expect(psy.questions).toHaveLength(2);
      expect(psy.scales).toHaveLength(3);
      expect(psy.topic).toBe("emotional");
      expect(psy.target_audience).toBe("teens");
      expect(psy.warnings.map((w) => w.code)).not.toContain("scale_gap");
      expect(psy.warnings.map((w) => w.code)).not.toContain("scale_overlap");
    }
  });
});

describe("html -> blocks", () => {
  it("keeps bold, numbers lists and drops tags/images", () => {
    const blocks = htmlToBlocks('<p>Savol:</p><ol><li>A <strong>bold</strong> <img src=""/> q</li><li>Second &amp; last</li></ol><ul><li>x</li></ul>');
    const lines = blocks.map((b) => (b.t === "line" ? b.text : "TABLE"));
    expect(lines).toEqual(["Savol:", "A) A **bold** q", "B) Second & last", "• x"]);
  });
  it("numbers top-level lists when no question precedes them", () => {
    const blocks = htmlToBlocks("<p>Intro</p><ol><li>one</li></ol><p>mid</p><ol><li>two</li></ol>");
    expect(blocks.map((b) => (b.t === "line" ? b.text : ""))).toEqual(["Intro", "1. one", "mid", "2. two"]);
  });
  it("never lets script/style content become text structure", () => {
    const blocks = htmlToBlocks("<p>ok</p><script>alert(1)</script>");
    expect(JSON.stringify(blocks)).not.toContain("<script");
  });
});

describe("file validation", () => {
  it("rejects wrong magic bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    expect(await code(extractDocument(png, "a.docx", "quiz"))).toBe("bad_magic");
    expect(await code(extractDocument(png, "a.pdf", "quiz"))).toBe("bad_magic");
    expect(await code(extractDocument(new TextEncoder().encode("%PDF-1.4 fake"), "a.docx", "quiz"))).toBe("bad_magic");
    expect(await code(extractDocument(u8(await docxFromLines(["x"])), "a.pdf", "quiz"))).toBe("bad_magic");
    expect(await code(extractDocument(u8(await docxFromLines(["x"])), "a.txt", "quiz"))).toBe("bad_magic");
    expect(await code(extractDocument(new Uint8Array([0, 1, 2, 0, 5]), "a.csv", "quiz"))).toBe("bad_magic");
  });
  it("rejects unsupported types, legacy .doc and empty files", async () => {
    expect(await code(extractDocument(new TextEncoder().encode("hello"), "a.exe", "quiz"))).toBe("unsupported_type");
    expect(await code(extractDocument(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), "old.doc", "quiz"))).toBe("bad_magic"); // truncated OLE header
    expect(await code(extractDocument(new Uint8Array(), "a.txt", "quiz"))).toBe("empty_document");
    expect(await code(extractDocument(new TextEncoder().encode("  \n  "), "a.txt", "quiz"))).toBe("empty_document");
  });
  it("rejects files over 10 MB", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1).fill(65);
    expect(await code(extractDocument(big, "big.txt", "quiz"))).toBe("file_too_large");
  });
  it("rejects malformed, truncated and non-Word zip files", async () => {
    const good = u8(await docxFromLines(["x"]));
    expect(await code(extractDocument(good.subarray(0, 60), "cut.docx", "quiz"))).toBe("bad_magic");
    expect(await code(extractDocument(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]), "junk.docx", "quiz"))).toBe("bad_magic");
    const xlsxLike = new JSZip();
    xlsxLike.file("xl/workbook.xml", "<a/>");
    expect(await code(extractDocument(u8(await xlsxLike.generateAsync({ type: "arraybuffer" })), "sheet.docx", "quiz"))).toBe("bad_magic"); // really a spreadsheet package
  });
  it("guards against zip bombs and macro files", async () => {
    const bomb = new JSZip();
    bomb.file("word/document.xml", "<w:document/>");
    bomb.file("word/media/huge.bin", Buffer.alloc(48 * 1024 * 1024)); // ~48 MB of zeros compresses to a few KB
    const bytes = u8(await bomb.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }));
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
    expect(await code(extractDocument(bytes, "bomb.docx", "quiz"))).toBe("zip_bomb");

    const many = new JSZip();
    many.file("word/document.xml", "<w:document/>");
    for (let i = 0; i < 600; i++) many.file(`word/f${i}.xml`, "x");
    expect(() => inspectDocx(u8(Buffer.from([])))).toThrow();
    expect(await code(extractDocument(u8(await many.generateAsync({ type: "arraybuffer" })), "many.docx", "quiz"))).toBe("zip_bomb");

    const macro = new JSZip();
    macro.file("word/document.xml", "<w:document/>");
    macro.file("word/vbaProject.bin", "evil");
    expect(await code(extractDocument(u8(await macro.generateAsync({ type: "arraybuffer" })), "macro.docx", "quiz"))).toBe("macros_not_allowed");
  });
  it("does not leak raw error messages (stable codes only)", async () => {
    try {
      await extractDocument(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), "x.docx", "quiz");
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).message).toBe((e as ImportError).code);
    }
  });
  it("reports 'no questions' for an unrelated document", async () => {
    expect(await code(run(new TextEncoder().encode("Bu shunchaki matn.\nHech qanday savol yo'q."), "n.txt"))).toBe("no_questions");
  });
});

describe("pdf import", () => {
  function makePdf(lines: string[]): Uint8Array {
    const pdf = new jsPDF();
    let y = 15;
    for (const l of lines) {
      if (y > 280) {
        pdf.addPage();
        y = 15;
      }
      pdf.text(l, 12, y);
      y += 7;
    }
    return new Uint8Array(pdf.output("arraybuffer"));
  }
  it("extracts selectable text and parses a quiz", async () => {
    const bytes = makePdf([
      "English test: Colours",
      "Subject: English",
      "Grade: 3",
      "",
      "1. What colour is the sky?",
      "A) Red",
      "B) Blue",
      "C) Green",
      "Answer: B",
      "2. What colour is grass?",
      "A) Green",
      "B) Black",
      "Answer: A",
    ]);
    const out = await run(bytes, "colours.pdf");
    const d = out.draft as QuizDraft;
    expect(out.meta.format).toBe("pdf");
    expect(d.questions).toHaveLength(2);
    expect(d.questions.map((q) => q.correct)).toEqual(["B", "A"]);
    expect(d.title.en || d.title.uz).toContain("English test");
    expect(d.grade).toBe(3);
  });
  it("gives a clear error for scanned PDFs without text when OCR is switched off", async () => {
    const pdf = new jsPDF();
    pdf.rect(10, 10, 100, 100, "F"); // only graphics
    process.env.IMPORT_OCR = "off";
    try {
      expect(await code(extractDocument(new Uint8Array(pdf.output("arraybuffer")), "scan.pdf", "quiz"))).toBe("no_selectable_text");
    } finally {
      delete process.env.IMPORT_OCR;
    }
  });
  it("runs OCR on image-only PDFs and reports low confidence for a blank graphic (slow)", { timeout: 120_000 }, async () => {
    const pdf = new jsPDF();
    pdf.rect(10, 10, 100, 100, "F");
    expect(await code(extractDocument(new Uint8Array(pdf.output("arraybuffer")), "scan.pdf", "quiz"))).toBe("ocr_low_confidence");
  });
  it("rejects corrupt PDFs with a stable code", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf");
    expect(["pdf_failed", "no_selectable_text"]).toContain(await code(extractDocument(bytes, "bad.pdf", "quiz")));
  });
  it("drops page numbers from pdf text", () => {
    const blocks = pdfTextToBlocks(["1. Savol\nA) x\n- 2 -\nPage 3 / 9\n5\n"]);
    expect(blocks.map((b) => (b.t === "line" ? b.text : ""))).toEqual(["1. Savol", "A) x"]);
  });
});
