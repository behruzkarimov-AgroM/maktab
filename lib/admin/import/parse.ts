// Deterministic parsers: extracted document blocks -> quiz / psych-test drafts (no AI, no network).
import { scoreRange } from "@/lib/admin/scales";
import { scaleWarnings, warn } from "./checks";
import type { Locale } from "@/lib/types";
import type { Block } from "./extract";
import { clamp, cleanLine, clip, detectLang, fold, guessSubject, plain, slugify, splitBold } from "./text";
import {
  emptyL,
  LOCALES,
  MAX_QUESTIONS,
  type ImportKind,
  type LangChoice,
  type LText,
  type OptionDraft,
  type PsychDraft,
  type QuestionDraft,
  type QuizDraft,
  type ScaleDraft,
  type Warning,
} from "./types";

type BasicDraft = QuizDraft | PsychDraft;
type BasicKind = "quiz" | "psych";
const LETTERS = "ABCDEFGH";

/* ------------------------------------------------------------------ regexes */

export const kw = (words: string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "'?").replace(/ /g, "\\s+"))
    .join("|");
export const hdr = (words: string[]) => new RegExp(`^(?:${kw(words)})\\s*[:：]\\s*(.*)$`, "i");
export const hdrBare = (words: string[]) => new RegExp(`^(?:${kw(words)})\\s*[:：]?\\s*$`, "i");

export const H = {
  title: hdr(["nomi", "test nomi", "testning nomi", "sarlavha", "sarlavhasi", "nom", "title", "name", "test title", "название", "заголовок", "наименование", "so'rovnoma nomi", "anketa nomi"]),
  topicTitle: hdr(["mavzu", "тема"]),
  subject: hdr(["fan", "fan nomi", "fani", "предмет", "subject"]),
  grade: hdr(["sinf", "sinflar", "класс", "grade", "class"]),
  difficulty: hdr(["qiyinlik", "qiyinlik darajasi", "daraja", "сложность", "уровень сложности", "уровень", "difficulty", "level"]),
  duration: hdr(["vaqt", "davomiylik", "davomiyligi", "vaqt chegarasi", "время", "длительность", "продолжительность", "duration", "time", "time limit"]),
  pass: hdr(["o'tish bali", "o'tish foizi", "o'tish chegarasi", "o'tish", "проходной балл", "проходной", "passing score", "pass mark", "pass score", "passing", "pass"]),
  description: hdr(["tavsif", "tavsifi", "ta'rif", "описание", "description", "maqsad", "цель", "purpose"]),
  instruction: hdr(["yo'riqnoma", "ko'rsatma", "yo'l-yo'riq", "инструкция", "instruction", "instructions", "directions"]),
  audience: hdr(["auditoriya", "maqsadli auditoriya", "kim uchun", "аудитория", "целевая аудитория", "audience", "target audience"]),
  topic: hdr(["yo'nalish", "mavzu", "topic", "тема", "категория", "category", "turi"]),
};
export const HB = {
  instruction: hdrBare(["yo'riqnoma", "ko'rsatma", "yo'l-yo'riq", "инструкция", "instruction", "instructions", "directions"]),
  description: hdrBare(["tavsif", "описание", "description"]),
};

const SCALE_HEADING = hdrBare([
  "natijalar", "natijalarni izohlash", "natija shkalalari", "natijalar shkalasi", "shkala", "shkalalar", "interpretatsiya", "kalit va izoh",
  "result", "results", "scales", "scale", "interpretation", "scoring", "результаты", "шкала", "шкалы", "интерпретация", "обработка результатов",
]);
const ANSWER_KEY_HEADING = hdrBare(["javoblar", "javoblar kaliti", "kalitlar", "kalit", "answer key", "answers", "keys", "ключи", "ключ", "ответы", "ответы и ключи"]);
const ANSWER_KEY_INLINE = hdr(["javoblar", "javoblar kaliti", "kalitlar", "kalit", "answer key", "answers", "keys", "ключи", "ответы"]);

const ANS = hdr([
  "to'g'ri javob", "to'g'ri variant", "javob", "правильный ответ", "верный ответ", "ответ", "correct answer", "correct option", "correct", "answer", "key",
]);
export const EXPL = hdr([
  "izoh", "izohi", "tushuntirish", "izohlash", "sharh", "yechim", "пояснение", "объяснение", "комментарий", "решение", "explanation", "comment", "rationale", "solution",
]);
const EXPL_INLINE = new RegExp(`(?:^|[\\s.;])(?:${kw(["izoh", "tushuntirish", "izohlash", "sharh", "пояснение", "объяснение", "explanation", "comment"])})\\s*[:：]\\s*`, "i");
const POINTS_LINE = /^(?:ball|bal|балл|баллы|points?|pts?)\s*[:=]\s*(\d{1,3})\s*$/i;
const POINTS_INLINE = /\s*[(\[]\s*(\d{1,3})\s*(?:ball\w*|bal\b|балл[а-яё]*|points?|pts?|очк[а-яё]*)\s*[)\]]/i;

export const Q_WORD = /^(?:savol|вопрос|question|topshiriq|задание|masala|задача|q)\s*[№#]?\s*(\d{1,3})\s*(?:[.):\-–—]\s*|\s+|$)(.*)$/i;
export const Q_NUM_WORD = /^(\d{1,3})\s*[-–—]?\s*(?:savol|вопрос|question)\s*[.):\-–—]?\s*(.*)$/i;
export const Q_NUM_DOT = /^(\d{1,3})(?:\.(?!\d)|\))\s*(.*)$/;
export const Q_NUM_ONLY_DOT = /^(\d{1,3})\.(?!\d)\s*(.*)$/;

export const OPT_LETTER = /^[([]?\s*([A-Fa-f]|[А-Еа-е])\s*(?:[)\]]|\.(?=\s|$))\s*(.*)$/;
const OPT_NUM = /^[([]?\s*([1-8])\s*[)\]]\s*(.*)$/;
export const OPT_BULLET = /^[•·▪●○◦▫■□‣\-–—]\s+(.*)$/;
export const MARK_START = /^[*✓✔✅☑]\s*/;
export const MARK_END = /\s*[*✓✔✅☑]\s*$/;

