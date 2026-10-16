// Programmatic .docx fixtures (so the repo carries no binary blobs). Used by vitest and by the Playwright e2e.
import { AlignmentType, Document, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";

export type Line = string | { text: string; bold?: boolean };

const para = (l: Line) => {
  const text = typeof l === "string" ? l : l.text;
  const bold = typeof l === "string" ? false : !!l.bold;
  return new Paragraph({ children: [new TextRun({ text, bold })] });
};

export async function docxFromLines(lines: Line[]): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: lines.map(para) }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

const cell = (t: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold })] })] });
export const table = (rows: string[][]) => new Table({ rows: rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })) });

/** Paragraphs and tables mixed. */
export async function docxFromParts(parts: (Line | Table)[]): Promise<Buffer> {
  const children = parts.map((p) => (p instanceof Table ? p : para(p)));
  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** Questions as a Word auto-numbered list (1. 2. 3.), options as typed text. */
export async function docxWithAutoNumbering(questions: { q: string; opts: string[] }[]): Promise<Buffer> {
  const doc = new Document({
    numbering: { config: [{ reference: "q", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [
      {
        children: questions.flatMap((x) => [
          new Paragraph({ numbering: { reference: "q", level: 0 }, children: [new TextRun(x.q)] }),
          ...x.opts.map((o) => new Paragraph({ children: [new TextRun(o)] })),
        ]),
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** A realistic Uzbek quiz: header lines, bold correct options, explanations. */
export const UZ_QUIZ_LINES: Line[] = [
  "Test nomi: E2E fizika testi",
  "Fan: Fizika",
  "Sinf: 7",
  "Qiyinlik: Oson",
  "Vaqt: 15 daqiqa",
  "O'tish bali: 50",
  "",
  "1. Tezlik birligi qaysi?",
  "A) kg",
  { text: "B) m/s", bold: true },
  "C) Joul",
  "D) Vatt",
  "Izoh: Tezlik masofaning vaqtga nisbati.",
  "2. Yorug'lik tezligi taxminan qancha?",
  "A) 300 000 km/s",
  "B) 3 000 km/s",
  "C) 30 km/s",
  "Javob: A",
  "3. Suv necha darajada qaynaydi?",
  "A) 50",
  "B) 100",
  "C) 150",
  "D) 0",
  "Javoblar: 3-B",
];
