// Parsers for SURVEYS and GAME CONTENT SETS (matching pairs, true/false, quiz race). Deterministic, no AI.
import type { Locale } from "@/lib/types";
import type { Block } from "./extract";
import { warn } from "./checks";
import {
  DIFF,
  EXPL,
  H,
  OPT_BULLET,
  OPT_LETTER,
  Q_NUM_DOT,
  Q_NUM_WORD,
  Q_WORD,
  hdr,
  parseStream,
  pickMap,
  prepare,
  splitInlineOptions,
  splitStreams,
} from "./parse";
import { cleanLine, clip, detectLang, fold, guessSubject, plain, slugify, splitBold } from "./text";
import {
  emptyL,
  LOCALES,
  type GameImportDraft,
  type GameType,
  type GameTypeChoice,
  type LangChoice,
  type LText,
  type OptionDraft,
  type PairDraft,
  type QuestionDraft,
  type StatementDraft,
  type SurveyAudienceId,
  type SurveyImportDraft,
  type SurveyQType,
  type SurveyQuestionDraft,
  type Warning,
} from "./types";

const LETTERS = "ABCDEFGHIJ";
const lt = (lang: Locale, v: string): LText => {
  const o = emptyL();
  o[lang] = v;
  return o;
};
const conf = (ws: Warning[]) => Math.max(0.05, Math.round((1 - ws.reduce((n, w) => n + (w.level === "error" ? 0.4 : 0.15), 0)) * 100) / 100);
const mergeL = (t: LText, s: LText | null | undefined, l: Locale) => {
  if (s && s[l]) t[l] = s[l];
};

/* ================================================================== SURVEYS */

const SV = {
  start: hdr(["boshlanish", "boshlanish sanasi", "boshlanishi", "start", "start date", "starts", "начало", "дата начала"]),
  end: hdr(["tugash", "tugash sanasi", "tugashi", "end", "end date", "ends", "конец", "окончание", "дата окончания"]),
  anon: hdr(["anonim", "anonimlik", "anonymous", "anonymity", "анонимно", "анонимность"]),
  multi: hdr(["bir necha marta", "qayta javob", "multiple responses", "several responses", "несколько ответов", "повторные ответы"]),
  type: hdr(["turi", "savol turi", "type", "question type", "тип", "тип вопроса"]),
};