export const UNIT = "(?:ball\\w*|bal\\b|балл[а-яё]*|points?|pts?|очк[а-яё]*|b\\.)";
const SC_BRACKET = new RegExp(`\\s*[(\\[{]\\s*([+-]?\\d{1,3})\\s*${UNIT}?\\s*[)\\]}]\\s*$`, "i");
const SC_DASH = new RegExp(`\\s*[-–—=:]\\s*([+-]?\\d{1,3})\\s*${UNIT}\\s*$`, "i");
const SC_UNIT = new RegExp(`\\s+([+-]?\\d{1,3})\\s*${UNIT}\\s*$`, "i");
const SC_PIPE = /\s*\|\s*([+-]?\d{1,3})\s*$/;

const RANGE = "^(\\d+(?:[.,]\\d+)?)\\s*(?:[-–—]|dan\\b|to\\b|до\\b)\\s*(\\d+(?:[.,]\\d+)?)";
// a range must be followed by a unit and/or a separator, so ordinary text such as "5-6 yosh" is not a scale
const SCALE_START = new RegExp(`${RANGE}\\s*(?:(?:${UNIT})\\s*(?:[:：]|[-–—])?|[:：]|[-–—])\\s*(.*)$`, "i");
const SCALE_SINGLE = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT})\\s*(?:[:：]|[-–—])\\s*(.*)$`, "i");
const SCALE_LOOSE = new RegExp(`${RANGE}\\s+(.+)$`, "i");
const SCALE_OPEN = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*\\+\\s*(?:${UNIT})?\\s*(?:[:：]|[-–—])\\s*(.*)$`, "i");
const SCALE_OPEN2 = new RegExp(`^(?:≥|>=)\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT})?\\s*(?:[:：]|[-–—])\\s*(.*)$`, "i");
const REC_LABEL = /(?:^|[\s|])((?:ota-onalarga\s+)?tavsiya\w*|recommendations?(?:\s+for\s+parents)?|рекомендаци[а-яё]+(?:\s+родителям)?)\s*[:：]\s*/i;
const AN_LABEL = /(?:^|[\s|])((?:psixologik\s+)?tahlil\w*|analysis|анализ|психологический\s+анализ)\s*[:：]\s*/i;

const KEY_PAIR = "(\\d{1,3})\\s*[-–—.):=]?\\s*([A-Fa-f]|[А-Еа-е])(?![\\p{L}\\d])";
const KEY_LINE = new RegExp(`^(?:\\s*${KEY_PAIR}\\s*[,;]?\\s*)+$`, "iu");
const KEY_PAIR_G = new RegExp(KEY_PAIR, "giu");
const KEY_PAIR_LOOSE = "(\\d{1,3})\\s*[-–—.):=]\\s*([A-Fa-f]|[А-Еа-е]|\\d)(?![\\p{L}\\d])";
const KEY_LINE_LOOSE = new RegExp(`^(?:\\s*${KEY_PAIR_LOOSE}\\s*[,;]?\\s*)+$`, "iu");
const KEY_PAIR_LOOSE_G = new RegExp(KEY_PAIR_LOOSE, "giu");

/* ------------------------------------------------------------------ table expansion */

type Prepared = { lines: string[]; key: Map<number, string> };

const isLetter = (s: string) => /^[A-Fa-fА-Еа-е]$/.test(s.trim().replace(/[).]$/, ""));
const cellPlain = (s: string) => plain(s).trim();

function keyFromTokens(rows: string[][]): Map<number, string> | null {
  const toks = rows.flat().flatMap((c) => cellPlain(c).split(/\s+/).filter(Boolean));
  // transposed table: a row of numbers followed by a row of letters
  if (rows.length === 2 && rows[0].length === rows[1].length && rows[0].length >= 2) {
    const nums = rows[0].map((c) => cellPlain(c));
    const lets = rows[1].map((c) => cellPlain(c));
    if (nums.every((x) => /^\d{1,3}$/.test(x)) && lets.every(isLetter)) return new Map(nums.map((x, i) => [Number(x), lets[i].replace(/[).]$/, "")]));
  }
  const map = new Map<number, string>();
  let ignored = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    let m = /^(\d{1,3})\s*[-–—.):=]?\s*([A-Fa-fА-Еа-е])$/u.exec(t);
    if (m) {
      map.set(Number(m[1]), m[2]);
      continue;
    }
    m = /^(\d{1,3})[-–—.):=]?$/.exec(t);
    if (m && i + 1 < toks.length && isLetter(toks[i + 1])) {
      map.set(Number(m[1]), toks[i + 1].replace(/[).]$/, ""));
      i++;
      continue;
    }
    ignored++;
  }
  return map.size >= 2 && ignored <= 3 ? map : null;
}

const RANGE_CELL = /^\s*(\d+(?:[.,]\d+)?)\s*(?:[-–—]|dan|to|до)\s*(\d+(?:[.,]\d+)?)\s*(?:ball\w*|балл[а-яё]*|points?)?\s*$/i;

export function questionTableLines(rows: string[][]): string[] | null {
  const head = rows[0].map((c) => fold(cellPlain(c)));
  const qCol = head.findIndex((h) => /^(?:№\s*)?(?:savol\w*|вопрос[а-яё]*|question\w*|topshiriq|задание|test)$/.test(h));
  const optCols: { idx: number; letter: string }[] = [];
  head.forEach((h, idx) => {
    const m = /^(?:variant\s*|вариант\s*|option\s*)?([a-fа-е])[).]?$/.exec(h);
    if (m) optCols.push({ idx, letter: m[1] });
  });
  if (qCol < 0 || optCols.length < 2) return null;
  const ansCol = head.findIndex((h) => /^(?:togri javob|javob|правильный ответ|ответ|answer|correct)$/.test(h));
  const explCol = head.findIndex((h) => /^(?:izoh|tushuntirish|пояснение|объяснение|explanation)$/.test(h));
  const ptsCol = head.findIndex((h) => /^(?:ball|балл|points)$/.test(h));
  const numCol = head.findIndex((h) => /^(?:№|n|t\/r|no|#)$/.test(h));
  const lines: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const q = cellPlain(r[qCol] ?? "");
    if (!q) return;
    const rawN = numCol >= 0 ? cellPlain(r[numCol] ?? "") : "";
    const n = /^\d{1,3}$/.test(rawN) ? rawN : String(i + 1);
    lines.push(`${n}. ${q}`);
    for (const o of optCols) {
      const t = (r[o.idx] ?? "").trim();
      if (t) lines.push(`${o.letter.toUpperCase()}) ${t}`);
    }
    if (ansCol >= 0 && cellPlain(r[ansCol] ?? "")) lines.push(`Javob: ${cellPlain(r[ansCol])}`);
    if (ptsCol >= 0 && /^\d{1,3}$/.test(cellPlain(r[ptsCol] ?? ""))) lines.push(`Ball: ${cellPlain(r[ptsCol])}`);
    if (explCol >= 0 && cellPlain(r[explCol] ?? "")) lines.push(`Izoh: ${cellPlain(r[explCol])}`);
  });
  return lines.length ? lines : null;
}

