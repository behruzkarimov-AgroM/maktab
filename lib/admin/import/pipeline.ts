// Client AND server safe: blocks/text -> draft. Rules first, then the generic layout heuristics.
// The dialog reuses it for "re-parse the extracted text after I fixed it by hand".
import { textToBlocks, type Block } from "./blocks";
import { genericCanonical } from "./generic";
import { parseBlocks } from "./parse";
import { parseExtra } from "./parse-extra";
import { itemsOf, type GameTypeChoice, type ImportDraft, type ImportKind, type LangChoice } from "./types";
import type { Locale } from "@/lib/types";

export interface ParseAny {
  draft: ImportDraft;
  detectedLang: Locale;
  langs: Locale[];
  parser: "rules" | "generic";
}

export interface ParseOpts {
  kind: ImportKind;
  lang: LangChoice;
  gameType?: GameTypeChoice;
  filename?: string;
}

function run(blocks: Block[], o: ParseOpts) {
  return o.kind === "survey" || o.kind === "game"
    ? parseExtra(blocks, { kind: o.kind, lang: o.lang, gameType: o.gameType, filename: o.filename })
    : parseBlocks(blocks, { kind: o.kind, lang: o.lang, filename: o.filename });
}

/** `text` keeps the original blank lines (better for block detection); `blocks` carry tables and bold marks. */
export function parseAny(blocks: Block[], text: string, o: ParseOpts): ParseAny | null {
  try {
    const r = run(blocks, o);
    if (itemsOf(r.draft).length > 0) return { ...r, parser: "rules" };
  } catch {
    /* fall through to the generic heuristics */
  }
  const canon = genericCanonical(text);
  if (!canon.length) return null;
  // for game content the generic layout can only mean a quiz race
  const o2: ParseOpts = o.kind === "game" && (!o.gameType || o.gameType === "auto") ? { ...o, gameType: "quiz_race" } : o;
  const r = run(textToBlocks(canon.join("\n"), o.kind === "game"), o2);
  if (itemsOf(r.draft).length === 0) return null;
  r.draft.warnings.push({ code: "generic_parser", level: "warn" });
  return { ...r, parser: "generic" };
}

/** Manual builder: parse (edited) text as typed in the browser. */
export const parseText = (text: string, o: ParseOpts) => parseAny(textToBlocks(text, o.kind === "game"), text, o);
