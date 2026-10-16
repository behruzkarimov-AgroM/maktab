// Text helpers for the document-import parsers (pure functions, safe on client and server).
import type { Locale } from "@/lib/types";

const ZERO_WIDTH = /[​-‍⁠﻿­]/g;
const APOS = /[‘’ʻʼʹˈ`´′՚]/g;

/** NFC, unified apostrophes, no zero-width characters, collapsed spaces. Keeps `**` bold markers. */
/** `keepTabs`: a tab run becomes ONE tab (game imports use it as the "term<TAB>definition" separator). */
export function cleanLine(s: string, keepTabs = false): string {
  return s
    .normalize("NFC")
    .replace(ZERO_WIDTH, "")
    .replace(keepTabs ? /[\u00A0\u2007\u202F\u2000-\u200A]/g : /[\u00A0\u2007\u202F\u2000-\u200A\t]/g, " ")
    .replace(APOS, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(keepTabs ? /[^\S\t]+/g : /\s+/g, " ")
    .replace(/ ?\t[ \t]*/g, keepTabs ? "\t" : " ")
    .trim();
}

export const plain = (s: string) => s.replace(/\*\*/g, "");

/** Removes `**` markers and reports how much of the (non-space) text was bold. */
export function splitBold(raw: string): { text: string; ratio: number } {
  if (!raw.includes("**")) return { text: raw, ratio: 0 };
  const parts = raw.split("**");
  let bold = 0;
  let total = 0;
  parts.forEach((p, i) => {
    const n = p.replace(/\s/g, "").length;
    total += n;
    if (i % 2 === 1) bold += n;
  });
  return { text: parts.join(""), ratio: total ? bold / total : 0 };
}

/** Collapses redundant bold markers produced by adjacent <strong> runs. */
export function tidyBold(s: string): string {
  let out = s;
  for (let i = 0; i < 3; i++) out = out.replace(/\*\*(\s*)\*\*/g, "$1");
  return out.replace(/^\*\*\s*\*\*$/, "");
}

const CYR = /[Ѐ-ӿ]/g;
const LAT = /[A-Za-z]/g;
export const UZ_CYR = /[ўқғҳЎҚҒҲ]/;

const UZ_WORDS = /\b(savol|javob|izoh|sinf|fan|qaysi|nechta|nima|bo'lad|bo'ladi|to'g'ri|noto'g'ri|ning|dagi|uchun|bilan|yoki|va|ham|emas|qanday|necha|ball|variant|test|so'rovnoma|yo'riqnoma|ha|yo'q|doim|ba'zan|hech|qachon|tez-tez|menga|men|siz|sizga|bola|maktab)\b/gi;
const EN_WORDS = /\b(the|is|are|was|were|which|what|who|how|does|do|did|of|and|or|to|in|on|for|with|not|answer|question|explanation|correct|grade|subject|always|never|sometimes|often|you|your|my|I|school|child)\b/gi;

/** Picks the language of a text: script first (Cyrillic -> ru / Uzbek Cyrillic -> uz), then keyword scores for Latin. */
export function detectLang(text: string): Locale {
  const sample = text.slice(0, 20000);
  const cyr = (sample.match(CYR) ?? []).length;
  const lat = (sample.match(LAT) ?? []).length;
  if (cyr > lat * 0.6 && cyr > 10) return UZ_CYR.test(sample) ? "uz" : "ru";
  const uzScore = (sample.match(UZ_WORDS) ?? []).length + (sample.match(/[a-z]['][a-z]/gi) ?? []).length * 0.5;
  const enScore = (sample.match(EN_WORDS) ?? []).length;
  return enScore > uzScore * 1.1 ? "en" : "uz";
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

/** Lower-case ascii slug used for `subject_key`. */
export function slugify(s: string): string {
  const t = s
    .toLowerCase()
    .split("")
    .map((c) => (c in TRANSLIT ? TRANSLIT[c] : c))
    .join("")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return t.slice(0, 40);
}

/** Known school subjects: [regex on folded name, key]. */
export const SUBJECTS: [RegExp, string, { uz: string; ru: string; en: string }][] = [
  [/matematika|математик|math/i, "math", { uz: "Matematika", ru: "Математика", en: "Mathematics" }],
  [/algebra|алгебр/i, "algebra", { uz: "Algebra", ru: "Алгебра", en: "Algebra" }],
  [/geometr|геометр/i, "geometry", { uz: "Geometriya", ru: "Геометрия", en: "Geometry" }],
  [/ingliz|английск|english/i, "english", { uz: "Ingliz tili", ru: "Английский язык", en: "English" }],
  [/rus tili|русский|russian/i, "russian", { uz: "Rus tili", ru: "Русский язык", en: "Russian" }],
  [/ona tili|родной язык|uzbek|o'zbek tili/i, "uzbek", { uz: "Ona tili", ru: "Родной язык", en: "Native language" }],
  [/adabiyot|литератур|literature/i, "literature", { uz: "Adabiyot", ru: "Литература", en: "Literature" }],
  [/fizika|физик|physics/i, "physics", { uz: "Fizika", ru: "Физика", en: "Physics" }],
  [/kimyo|хими|chemistry/i, "chemistry", { uz: "Kimyo", ru: "Химия", en: "Chemistry" }],
  [/biolog|биолог/i, "biology", { uz: "Biologiya", ru: "Биология", en: "Biology" }],
  [/tarix|истори|history/i, "history", { uz: "Tarix", ru: "История", en: "History" }],
  [/geografiya|географ|geography/i, "geography", { uz: "Geografiya", ru: "География", en: "Geography" }],
  [/informatika|информатик|computer|informatics/i, "informatics", { uz: "Informatika", ru: "Информатика", en: "Informatics" }],
  [/tabiatshunos|естествозн|science/i, "science", { uz: "Tabiatshunoslik", ru: "Естествознание", en: "Science" }],
];

export function guessSubject(s: string): { key: string; names: { uz: string; ru: string; en: string } } | null {
  for (const [re, key, names] of SUBJECTS) if (re.test(s)) return { key, names };
  return null;
}

/** Lower-cases, strips apostrophes, unifies yo: for keyword comparisons. */
export const fold = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/'/g, "");

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/* ---- Uzbek Cyrillic -> Latin (official 1995/2021 style, apostrophe for o' g') ---- */

const UZ_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "'", ь: "", ы: "i", э: "e", ю: "yu", я: "ya",
  ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

export function translitUzCyr(s: string): string {
  let out = "";
  for (const ch of s) {
    const low = ch.toLowerCase();
    const m = UZ_MAP[low];
    if (m === undefined) out += ch;
    else out += ch !== low ? m.charAt(0).toUpperCase() + m.slice(1) : m;
  }
  return out;
}

/** Option labels А) Б) В) Г) are mapped by position to A) B) C) D) first, so answers keep working after transliteration. */
function translitLine(line: string): string {
  const lab = "АБВГДЕабвгде";
  const map: Record<string, string> = { А: "A", Б: "B", В: "C", Г: "D", Д: "E", Е: "F", а: "a", б: "b", в: "c", г: "d", д: "e", е: "f" };
  const m = /^(\*?[([]?)([АБВГДЕабвгде])([)\].])/.exec(line);
  const head = m && lab.includes(m[2]) ? m[1] + map[m[2]] + m[3] : null;
  return head ? head + translitUzCyr(line.slice(m![0].length)) : translitUzCyr(line);
}

export function translitBlocks(blocks: import("./blocks").Block[]): { blocks: import("./blocks").Block[]; changed: boolean } {
  let changed = false;
  const tr = (s: string) => {
    const r = /[\u0400-\u04FF]/.test(s) ? translitLine(s) : s;
    if (r !== s) changed = true;
    return r;
  };
  return {
    blocks: blocks.map((b) => (b.t === "line" ? { t: "line" as const, text: tr(b.text) } : { t: "table" as const, rows: b.rows.map((r) => r.map(tr)) })),
    changed,
  };
}