function scaleTableLines(rows: string[][]): string[] | null {
  const head = rows[0].map((c) => fold(cellPlain(c)));
  const has = (re: RegExp) => head.findIndex((h) => re.test(h));
  const minCol = has(/^(?:min|dan|от|from|minimal)/);
  const maxCol = has(/^(?:max|gacha|до|to|maksimal)/);
  const rangeCol = has(/^(?:ball|balllar|diapazon|oraliq|шкала|балл|баллы|score|range|natija ball)/);
  const titleCol = has(/^(?:natija|nomi|sarlavha|daraja|title|result|название|результат|уровень|level)/);
  const anCol = has(/^(?:tahlil|psixologik tahlil|izoh|analysis|description|анализ|описание|tavsif)/);
  const recCol = has(/^(?:tavsiya|ota-onalarga tavsiya|recommend|рекоменд)/);
  const dataRows = rows.slice(1);
  const hasHeader = titleCol >= 0 || anCol >= 0 || recCol >= 0 || minCol >= 0 || rangeCol >= 0;
  const body = hasHeader ? dataRows : rows;
  const out: string[] = [];
  for (const r of body) {
    const cells = r.map(cellPlain);
    let range: string | null = null;
    let used = -1;
    if (minCol >= 0 && maxCol >= 0 && cells[minCol] && cells[maxCol]) range = `${cells[minCol]}-${cells[maxCol]}`;
    else {
      const single = /^\d+(?:[.,]\d+)?\s*\+?$/;
      const col = rangeCol >= 0 ? rangeCol : cells.findIndex((c) => RANGE_CELL.test(c) || (hasHeader && single.test(c)));
      if (col >= 0 && RANGE_CELL.test(cells[col] ?? "")) {
        range = cells[col].replace(/\s*(?:ball\w*|балл[а-яё]*|points?)\s*$/i, "");
        used = col;
      } else if (col >= 0 && single.test(cells[col] ?? "") && (hasHeader || /\+$/.test(cells[col]))) {
        range = cells[col];
        used = col;
      }
    }
    if (!range) continue;
    const rest = cells.filter((_, i) => i !== used && i !== minCol && i !== maxCol);
    const pick = (idx: number, fallback: number) => (idx >= 0 ? cells[idx] ?? "" : rest[fallback] ?? "");
    const title = pick(titleCol, 0).replace(/\s[—–-]\s/g, "-");
    const analysis = pick(anCol, 1);
    const rec = pick(recCol, 2);
    const sep = /\+$/.test(range) ? ": " : " ball: ";
    out.push(`${range}${sep}${title}${analysis ? ` — ${analysis}` : ""}${rec ? ` | Tavsiya: ${rec}` : ""}`);
  }
  return out.length ? out : null;
}

export function prepare(blocks: Block[], kind: ImportKind, opts: { pairTables?: boolean } = {}): Prepared {
  const lines: string[] = [];
  let key = new Map<number, string>();
  for (const b of blocks) {
    if (b.t === "line") {
      lines.push(b.text);
      continue;
    }
    const rows = b.rows;
    const asKey = keyFromTokens(rows);
    if (asKey && rows.every((r) => r.length <= 12)) {
      key = new Map([...key, ...asKey]);
      continue;
    }
    const q = questionTableLines(rows);
    if (q) {
      lines.push(...q);
      continue;
    }
    if (opts.pairTables && rows.every((r) => r.filter((c) => c.trim()).length === 2)) {
      for (const r of rows) lines.push(r.filter((c) => c.trim()).map((c) => plain(c).trim()).join("\t"));
      continue;
    }
    if (kind === "psych") {
      const s = scaleTableLines(rows);
      if (s) {
        lines.push("Natijalar:", ...s);
        continue;
      }
    }
    for (const r of rows) {
      const t = r.map((c) => c.trim()).filter(Boolean).join(" ");
      if (t) lines.push(t);
    }
  }
  return { lines, key };
}

/* ------------------------------------------------------------------ language streams */

const TAG = /^\[(uz|ru|en)\]\s*(.*)$/i;

/** Returns per-language line lists when the document carries [UZ]/[RU]/[EN] tags, else null. */
export function splitStreams(lines: string[]): Map<Locale, string[]> | null {
  const seen = new Set<Locale>();
  for (const l of lines) {
    const m = TAG.exec(l);
    if (m) seen.add(m[1].toLowerCase() as Locale);
  }
  if (!seen.size) return null;
  const out = new Map<Locale, string[]>();
  for (const loc of LOCALES) if (seen.has(loc)) out.set(loc, []);
  let section: Locale | null = null;
  for (const l of lines) {
    const m = TAG.exec(l);
    if (m) {
      const tagLang = m[1].toLowerCase() as Locale;
      if (!m[2].trim()) {
        section = tagLang; // standalone "[RU]" starts a language section
        continue;
      }
      out.get(tagLang)?.push(m[2].trim());
      continue;
    }
    if (section) out.get(section)?.push(l);
    else for (const arr of out.values()) arr.push(l);
  }
  return out;
}

/* ------------------------------------------------------------------ line parser */