const AUDIENCE_MAP: [RegExp, SurveyAudienceId][] = [
  [/ota-?ona|родител|parent/i, "parents"],
  [/o'?quvchi|ученик|учени|student|pupil/i, "students"],
  [/o'?qituvchi|учител|педагог|teacher/i, "teachers"],
  [/hammasi|barcha|hamma|^all|everyone|все/i, "all"],
];

const YES = /^(?:ha|yes|да|true|1|ok|on|\+)$/i;
const NO = /^(?:yo'?q|no|нет|false|0|off|-)$/i;

export function parseDate(s: string): string | null | "bad" {
  const v = s.trim();
  if (!v || /^(?:yo'?q|no|нет|none|-)$/i.test(v)) return null;
  let y: number, mo: number, d: number, hh = 0, mm = 0;
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(v);
  if (m) [y, mo, d, hh, mm] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)];
  else if ((m = /(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(v))) [d, mo, y, hh, mm] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)];
  else return "bad";
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "bad";
  return dt.toISOString();
}

const MULTI_MARK = /\s*[(\[]\s*(?:bir nechta(?: javob)?(?: tanlang)?|multiple(?: choice| answers)?|select all(?: that apply)?|несколько(?: ответов| вариантов)?|checkbox)\s*[)\]]\s*/i;
const SINGLE_MARK = /\s*[(\[]\s*(?:bitta(?: javob)?|single(?: choice)?|один(?: ответ)?)\s*[)\]]\s*/i;
const YESNO_MARK = /\s*[(\[]\s*(?:ha\s*\/\s*yo'?q|yes\s*\/\s*no|да\s*\/\s*нет)\s*[)\]]\s*/i;
const TEXT_MARK = /\s*[(\[]\s*(?:ochiq savol|javob matni|open(?: question)?|free text|свободный ответ|открытый вопрос)\s*[)\]]\s*/i;
const REQ_MARK = /\s*[(\[]\s*(?:majburiy|required|обязательно)\s*[)\]]\s*/i;
const OPTIONAL_MARK = /\s*[(\[]\s*(?:ixtiyoriy|optional|необязательно)\s*[)\]]\s*/i;
const SCALE_INLINE = /\s*[(\[]\s*(\d{1,2})\s*(?:\.\.|…|[-–—]|dan|to|до)\s*(\d{1,2})\s*(?:gacha)?\s*[)\]]\s*$/i;
const SCALE_LINE = /^(?:shkala|scale|шкала|reyting|rating|baho|оценка)\s*[:：]?\s*(\d{1,2})\s*(?:\.\.|…|[-–—]|dan|to|до)\s*(\d{1,2})\s*(?:gacha)?\s*(?:[(\[](.*)[)\]])?\s*$/i;
const SCALE_BARE = /^(\d{1,2})\s*(?:\.\.|…|[-–—])\s*(\d{1,2})\s*(?:[(\[](.*)[)\]])?$/;
const TEXT_LINE = /^(?:javob matni|javobingiz|javobingizni yozing|open question|free text|free answer|your answer|свободный ответ|ваш ответ|ochiq savol)\s*[:：]?\s*[_.…\s]*$/i;
const BLANK_LINE = /^(?:_{3,}|[.…]{5,}|-{5,})$/;
const YESNO_LINE = /^(?:ha\s*\/\s*yo'?q|yes\s*\/\s*no|да\s*\/\s*нет)$/i;
const GLYPH = /^(?:([☐☑☒□■✓✔])|(\[\s*[xX✓]?\s*\])|(\(\s*[xX•]?\s*\))|([○◯◉●]))\s*(.+)$/u;

function typeFromWord(s: string): SurveyQType | null {
  const f = fold(s);
  if (/bir nechta|multiple|несколь|checkbox|ko'?p/.test(f)) return "multiple";
  if (/ha.*yoq|yes.*no|да.*нет|^yesno/.test(f)) return "yesno";
  if (/shkala|scale|reyting|rating|шкала|рейтинг|baho/.test(f)) return "scale";
  if (/matn|text|ochiq|open|free|свобод|текст|открыт/.test(f)) return "text";
  if (/bitta|single|один|radio|tanlov/.test(f)) return "single";
  return null;
}

function splitLabels(s: string | undefined): [string, string] {
  if (!s) return ["", ""];
  const parts = s.split(/\s+[-–—]\s+|\s*(?:→|\.\.\.|…|\/)\s*/).map((x) => x.trim()).filter(Boolean);
  return [parts[0] ?? "", parts.length > 1 ? parts[parts.length - 1] : ""];
}

interface RawSQ {
  n: number;
  stem: string[];
  opts: string[];
  glyph: "multi" | "single" | null;
  type: SurveyQType | null;
  scale: { min: number; max: number; a: string; b: string } | null;
  textLine: boolean;
  yesnoLine: boolean;
  last: "stem" | "opt";
}

function finishSurveyQuestion(rq: RawSQ, idx: number, lang: Locale): SurveyQuestionDraft {
  const w: Warning[] = [];
  let stem = rq.stem.join(" ");
  let type = rq.type;
  let required = true;
  if (REQ_MARK.test(stem)) stem = stem.replace(REQ_MARK, " ");
  if (OPTIONAL_MARK.test(stem)) {
    required = false;
    stem = stem.replace(OPTIONAL_MARK, " ");
  }
  const strip = (re: RegExp, t: SurveyQType) => {
    if (re.test(stem)) {
      stem = stem.replace(re, " ");
      type ??= t;
    }
  };
  strip(MULTI_MARK, "multiple");
  strip(SINGLE_MARK, "single");
  strip(YESNO_MARK, "yesno");
  strip(TEXT_MARK, "text");
  let scale = rq.scale;
  const si = SCALE_INLINE.exec(stem);
  if (!scale && si && rq.opts.length === 0) {
    scale = { min: +si[1], max: +si[2], a: "", b: "" };
    stem = stem.replace(SCALE_INLINE, " ");
  }
  stem = clip(plain(stem).replace(/\s+/g, " ").trim(), 2000);

  let opts = rq.opts.map((o) => clip(plain(o).trim(), 500)).filter(Boolean);
  const isYes = (o: string) => /^(?:ha|yes|да)$/i.test(fold(o));
  const isNo = (o: string) => /^(?:yoq|no|нет)$/i.test(fold(o));
  if (!type) {
    if (scale) type = "scale";
    else if (rq.textLine) type = "text";
    else if (rq.yesnoLine || (opts.length === 2 && opts.some(isYes) && opts.some(isNo))) type = "yesno";
    else if (opts.length >= 1) type = rq.glyph === "multi" ? "multiple" : "single";
    else {
      type = "text";
      w.push(warn("type_guessed"));
    }
  }
  if (type === "yesno") opts = [];
  if (type === "scale" || type === "text") opts = [];
  const options: OptionDraft[] = opts.slice(0, 10).map((o, i) => ({ id: LETTERS[i], text: lt(lang, o) }));
  if (opts.length > 10) w.push(warn("many_options", "warn", { max: 10 }));
  if ((type === "single" || type === "multiple") && options.length < 2) w.push(warn("need_options", "error"));
  let sMin = 1;
  let sMax = 5;
  if (type === "scale") {
    if (scale && scale.min >= 0 && scale.min <= 9 && scale.max >= 1 && scale.max <= 10 && scale.max > scale.min) {
      sMin = scale.min;
      sMax = scale.max;
    } else {
      if (scale) w.push(warn("bad_scale", "error"));
    }
  }
  if (!stem) w.push(warn("empty_question", "error"));
  return {
    n: rq.n || idx + 1,
    type,
    text: lt(lang, stem),
    options,
    scaleMin: sMin,
    scaleMax: sMax,
    scaleMinLabel: type === "scale" && scale?.a ? lt(lang, scale.a) : emptyL(),
    scaleMaxLabel: type === "scale" && scale?.b ? lt(lang, scale.b) : emptyL(),
    required,
    warnings: w,
    confidence: conf(w),
  };
}

function parseSurveyStream(lines: string[], lang: Locale, filename?: string): SurveyImportDraft {
  const qs: RawSQ[] = [];
  let cur: RawSQ | null = null;
  const head: Record<string, string> = {};
  const extra: string[] = [];
  let multiKey: "description" | null = null;
  const warnings: Warning[] = [];
  const isStart = (t: string) => Q_WORD.exec(t) ?? Q_NUM_WORD.exec(t) ?? Q_NUM_DOT.exec(t);

  for (const raw of lines) {
    const t = splitBold(cleanLine(raw, true)).text.trim();
    if (!t) continue;
    const qm = isStart(t);
    if (qm) {
      cur = { n: Number(qm[1]), stem: [], opts: [], glyph: null, type: null, scale: null, textLine: false, yesnoLine: false, last: "stem" };
      qs.push(cur);
      if (qm[2]?.trim()) cur.stem.push(qm[2].trim());
      continue;
    }
    if (!cur) {
      const m = (re: RegExp) => re.exec(t)?.[1]?.trim();
      let v: string | undefined;
      if ((v = m(H.title) ?? m(H.topicTitle)) !== undefined) head.title = v;
      else if ((v = m(H.description)) !== undefined) {
        head.description = v;
        multiKey = "description";
      } else if ((v = m(H.audience)) !== undefined) head.audience = v;
      else if ((v = m(SV.start)) !== undefined) head.start = v;
      else if ((v = m(SV.end)) !== undefined) head.end = v;
      else if ((v = m(SV.anon)) !== undefined) head.anon = v;
      else if ((v = m(SV.multi)) !== undefined) head.multi = v;
      else if (multiKey && head.description !== undefined) head.description = `${head.description} ${t}`.trim();
      else if (!head.title) head.title = t.slice(0, 200);
      else extra.push(t);
      continue;
    }
    // ---- inside a question
    const tm = SV.type.exec(t);
    if (tm) {
      const ty = typeFromWord(tm[1]);
      if (ty) cur.type = ty;
      continue;
    }
    const sl = SCALE_LINE.exec(t) ?? (cur.opts.length === 0 ? SCALE_BARE.exec(t) : null);
    if (sl) {
      const [a, b] = splitLabels(sl[3]);
      cur.scale = { min: +sl[1], max: +sl[2], a, b };
      continue;
    }
    if (TEXT_LINE.test(t) || BLANK_LINE.test(t)) {
      cur.textLine = true;
      continue;
    }
    if (/^(?:ha|yo'?q|yes|no|да|нет)$/i.test(t)) {
      cur.opts.push(t);
      cur.last = "opt";
      continue;
    }
    if (YESNO_LINE.test(t)) {
      cur.yesnoLine = true;
      continue;
    }
    const g = GLYPH.exec(t);
    if (g) {
      cur.opts.push(g[5]);
      cur.glyph ??= g[1] || g[2] ? "multi" : "single";
      cur.last = "opt";
      continue;
    }
    const lm = OPT_LETTER.exec(t.replace(/^[*✓✔]\s*/, ""));
    if (lm && (cur.opts.length > 0 || /^[AaАа]$/.test(lm[1]))) {
      for (const part of splitInlineOptions(t.replace(/^[*✓✔]\s*/, ""))) {
        const pm = OPT_LETTER.exec(part);
        cur.opts.push((pm ? pm[2] : part).trim());
      }
      cur.last = "opt";
      continue;
    }
    const bm = OPT_BULLET.exec(t);
    if (bm) {
      cur.opts.push(bm[1].trim());
      cur.last = "opt";
      continue;
    }
    if (cur.last === "opt" && cur.opts.length) cur.opts[cur.opts.length - 1] += ` ${t}`;
    else cur.stem.push(t);
  }

  const questions = qs.map((q, i) => finishSurveyQuestion(q, i, lang));
  let title = plain(head.title ?? "").trim();
  if (!title) {
    title = (filename ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
    warnings.push(warn("no_title"));
  }
  const audience = pickMap(AUDIENCE_MAP, head.audience) ?? "all";
  const dates = (k: "start" | "end") => {
    if (head[k] === undefined) return null;
    const r = parseDate(head[k]);
    if (r === "bad") {
      warnings.push(warn("bad_date"));
      return null;
    }
    return r;
  };
  const yn = (v: string | undefined, def: boolean) => (v === undefined ? def : YES.test(fold(v)) ? true : NO.test(fold(v)) ? false : def);
  const desc = plain(head.description ?? extra.join(" ")).trim();
  return {
    kind: "survey",
    title: lt(lang, clip(title, 300)),
    description: desc ? lt(lang, clip(desc, 4000)) : emptyL(),
    audience,
    startsAt: dates("start"),
    endsAt: dates("end"),
    isAnonymous: yn(head.anon, true),
    allowMultiple: yn(head.multi, false),
    questions,
    warnings,
  };
}

function mergeSurvey(parts: Map<Locale, SurveyImportDraft>): SurveyImportDraft {
  const order = LOCALES.filter((l) => parts.has(l));
  const base = structuredClone(parts.get(order[0])!);
  for (const l of order.slice(1)) {
    const d = parts.get(l)!;
    mergeL(base.title, d.title, l);
    mergeL(base.description, d.description, l);
    if (base.questions.length !== d.questions.length) base.warnings.push(warn("lang_mismatch", "warn", { lang: l, a: base.questions.length, b: d.questions.length }));
    d.questions.forEach((q, i) => {
      const b = base.questions[i];
      if (!b) return void base.questions.push(q);
      mergeL(b.text, q.text, l);
      mergeL(b.scaleMinLabel, q.scaleMinLabel, l);
      mergeL(b.scaleMaxLabel, q.scaleMaxLabel, l);
      q.options.forEach((o, j) => b.options[j] && mergeL(b.options[j].text, o.text, l));
    });
  }
  return base;
}

/* ================================================================== GAME CONTENT */

const GH = {
  type: hdr(["o'yin turi", "o'yin", "turi", "game type", "game", "type", "тип игры", "игра", "тип"]),
};
const GAME_TYPE_MAP: [RegExp, GameType][] = [
  [/to'?g'?ri.*noto'?g'?ri|true.*false|верно.*неверно|true\/false|t\/f/i, "true_false"],
  [/juftlik|matching|пар[аы]|соответств|найди пару/i, "matching"],
  [/viktorina|quiz|викторина|race|poyga/i, "quiz_race"],
];

const TRUE_WORDS = /^(?:to'?g'?ri|t|ha|true|верно|да|\+|✓|✔|правда)$/i;
const FALSE_WORDS = /^(?:noto'?g'?ri|f|yo'?q|false|неверно|нет|-|−|✗|✘|✕|ложь)$/i;
const TF_BRACKET = /\s*[(\[]\s*(noto'?g'?ri|to'?g'?ri|true|false|верно|неверно|правда|ложь|yo'?q|ha|да|нет|[tf+\-−✓✔✗✘✕])\s*[)\]]\s*$/i;
const TF_SUFFIX = /\s*(?:[-–—:|]\s*)(noto'?g'?ri|to'?g'?ri|true|false|верно|неверно|правда|ложь|[tf])\s*$/i;
const TF_PLUS = /\s+([+\-−])\s*$/;
const TF_ANSWER = hdr(["javob", "answer", "ответ", "to'g'ri javob", "correct"]);

function tfValue(word: string): boolean | null {
  const w = word.trim();
  if (FALSE_WORDS.test(fold(w))) return false;
  if (TRUE_WORDS.test(fold(w))) return true;
  return null;
}

function splitPair(s: string): [string, string] | null {
  if (s.includes("\t")) {
    const [a, ...r] = s.split(/\t+/);
    return a.trim() && r.join(" ").trim() ? [a.trim(), r.join(" ").trim()] : null;
  }
  for (const re of [/\s*=>?\s*/, /\s+[—–]\s+/, /\s*(?:->|→)\s*/, /\s+-\s+/, /\s*[—–]\s*/, /:\s+/]) {
    const m = re.exec(s);
    if (m && m.index > 0) {
      const a = s.slice(0, m.index).trim();
      const b = s.slice(m.index + m[0].length).trim();
      if (a && b) return [a, b];
    }
  }
  return null;
}

const stripNum = (s: string) => s.replace(/^(?:\d{1,3}\s*[.)]\s*|[•·▪●○◦\-–—]\s+)/, "");

function parseTrueFalse(lines: string[], lang: Locale): StatementDraft[] {
  const out: StatementDraft[] = [];
  let cur: { text: string; val: boolean | null; expl: string[]; n: number } | null = null;
  const push = () => {
    if (!cur) return;
    const w: Warning[] = [];
    if (cur.val === null) w.push(warn("no_tf_answer", "error"));
    const st: StatementDraft = {
      n: cur.n,
      text: lt(lang, clip(plain(cur.text).trim(), 1000)),
      isTrue: cur.val,
      explanation: cur.expl.length ? lt(lang, clip(plain(cur.expl.join(" ")), 1000)) : null,
      warnings: w,
      confidence: conf(w),
    };
    out.push(st);
    cur = null;
  };
  for (const raw of lines) {
    let t = splitBold(cleanLine(raw, true)).text.trim();
    if (!t) continue;
    const em = EXPL.exec(t);
    if (em && cur) {
      cur.expl.push(em[1].trim());
      continue;
    }
    const am = TF_ANSWER.exec(t);
    if (am && cur && cur.val === null) {
      cur.val = tfValue(am[1].trim());
      continue;
    }
    const num = /^(\d{1,3})\s*[.)]\s*/.exec(t);
    t = stripNum(t);
    let val: boolean | null = null;
    let m = TF_BRACKET.exec(t);
    if (m && tfValue(m[1]) !== null) {
      val = tfValue(m[1]);
      t = t.slice(0, m.index);
    } else if ((m = TF_SUFFIX.exec(t)) && tfValue(m[1]) !== null) {
      val = tfValue(m[1]);
      t = t.slice(0, m.index);
    } else if ((m = TF_PLUS.exec(t))) {
      val = m[1] === "+";
      t = t.slice(0, m.index);
    }
    if (val === null && cur && cur.val === null && cur.expl.length === 0 && !num && !/[.?!]$/.test(cur.text)) {
      cur.text += ` ${t}`; // wrapped statement
      continue;
    }
    push();
    cur = { text: t.trim(), val, expl: [], n: num ? Number(num[1]) : out.length + 1 };
  }
  push();
  return out;
}

function parsePairs(lines: string[], lang: Locale): { pairs: PairDraft[]; skipped: number } {
  const pairs: PairDraft[] = [];
  let skipped = 0;
  for (const raw of lines) {
    const t = stripNum(splitBold(cleanLine(raw, true)).text.trim());
    if (!t) continue;
    const p = splitPair(t);
    if (!p) {
      skipped++;
      continue;
    }
    pairs.push({ n: pairs.length + 1, left: lt(lang, clip(plain(p[0]), 500)), right: lt(lang, clip(plain(p[1]), 500)), warnings: [], confidence: 1 });
  }
  return { pairs, skipped };
}

const MIN_ITEMS: Record<GameType, number> = { matching: 4, true_false: 5, quiz_race: 5 };

function detectGameType(lines: string[], explicit: string | undefined): { type: GameType; guessed: boolean } {
  const e = pickMap(GAME_TYPE_MAP, explicit);
  if (e) return { type: e, guessed: false };
  const body = lines.filter((l) => !H.title.test(l) && !H.description.test(l) && !H.subject.test(l) && !H.grade.test(l) && !H.difficulty.test(l) && !GH.type.test(l));
  const withOpts = body.filter((l) => OPT_LETTER.test(l.replace(/^[*✓✔]\s*/, "")) && /^[(\[]?[AaАа][)\].]/.test(l.replace(/^[*✓✔]\s*/, ""))).length;
  if (withOpts >= 2) return { type: "quiz_race", guessed: true };
  const tf = body.filter((l) => {
    const t = stripNum(l);
    const m = TF_BRACKET.exec(t) ?? TF_SUFFIX.exec(t);
    return (m && tfValue(m[1]) !== null) || TF_PLUS.test(t);
  }).length;
  if (tf >= 3 && tf >= body.length * 0.4) return { type: "true_false", guessed: true };
  return { type: "matching", guessed: true };
}

function parseGameStream(lines: string[], type: GameType, lang: Locale, filename?: string, key = new Map<number, string>()): GameImportDraft {
  const warnings: Warning[] = [];
  const head: Record<string, string> = {};
  const rest: string[] = [];
  let started = false;
  for (const raw of lines) {
    const t = splitBold(cleanLine(raw, true)).text.trim();
    if (!t) continue;
    if (!started) {
      const m = (re: RegExp) => re.exec(t)?.[1]?.trim();
      let v: string | undefined;
      if ((v = m(H.title)) !== undefined) head.title = v;
      else if ((v = m(H.description)) !== undefined) head.description = v;
      else if ((v = m(H.subject)) !== undefined) head.subject = v;
      else if ((v = m(H.grade)) !== undefined) head.grade = v;
      else if ((v = m(H.difficulty)) !== undefined) head.difficulty = v;
      else if (GH.type.test(t)) continue;
      else if (!head.title && !splitPair(t) && !/^\d+[.)]/.test(t) && !/^(?:savol|question|вопрос)\s*\d/i.test(t) && t.length <= 200) head.title = t;
      else {
        started = true;
        rest.push(t);
      }
      continue;
    }
    rest.push(t);
  }
  let pairs: PairDraft[] = [];
  let statements: StatementDraft[] = [];
  let questions: QuestionDraft[] = [];
  let quizHead: { title?: string; grade?: number | null; subject?: string } = {};
  if (type === "matching") {
    const r = parsePairs(rest, lang);
    pairs = r.pairs;
    if (r.skipped) warnings.push(warn("line_skipped", "warn", { n: r.skipped }));
    pairs.forEach((p) => {
      p.confidence = 1;
    });
  } else if (type === "true_false") statements = parseTrueFalse(rest, lang);
  else {
    const d = parseStream(lines, "quiz", lang, filename, key);
    if (d.kind === "quiz") {
      questions = d.questions;
      quizHead = { title: d.title[lang], grade: d.warnings.some((w) => w.code === "default_grade") ? null : d.grade, subject: d.subject_key };
      if (!head.title) head.title = d.warnings.some((w) => w.code === "no_title") ? "" : d.title[lang];
      head.difficulty ??= d.difficulty;
    }
  }
  const count = type === "matching" ? pairs.length : type === "true_false" ? statements.length : questions.length;
  if (count < MIN_ITEMS[type]) warnings.push(warn("game_few_items", "error", { min: MIN_ITEMS[type], n: count }));
  let title = plain(head.title ?? "").trim();
  if (!title) {
    title = (filename ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
    warnings.push(warn("no_title"));
  }
  const subj = head.subject ? (guessSubject(head.subject)?.key ?? (slugify(head.subject) || "general")) : (quizHead.subject && quizHead.subject !== "general" ? quizHead.subject : (guessSubject(title)?.key ?? "general"));
  const gradeNum = Number(/\d{1,2}/.exec(head.grade ?? "")?.[0]);
  return {
    kind: "game",
    gameType: type,
    title: lt(lang, clip(title, 300)),
    description: head.description ? lt(lang, clip(plain(head.description), 2000)) : emptyL(),
    subject_key: subj,
    grade: gradeNum >= 1 && gradeNum <= 11 ? gradeNum : (quizHead.grade ?? null),
    difficulty: pickMap(DIFF, head.difficulty) ?? "medium",
    pairs,
    statements,
    questions,
    warnings,
  };
}

function mergeGame(parts: Map<Locale, GameImportDraft>): GameImportDraft {
  const order = LOCALES.filter((l) => parts.has(l));
  const base = structuredClone(parts.get(order[0])!);
  for (const l of order.slice(1)) {
    const d = parts.get(l)!;
    mergeL(base.title, d.title, l);
    mergeL(base.description, d.description, l);
    d.pairs.forEach((p, i) => {
      const b = base.pairs[i];
      if (!b) return void base.pairs.push(p);
      mergeL(b.left, p.left, l);
      mergeL(b.right, p.right, l);
    });
    d.statements.forEach((s, i) => {
      const b = base.statements[i];
      if (!b) return void base.statements.push(s);
      mergeL(b.text, s.text, l);
      if (s.explanation) mergeL((b.explanation ??= emptyL()), s.explanation, l);
      if (b.isTrue === null && s.isTrue !== null) b.isTrue = s.isTrue;
    });
    d.questions.forEach((q, i) => {
      const b = base.questions[i];
      if (!b) return void base.questions.push(q);
      mergeL(b.text, q.text, l);
      if (q.explanation) mergeL((b.explanation ??= emptyL()), q.explanation, l);
      q.options.forEach((o, j) => b.options[j] && mergeL(b.options[j].text, o.text, l));
      if (b.correct === null) b.correct = q.correct;
    });
  }
  return base;
}

/* ================================================================== entry points */

export interface ExtraResult {
  draft: SurveyImportDraft | GameImportDraft;
  detectedLang: Locale;
  langs: Locale[];
}

export function parseExtra(blocks: Block[], opts: { kind: "survey" | "game"; lang: LangChoice; gameType?: GameTypeChoice; filename?: string }): ExtraResult {
  const { lines, key } = prepare(blocks, "quiz", { pairTables: opts.kind === "game" && opts.gameType !== "quiz_race" });
  const streams = splitStreams(lines);
  const detected = detectLang(lines.join("\n"));
  const lang: Locale = opts.lang === "auto" ? detected : opts.lang;
  let draft: SurveyImportDraft | GameImportDraft;

  if (opts.kind === "survey") {
    if (streams) {
      const parts = new Map<Locale, SurveyImportDraft>();
      for (const [l, ls] of streams) parts.set(l, parseSurveyStream(ls, l, opts.filename));
      draft = parts.size === 1 ? [...parts.values()][0] : mergeSurvey(parts);
    } else draft = parseSurveyStream(lines, lang, opts.filename);
  } else {
    const probe = streams ? [...streams.values()][0] : lines;
    const explicitHeader = probe.map((l) => GH.type.exec(l)?.[1]).find(Boolean);
    const explicit = opts.gameType && opts.gameType !== "auto" ? opts.gameType : explicitHeader;
    const det = opts.gameType && opts.gameType !== "auto" ? { type: opts.gameType, guessed: false } : detectGameType(probe, explicit);
    if (streams) {
      const parts = new Map<Locale, GameImportDraft>();
      for (const [l, ls] of streams) parts.set(l, parseGameStream(ls, det.type, l, opts.filename, key));
      draft = parts.size === 1 ? [...parts.values()][0] : mergeGame(parts);
    } else draft = parseGameStream(lines, det.type, lang, opts.filename, key);
    if (det.guessed) draft.warnings.push(warn("game_type_guessed", "warn", { type: det.type }));
  }
  const langs = LOCALES.filter((l) => draft.title[l] || (draft.kind === "survey" ? draft.questions.some((q) => q.text[l]) : [...draft.pairs.map((p) => p.left), ...draft.statements.map((s) => s.text), ...draft.questions.map((q) => q.text)].some((t) => t[l])));
  return { draft, detectedLang: streams ? (langs[0] ?? detected) : detected, langs };
}

