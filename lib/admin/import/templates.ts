// Downloadable template files (txt and docx) built from template-data.ts. Server side only (uses the docx package).
import type { Locale } from "@/lib/types";
import { templateLines } from "./template-data";
import type { GameType, ImportKind } from "./types";

export function templateText(kind: ImportKind, lang: Locale, gameType?: GameType): string {
  return "\uFEFF" + templateLines(kind, lang, gameType).join("\r\n") + "\r\n";
}

/** Builds a real .docx (correct answers in the quiz template are marked with * AND bold, as the docs describe). */
export async function templateDocx(kind: ImportKind, lang: Locale, gameType?: GameType): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const paras = templateLines(kind, lang, gameType).map((line) => {
    const star = line.startsWith("*");
    const text = star ? line.slice(1) : line;
    return new Paragraph({ children: [new TextRun({ text: star ? `*${text}` : text, bold: star })] });
  });
  const doc = new Document({ sections: [{ children: paras }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}