interface RawOpt {
  label: string;
  text: string;
  bold: boolean;
  star: boolean;
  score: number | null;
}
interface RawQ {
  n: number;
  stem: string[];
  opts: RawOpt[];
  ans: string | null;
  expl: string[];
  points: number | null;
  last: "stem" | "opt" | "ans" | "expl";
}
interface RawScale {
  min: number;
  max: number; // -1 = open ended
  title: string;
  analysis: string;
  rec: string;
  last: "title" | "analysis" | "rec";
}
interface RawDoc {
  head: Partial<Record<"title" | "subject" | "grade" | "difficulty" | "duration" | "pass" | "description" | "instruction" | "audience" | "topic" | "topicTitle", string>>;
  extra: string[];
  questions: RawQ[];
  scales: RawScale[];
  key: Map<number, string>;
}

const num = (s: string) => Number(s.replace(",", "."));

function tailKeyAttempt(lines: string[], lineRe: RegExp, pairRe: RegExp, needHeading: boolean): { lines: string[]; key: Map<number, string> } | null {
  const key = new Map<number, string>();
  let hadHeading = false;
  let i = lines.length - 1;
  const run: string[] = [];
  while (i >= 0) {
    const t = plain(lines[i]).trim();
    if (lineRe.test(t)) {
      run.push(t);
      i--;
      continue;
    }
    const inline = ANSWER_KEY_INLINE.exec(t);
    if (inline && lineRe.test(inline[1].trim())) {
      run.push(inline[1].trim());
      hadHeading = true;
      i--;
    } else if (ANSWER_KEY_HEADING.test(t)) {
      hadHeading = true;
      i--;
    }
    break;
  }
  for (const text of run) for (const m of text.matchAll(pairRe)) key.set(Number(m[1]), m[2]);
  if (needHeading && !hadHeading) return null;
  if (key.size >= 2 || (hadHeading && key.size >= 1)) return { lines: lines.slice(0, i + 1), key };
  return null;
}

/** Answer key block at the end of the document ("1-B 2-C", "1. B" per line, optional "Javoblar"/"Answer key" heading). */
function extractTailKey(lines: string[]): { lines: string[]; key: Map<number, string> } {
  return (
    tailKeyAttempt(lines, KEY_LINE, KEY_PAIR_G, false) ??
    // numeric answers ("3-2") are only trusted below an explicit heading
    tailKeyAttempt(lines, KEY_LINE_LOOSE, KEY_PAIR_LOOSE_G, true) ?? { lines, key: new Map() }
  );
}
export function splitInlineOptions(line: string): string[] {
  const first = OPT_LETTER.exec(line);
  if (!first) return [line];
  const idxOf = (c: string) => {
    const lat = "abcdef".indexOf(c.toLowerCase());
    return lat >= 0 ? lat : "абвгде".indexOf(c.toLowerCase());
  };
  const re = /(?:^|\s)([([]?)([A-Fa-fА-Еа-е])([)\]])\s+/g;
  const cuts: number[] = [0];
  let prev = idxOf(first[1]);
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index === 0) continue;
    const i = idxOf(m[2]);
    if (i === prev + 1) {
      cuts.push(m.index + (line[m.index] === " " ? 1 : 0));
      prev = i;
    }
  }
  if (cuts.length < 2) return [line];
  return cuts.map((c, k) => line.slice(c, cuts[k + 1] ?? line.length).trim());
}

function parseOptionLine(raw: string, mode: { numeric: boolean; haveOpts: number }): RawOpt[] | null {
  const { text: unbold, ratio } = splitBold(raw);
  let t = unbold.trim();
  let star = false;
  if (MARK_START.test(t)) {
    t = t.replace(MARK_START, "");
    star = true;
  }
  const re = mode.numeric ? OPT_NUM : OPT_LETTER;
  const m = re.exec(t);
  let parts: string[];
  if (m) {
    if (!mode.numeric && mode.haveOpts === 0 && !/^[AaАа]$/.test(m[1])) return null; // a lettered list must start with A
    parts = mode.numeric ? [t] : splitInlineOptions(t);
  } else {
    const b = OPT_BULLET.exec(t);
    if (!b) return null;
    parts = [b[1]];
  }
  const out: RawOpt[] = [];
  for (const p of parts) {
    const mm = m ? re.exec(p) : null;
    let text = mm ? mm[2] : p;
    let st = star;
    if (MARK_START.test(text)) {
      text = text.replace(MARK_START, "");
      st = true;
    }
    if (MARK_END.test(text)) {
      text = text.replace(MARK_END, "");
      st = true;
    }
    out.push({ label: mm ? mm[1] : "", text: text.trim(), bold: ratio >= 0.5, star: st, score: null });
  }
  return out;
}
export function extractScore(text: string): { text: string; score: number | null } {
  for (const re of [SC_PIPE, SC_BRACKET, SC_DASH, SC_UNIT]) {
    const m = re.exec(text);
    if (m) return { text: text.slice(0, m.index).trim(), score: Number(m[1]) };
  }
  return { text, score: null };
}

function parseScaleBody(body: string): { title: string; analysis: string; rec: string } {
  let rest = body.trim();
  let rec = "";
  let analysis = "";
  const r = REC_LABEL.exec(rest);
  if (r) {
    rec = rest.slice(r.index + r[0].length).trim();
    rest = rest.slice(0, r.index).trim();
  }
  const a = AN_LABEL.exec(rest);
  if (a) {
    analysis = rest.slice(a.index + a[0].length).trim();
    rest = rest.slice(0, a.index).trim();
  }
  rest = rest.replace(/[|\s]+$/, "").replace(/^[|\s]+/, "");
  let title = rest;
  if (rest.includes("|")) {
    const [first, ...others] = rest.split("|").map((x) => x.trim()).filter(Boolean);
    title = first ?? "";
    if (!analysis) analysis = others.shift() ?? "";
    if (!rec && others.length) rec = others.join(" ");
  }
  if (!analysis) {
    const cut = /\s[—–]\s|\s-\s/.exec(title);
    if (cut) {
      analysis = title.slice(cut.index + cut[0].length).trim();
      title = title.slice(0, cut.index).trim();
    } else {
      const c2 = /:\s+/.exec(title);
      if (c2 && c2.index > 0) {
        analysis = title.slice(c2.index + c2[0].length).trim();
        title = title.slice(0, c2.index).trim();
      }
    }
  }
  return { title: title.replace(/^["«]|["»]$/g, "").trim(), analysis, rec };
}

function parseLines(input: string[], kind: ImportKind, pre: Map<number, string>): RawDoc {
  const tail = extractTailKey(input);
  let lines = tail.lines.map((l) => cleanLine(l)).filter(Boolean);
  const key = new Map([...pre, ...tail.key]);

  // detect option numbering style
  const hasLetterA = lines.some((l) => {
    const t = splitBold(l).text.replace(MARK_START, "");
    const m = OPT_LETTER.exec(t.trim());
    return !!m && /^[AaАа]$/.test(m[1]);
  });
  const numericOpts = !hasLetterA && lines.filter((l) => /^[([]?\s*1\s*\)\s*\S/.test(splitBold(l).text)).length >= 2;
  const isQuestionStart = (l: string): RegExpExecArray | null => {
    const t = splitBold(l).text.trim();
    return Q_WORD.exec(t) ?? Q_NUM_WORD.exec(t) ?? (numericOpts ? Q_NUM_ONLY_DOT.exec(t) : Q_NUM_DOT.exec(t));
  };

  // no numbered questions at all but lettered options: number the stems that precede an "A)" line
  if (hasLetterA && !lines.some((l) => isQuestionStart(l))) {
    const out: string[] = [];
    let k = 0;
    lines.forEach((l, i) => {
      const next = lines[i + 1];
      const nextIsA = next ? /^[AaАа]$/.test(OPT_LETTER.exec(splitBold(next).text.replace(MARK_START, "").trim())?.[1] ?? "") : false;
      const thisIsOpt = !!OPT_LETTER.exec(splitBold(l).text.replace(MARK_START, "").trim());
      const special = ANS.test(l) || EXPL.test(l);
      out.push(nextIsA && !thisIsOpt && !special && !isHeaderLine(l) ? `${++k}. ${l}` : l);
    });
    lines = out;
  }

  const doc: RawDoc = { head: {}, extra: [], questions: [], scales: [], key };
  let cur: RawQ | null = null;
  let scale: RawScale | null = null;
  let scaleMode = false;
  let multi: "instruction" | "description" | null = null;
  let curWord = false;

  const closeQ = () => {
    if (cur) doc.questions.push(cur);
    cur = null;
  };

  for (const rawLine of lines) {
    const bold = splitBold(rawLine);
    const line = bold.text.trim();
    if (!line) continue;

    if (kind === "psych") {
      if (SCALE_HEADING.test(line)) {
        closeQ();
        scaleMode = true;
        scale = null;
        multi = null;
        continue;
      }
      if (scaleMode || doc.questions.length > 0 || cur) {
        const single = SCALE_SINGLE.exec(line);
        const ms = SCALE_START.exec(line) ?? (single ? ([single[0], single[1], single[1], single[2]] as unknown as RegExpExecArray) : null) ?? (scaleMode ? SCALE_LOOSE.exec(line) : null);
        const mo = SCALE_OPEN.exec(line) ?? SCALE_OPEN2.exec(line);
        if (ms && !isQuestionStart(line)) {
          closeQ();
          scaleMode = true;
          scale = { min: num(ms[1]), max: num(ms[2]), title: "", analysis: "", rec: "", last: "title" };
          const b = parseScaleBody(ms[3]);
          scale.title = b.title;
          scale.analysis = b.analysis;
          scale.rec = b.rec;
          doc.scales.push(scale);
          continue;
        }
        if (mo && !isQuestionStart(line) && (scaleMode || doc.questions.length > 0)) {
          closeQ();
          scaleMode = true;
          const b = parseScaleBody(mo[2]);
          scale = { min: num(mo[1]), max: -1, title: b.title, analysis: b.analysis, rec: b.rec, last: "title" };
          doc.scales.push(scale);
          continue;
        }
        if (scaleMode && scale) {
          const r = REC_LABEL.exec(line);
          const a = AN_LABEL.exec(line);
          if (r && r.index <= 1) {
            scale.rec = line.slice(r[0].length).trim();
            scale.last = "rec";
          } else if (a && a.index <= 1) {
            scale.analysis = line.slice(a[0].length).trim();
            scale.last = "analysis";
          } else {
            const key2 = scale.last;
            scale[key2] = `${scale[key2]} ${line}`.trim();
          }
          continue;
        }
        if (scaleMode) continue;
      }
    }

    let qm = isQuestionStart(line);
    const wordStart = !!qm && isWordStart(line);
    // under a "Savol N" / "Вопрос N" question a bare "1)" line is a numeric option, not the next question
    if (qm && cur && curWord && !wordStart) {
      const c: RawQ = cur;
      const numeric = c.opts.every((o) => /^\d$/.test(o.label));
      if (numeric && Number(qm[1]) === c.opts.length + 1) qm = null;
    }
    if (qm) {
      closeQ();
      curWord = wordStart;
      multi = null;
      cur = { n: Number(qm[1]), stem: [], opts: [], ans: null, expl: [], points: null, last: "stem" };
      const rest = (qm[2] ?? "").trim();
      if (rest) cur.stem.push(rest);
      continue;
    }

    if (!cur) {
      // ---- header zone
      const h = headerMatch(line, kind);
      if (h) {
        doc.head[h.key] = h.value;
        multi = h.key === "instruction" || h.key === "description" ? h.key : null;
        continue;
      }
      if (HB.instruction.test(line)) {
        multi = "instruction";
        doc.head.instruction ??= "";
        continue;
      }
      if (HB.description.test(line)) {
        multi = "description";
        doc.head.description ??= "";
        continue;
      }
      if (multi) {
        doc.head[multi] = `${doc.head[multi] ?? ""} ${line}`.trim();
        continue;
      }
      if (!doc.head.title) {
        if (line.length <= 200) doc.head.title = line;
      } else if (doc.extra.join(" ").length < 600) doc.extra.push(line);
      continue;
    }

    // ---- inside a question
    const am = ANS.exec(line);
    if (am && kind === "quiz") {
      let val = am[1].trim();
      const ex = EXPL_INLINE.exec(val);
      if (ex) {
        cur.expl.push(val.slice(ex.index + ex[0].length).trim());
        val = val.slice(0, ex.index).trim();
        cur.last = "expl";
      } else cur.last = "ans";
      cur.ans = val;
      continue;
    }
    const em = EXPL.exec(line);
    if (em) {
      cur.expl.push(em[1].trim());
      cur.last = "expl";
      continue;
    }
    const pm = POINTS_LINE.exec(line);
    if (pm) {
      cur.points = Number(pm[1]);
      continue;
    }
    const opts =
      parseOptionLine(rawLine, { numeric: numericOpts, haveOpts: cur.opts.length }) ??
      (curWord && !numericOpts && cur.opts.every((o) => /^\d$/.test(o.label)) ? parseOptionLine(rawLine, { numeric: true, haveOpts: cur.opts.length }) : null);
    if (opts && (cur.last !== "expl" || cur.opts.length === 0 || hasLetterA)) {
      for (const o of opts) {
        if (kind === "psych") {
          const sc = extractScore(o.text);
          o.text = sc.text;
          o.score = sc.score;
        }
        cur.opts.push(o);
      }
      cur.last = "opt";
      continue;
    }
    // continuation of the previous element
    if (cur.last === "stem") cur.stem.push(line);
    else if (cur.last === "opt") {
      const last = cur.opts[cur.opts.length - 1];
      if (last) {
        if (kind === "psych") {
          const sc = extractScore(line);
          if (sc.score !== null && last.score === null) last.score = sc.score;
          last.text = `${last.text} ${sc.text}`.trim();
        } else last.text = `${last.text} ${line}`.trim();
        if (bold.ratio >= 0.5) last.bold = true;
      }
    } else cur.expl.push(line);
  }
  closeQ();
  return doc;
}

function isWordStart(l: string): boolean {
  const t = splitBold(l).text.trim();
  return !!(Q_WORD.exec(t) ?? Q_NUM_WORD.exec(t));
}

export function isHeaderLine(l: string): boolean {
  const t = splitBold(l).text.trim();
  return Object.values(H).some((r) => r.test(t)) || HB.instruction.test(t) || HB.description.test(t) || SCALE_HEADING.test(t) || ANSWER_KEY_HEADING.test(t);
}

function headerMatch(line: string, kind: ImportKind): { key: keyof RawDoc["head"]; value: string } | null {
  const order: [keyof RawDoc["head"], RegExp][] = [
    ["title", H.title],
    ["subject", H.subject],
    ["grade", H.grade],
    ["difficulty", H.difficulty],
    ["duration", H.duration],
    ["pass", H.pass],
    ["instruction", H.instruction],
    ["description", H.description],
    ["audience", H.audience],
  ];
  for (const [k, re] of order) {
    if (kind === "psych" && (k === "subject" || k === "grade" || k === "difficulty" || k === "duration" || k === "pass")) continue;
    const m = re.exec(line);
    if (m) return { key: k, value: m[1].trim() };
  }
  const t = H.topic.exec(line);
  if (t) return { key: kind === "psych" ? "topic" : "topicTitle", value: t[1].trim() };
  return null;
}

/* ------------------------------------------------------------------ resolving values */

export const DIFF: [RegExp, QuizDraft["difficulty"]][] = [
  [/oson|yengil|легк|прост|easy|beginner/i, "easy"],
  [/qiyin|murakkab|сложн|трудн|hard|difficult|advanced/i, "hard"],
  [/o'?rta|средн|medium|normal|intermediate/i, "medium"],
];
const TOPICS: [RegExp, PsychDraft["topic"]][] = [
  [/qiziqish|интерес|interest/i, "interests"],
  [/temperament|темперамент/i, "temperament"],
  [/kasb|профориент|профессия|career|profession/i, "career"],
  [/tayyorlik|готовност|readiness/i, "readiness"],
  [/emotsion|эмоцион|emotional|xavotir|тревож|anxiety|stress|стресс/i, "emotional"],
];
const AUDIENCES: [RegExp, PsychDraft["target_audience"]][] = [
  [/ota-?ona|родител|parent/i, "parents"],
  [/o'?smir|подрост|teen/i, "teens"],
  [/katta|старшекл|older|high school|senior/i, "older"],
  [/bola|дети|ребён|ребен|kid|child|boshlang/i, "kids"],
];

export function pickMap<T>(table: [RegExp, T][], s: string | undefined): T | null {
  if (!s) return null;
  for (const [re, v] of table) if (re.test(s)) return v;
  return null;
}

function resolveAnswer(token: string, opts: RawOpt[]): number {
  const t = plain(token).trim();
  if (!t || !opts.length) return -1;
  const lead = /^([A-Fa-fА-Яа-я]|\d{1,2})(?=$|[\s).,;:\-–—/])/u.exec(t);
  if (lead) {
    const raw = lead[1].toLowerCase();
    const byLabel = opts.findIndex((o) => o.label.toLowerCase() === raw);
    if (byLabel >= 0) return byLabel;
    if (/^\d+$/.test(raw)) {
      const i = Number(raw) - 1;
      return i >= 0 && i < opts.length ? i : -1;
    }
    const lat = "abcdef".indexOf(raw);
    if (lat >= 0 && lat < opts.length) return lat;
    const look: Record<string, string> = { а: "a", в: "b", с: "c", е: "e" };
    if (look[raw] && "abcdef".indexOf(look[raw]) < opts.length) return "abcdef".indexOf(look[raw]);
    const cyr = "абвгде".indexOf(raw);
    if (cyr >= 0 && cyr < opts.length) return cyr;
  }
  const f = fold(plain(t));
  const byText = opts.findIndex((o) => fold(plain(o.text)) === f);
  return byText;
}

const maxOpts = (kind: ImportKind) => (kind === "quiz" ? 6 : 8);

function buildQuestion(rq: RawQ, idx: number, kind: ImportKind, lang: Locale, key: Map<number, string>): QuestionDraft {
  const warnings: Warning[] = [];
  let stem = rq.stem.join(" ");
  let points = rq.points;
  if (kind === "quiz") {
    const pm = POINTS_INLINE.exec(stem);
    if (pm) {
      points = Number(pm[1]);
      stem = (stem.slice(0, pm.index) + stem.slice(pm.index + pm[0].length)).trim();
    }
  }
  stem = clip(plain(stem).trim(), 5000);
  let raw = rq.opts.filter((o) => o.text.trim() !== "");
  if (raw.length !== rq.opts.length) warnings.push(warn("no_options_text"));
  if (raw.length > maxOpts(kind)) {
    warnings.push(warn("many_options", "warn", { max: maxOpts(kind) }));
    raw = raw.slice(0, maxOpts(kind));
  }
  if (!stem) warnings.push(warn("empty_question", "error"));
  if (raw.length < 2) warnings.push(warn("few_options", "error"));
  const labels = raw.map((o) => o.label.toLowerCase()).filter(Boolean);
  if (new Set(labels).size !== labels.length) warnings.push(warn("dup_letters"));

  const options: OptionDraft[] = raw.map((o, i) => {
    const text = emptyL();
    text[lang] = clip(plain(o.text).trim(), 1000);
    return { id: LETTERS[i], text, ...(kind === "psych" ? { score: o.score ?? undefined } : {}) };
  });

  let correct: string | null = null;
  if (kind === "quiz") {
    const inline = rq.ans !== null && rq.ans !== "" ? resolveAnswer(rq.ans, raw) : -1;
    const keyTok = key.get(rq.n);
    const fromKey = keyTok ? resolveAnswer(keyTok, raw) : -1;
    const stars = raw.map((o, i) => (o.star ? i : -1)).filter((i) => i >= 0);
    const bolds = raw.map((o, i) => (o.bold ? i : -1)).filter((i) => i >= 0);
    if (inline >= 0) {
      correct = LETTERS[inline];
      if (fromKey >= 0 && fromKey !== inline) warnings.push(warn("key_conflict"));
    } else {
      if (rq.ans) warnings.push(warn("bad_answer", "error"));
      if (fromKey >= 0) correct = LETTERS[fromKey];
      else if (keyTok) warnings.push(warn("bad_answer", "error"));
      else if (stars.length >= 1 && stars.length < raw.length) {
        correct = LETTERS[stars[0]];
        if (stars.length > 1) warnings.push(warn("bad_answer"));
      } else if (bolds.length >= 1 && bolds.length < raw.length) {
        correct = LETTERS[bolds[0]];
        if (bolds.length > 1) warnings.push(warn("bad_answer"));
      }
    }
    if (correct === null && !warnings.some((w) => w.code === "bad_answer")) warnings.push(warn("no_correct", "error"));
    if (correct === null && warnings.some((w) => w.code === "bad_answer")) warnings.push(warn("no_correct", "error"));
  } else {
    const missing = options.filter((o) => o.score === undefined).length;
    if (missing === options.length && options.length) {
      options.forEach((o, i) => (o.score = i));
      warnings.push(warn("scores_guessed"));
    } else if (missing) {
      options.forEach((o) => (o.score ??= 0));
      warnings.push(warn("no_score"));
    }
  }

  const explText = rq.expl.join(" ").trim();
  let explanation: LText | null = null;
  if (explText) {
    explanation = emptyL();
    explanation[lang] = clip(plain(explText), 5000);
  }
  const text = emptyL();
  text[lang] = stem;
  let confidence = 1;
  for (const w of warnings) confidence -= w.level === "error" ? 0.4 : 0.15;
  return {
    n: rq.n || idx + 1,
    text,
    options,
    correct,
    points: clamp(Math.round(points ?? 1), 1, 100),
    explanation,
    warnings,
    confidence: Math.max(0.05, Math.round(confidence * 100) / 100),
  };
}

const DEFAULT_INSTRUCTION: LText = {
  uz: "Har bir savolga o'ylamasdan, birinchi fikringiz bo'yicha javob bering. To'g'ri yoki noto'g'ri javob yo'q.",
  ru: "Отвечайте на каждый вопрос не раздумывая, по первой мысли. Правильных и неправильных ответов нет.",
  en: "Answer each question with your first instinct. There are no right or wrong answers.",
};
const DEFAULT_REC: LText = {
  uz: "Batafsil maslahat uchun maktab psixologiga murojaat qiling.",
  ru: "Для подробной консультации обратитесь к школьному психологу.",
  en: "For detailed advice, please talk to the school psychologist.",
};

function lt(lang: Locale, v: string): LText {
  const o = emptyL();
  o[lang] = v;
  return o;
}

function titleFromFile(name?: string): string {
  return (name ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
}

/** Parses ONE language stream into a draft (text goes to `lang`). */
export function parseStream(lines: string[], kind: BasicKind, lang: Locale, filename?: string, pre: Map<number, string> = new Map()): BasicDraft {
  const raw = parseLines(lines, kind, pre);
  const warnings: Warning[] = [];
  let qs = raw.questions.map((q, i) => buildQuestion(q, i, kind, lang, raw.key));
  if (qs.length > MAX_QUESTIONS) {
    qs = qs.slice(0, MAX_QUESTIONS);
    warnings.push(warn("truncated", "warn", { max: MAX_QUESTIONS }));
  }

  let title = plain(raw.head.title ?? raw.head.topicTitle ?? "").trim();
  if (!title) {
    title = titleFromFile(filename);
    warnings.push(warn("no_title"));
  }
  title = clip(title, 300);
  const description = clip(plain(raw.head.description ?? raw.extra.join(" ")).trim(), 4000);

  if (kind === "quiz") {
    const gradeSrc = raw.head.grade ?? /(\d{1,2})\s*-?\s*(?:sinf|класс|grade)/i.exec(title)?.[1];
    let grade = Number(/\d{1,2}/.exec(gradeSrc ?? "")?.[0]);
    if (!(grade >= 1 && grade <= 11)) {
      grade = 5;
      warnings.push(warn("default_grade"));
    }
    const subjSrc = raw.head.subject ?? "";
    const known = guessSubject(subjSrc) ?? (!subjSrc ? guessSubject(title) : null);
    let subject_key = "general";
    let subject_name: LText = { uz: "Umumiy", ru: "Общее", en: "General" };
    if (known) {
      subject_key = known.key;
      subject_name = { ...known.names };
    } else if (subjSrc) {
      subject_key = slugify(subjSrc) || "general";
      subject_name = lt(lang, clip(subjSrc, 200));
    } else warnings.push(warn("default_subject"));
    const dur = raw.head.duration ?? "";
    let minutes = Number(/\d+/.exec(dur)?.[0]);
    if (minutes && /soat|час|hour|\bh\b/i.test(dur)) minutes *= 60;
    if (!(minutes >= 1)) minutes = clamp(qs.length, 10, 90);
    const passRaw = Number(/\d+/.exec(raw.head.pass ?? "")?.[0]);
    const draft: QuizDraft = {
      kind: "quiz",
      title: lt(lang, title),
      description: description ? lt(lang, description) : emptyL(),
      subject_key,
      subject_name,
      grade,
      difficulty: pickMap(DIFF, raw.head.difficulty) ?? "medium",
      duration_minutes: clamp(Math.round(minutes), 1, 240),
      passing_score_percent: Number.isFinite(passRaw) && raw.head.pass ? clamp(passRaw, 0, 100) : 60,
      questions: qs,
      warnings,
    };
    return draft;
  }

  const instruction = raw.head.instruction ? lt(lang, clip(plain(raw.head.instruction), 4000)) : { ...DEFAULT_INSTRUCTION };
  if (!raw.head.instruction) warnings.push(warn("default_instruction"));
  let desc = description ? lt(lang, description) : lt(lang, title);
  if (!description) warnings.push(warn("default_description"));
  desc = { ...desc };
  const topic = pickMap(TOPICS, raw.head.topic) ?? pickMap(TOPICS, title);
  if (!topic) warnings.push(warn("default_topic"));
  const aud = pickMap(AUDIENCES, raw.head.audience);
  if (!aud) warnings.push(warn("default_audience"));

  const hi = scoreRange(qs.map((q) => ({ options: q.options.map((o) => ({ score: o.score })) }))).hi;
  const scales: ScaleDraft[] = raw.scales.map((s) => {
    const w: Warning[] = [];
    const max = s.max < 0 ? Math.max(hi, s.min) : s.max;
    const title2 = s.title ? clip(plain(s.title), 300) : `${s.min}–${max}`;
    if (!s.title) w.push(warn("scale_no_text", "warn", { field: "title" }));
    const analysisTxt = s.analysis ? clip(plain(s.analysis), 5000) : title2;
    if (!s.analysis) w.push(warn("scale_no_text", "warn", { field: "analysis" }));
    const recTxt = s.rec ? lt(lang, clip(plain(s.rec), 5000)) : { ...DEFAULT_REC };
    if (!s.rec) w.push(warn("scale_no_text", "warn", { field: "recommendations" }));
    return { min: Math.min(s.min, max), max: Math.max(s.min, max), title: lt(lang, title2), analysis: lt(lang, analysisTxt), recommendations: recTxt, warnings: w };
  });
  const draft: PsychDraft = {
    kind: "psych",
    title: lt(lang, title),
    description: desc,
    instruction,
    topic: topic ?? "interests",
    target_audience: aud ?? "kids",
    questions: qs,
    scales,
    warnings,
  };
  draft.warnings.push(...scaleWarnings(draft.scales, draft.questions));
  return draft;
}

/* ------------------------------------------------------------------ merging of tagged languages */

function mergeL(target: LText, src: LText | null | undefined, lang: Locale) {
  if (src && src[lang]) target[lang] = src[lang];
}

function mergeDrafts(parts: Map<Locale, BasicDraft>): BasicDraft {
  const order = LOCALES.filter((l) => parts.has(l));
  const base = structuredClone(parts.get(order[0])!);
  const warnings = [...base.warnings];
  for (const l of order.slice(1)) {
    const d = parts.get(l)!;
    mergeL(base.title, d.title, l);
    mergeL(base.description, d.description, l);
    if (base.kind === "quiz" && d.kind === "quiz") {
      mergeL(base.subject_name, d.subject_name, l);
      if (base.subject_key === "general" && d.subject_key !== "general") base.subject_key = d.subject_key;
    }
    if (base.kind === "psych" && d.kind === "psych") {
      mergeL(base.instruction, d.instruction, l);
      d.scales.forEach((s, i) => {
        const b = base.scales[i];
        if (!b) return base.scales.push(s);
        mergeL(b.title, s.title, l);
        mergeL(b.analysis, s.analysis, l);
        mergeL(b.recommendations, s.recommendations, l);
      });
    }
    if (base.questions.length !== d.questions.length) warnings.push(warn("lang_mismatch", "warn", { lang: l, a: base.questions.length, b: d.questions.length }));
    d.questions.forEach((q, i) => {
      const b = base.questions[i];
      if (!b) {
        base.questions.push(q);
        return;
      }
      mergeL(b.text, q.text, l);
      if (q.explanation) {
        b.explanation ??= emptyL();
        mergeL(b.explanation, q.explanation, l);
      }
      if (b.options.length !== q.options.length) b.warnings.push(warn("lang_mismatch", "warn", { lang: l, a: b.options.length, b: q.options.length }));
      q.options.forEach((o, j) => {
        if (b.options[j]) mergeL(b.options[j].text, o.text, l);
      });
      if (b.correct === null && q.correct !== null) b.correct = q.correct;
      b.warnings = b.warnings.filter((w) => !(w.code === "no_correct" && b.correct !== null));
    });
  }
  base.warnings = warnings;
  return base;
}

/* ------------------------------------------------------------------ public API */

export interface ParseResult {
  draft: BasicDraft;
  detectedLang: Locale;
  langs: Locale[];
}

export function parseBlocks(blocks: Block[], opts: { kind: BasicKind; lang: LangChoice; filename?: string }): ParseResult {
  const { lines, key } = prepare(blocks, opts.kind);
  const streams = splitStreams(lines);
  const detected = detectLang(lines.join("\n"));
  const lang: Locale = opts.lang === "auto" ? detected : opts.lang;
  let draft: BasicDraft;
  if (streams) {
    const parts = new Map<Locale, BasicDraft>();
    for (const [l, ls] of streams) parts.set(l, parseStream(ls, opts.kind, l, opts.filename, key));
    draft = parts.size === 1 ? [...parts.values()][0] : mergeDrafts(parts);
    if (opts.kind === "psych" && draft.kind === "psych") {
      draft.warnings = draft.warnings.filter((w) => !["no_scales", "scale_overlap", "scale_gap"].includes(w.code));
      draft.warnings.push(...scaleWarnings(draft.scales, draft.questions));
    }
  } else draft = parseStream(lines, opts.kind, lang, opts.filename, key);

  const langs = LOCALES.filter((l) => draft.title[l] || draft.questions.some((q) => q.text[l]));
  return { draft, detectedLang: streams ? (langs[0] ?? detected) : detected, langs };
}
