/**
 * Shared i18n audit: flattens every UI dictionary (messages/*.json, components/* /i18n*.ts, lib/school/i18n*.ts,
 * lib/admin/ui-i18n.ts) into path -> leaf maps per locale and reports problems.
 * Used by tests/i18n-completeness.test.ts (and runnable ad hoc from vitest).
 */
import fs from "node:fs";
import path from "node:path";
import { getGameDict } from "@/components/games/i18n";
import { assessmentDict } from "@/components/assessment/i18n";
import { olympiadDict } from "@/components/olympiad/i18n";
import { getPsychDict } from "@/components/psych/i18n";
import { DICT as PUBLIC_DICT, TESTIMONIALS, WHY_US, TIMELINE, VALUES, CLUBS } from "@/components/public/i18n";
import { quizDict } from "@/components/quiz/i18n";
import { surveyDict } from "@/components/surveys/i18n";
import { UI as ADMIN_UI } from "@/lib/admin/ui-i18n";
import { UI as SCHOOL_UI } from "@/lib/school/i18n";

export const LOCALES = ["uz", "ru", "en"] as const;
type Loc = (typeof LOCALES)[number];
type Leaf = string | ((...a: number[]) => string) | number | boolean | null;
export type Flat = Map<string, Leaf>;

function flatten(v: unknown, prefix: string, out: Flat) {
  if (typeof v === "string" || typeof v === "function" || typeof v === "number" || typeof v === "boolean" || v === null) {
    out.set(prefix, v as Leaf);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => flatten(x, `${prefix}[${i}]`, out));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  }
}
const flat = (v: unknown) => {
  const m: Flat = new Map();
  flatten(v, "", m);
  return m;
};

function readJson(l: Loc) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", `${l}.json`), "utf8"));
}

/** one entry per dictionary: a flat map for each locale */
export function loadDictionaries(): Record<string, Record<Loc, Flat>> {
  const byLocale = <T,>(f: (l: Loc) => T): Record<Loc, Flat> => ({ uz: flat(f("uz")), ru: flat(f("ru")), en: flat(f("en")) });
  // `{key: {uz, ru, en}}` dictionaries are transposed into three per-locale trees
  const transpose = (d: Record<string, Record<Loc, string>>) => byLocale((l) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v[l]])));
  return {
    "messages/*.json": byLocale(readJson),
    "components/games/i18n": byLocale((l) => getGameDict(l)),
    "components/assessment/i18n": byLocale((l) => assessmentDict[l]),
    "components/olympiad/i18n": byLocale((l) => olympiadDict[l]),
    "components/psych/i18n": byLocale((l) => getPsychDict(l)),
    "components/quiz/i18n": byLocale((l) => quizDict[l]),
    "components/surveys/i18n": byLocale((l) => surveyDict(l)),
    "components/public/i18n DICT": transpose(PUBLIC_DICT as never),
    "components/public/i18n TESTIMONIALS": byLocale((l) => TESTIMONIALS.map((t) => ({ name: t.name[l], role: t.role[l], text: t.text[l] }))),
    "components/public/i18n WHY_US": byLocale((l) => WHY_US.map((t) => ({ title: t.title[l], text: t.text[l] }))),
    "components/public/i18n TIMELINE": byLocale((l) => TIMELINE.map((t) => ({ title: t.title[l], text: t.text[l] }))),
    "components/public/i18n VALUES": byLocale((l) => VALUES.map((t) => ({ title: t.title[l], text: t.text[l] }))),
    "components/public/i18n CLUBS": byLocale((l) => CLUBS.map((t) => ({ name: t.name[l], text: t.text[l] }))),
    "lib/admin/ui-i18n": transpose(ADMIN_UI as never),
    "lib/school/i18n*": transpose(SCHOOL_UI as never),
  } as Record<string, Record<Loc, Flat>>;
}

const CYR = /[Ѐ-ӿ]/;
const LAT_WORD = /[A-Za-z]{4,}/g;

/** Latin words allowed inside Russian strings (brand, proper nouns, units, file formats, product names). */
const RU_LATIN_OK = new RegExp(
  "^(" +
    [
      "Children", "Academy", "Group", "Termez", "Cambridge", "IELTS", "Excel", "XLSX", "CSV", "PDF", "Word", "DOCX", "JSON", "Telegram", "WhatsApp", "Instagram", "YouTube", "Google", "Maps", "Facebook",
      "Supabase", "email", "demo", "QR", "OCR", "SAT", "TOEFL", "STEM", "Montessori", "Wi", "Zoom", "Kahoot", "Stroop", "Schulte", "Mozart", "PISA", "Olympiad", "World", "Dilnoza", "Karimova", "UTF", "HTML", "text", "https",
      "Pythagoras", "Newton", "Einstein", "Euler", "Tashkent", "Samarkand", "Bukhara", "Uzbekistan", "Cyrillic", "Latin", "Edu", "Teacher", "Mentor", "Math", "Maths", "iPhone", "Android", "Windows", "Chrome", "Safari", "Firefox", "Edge",
    ].join("|") +
    ")$",
  "i",
);

export type Finding = { dict: string; kind: string; key: string; detail?: string };

const BRAND_SAME = /^(Children's Academy( Group Termez)?|Telegram|Instagram|YouTube|Facebook|WhatsApp|Excel|PDF|XLSX|CSV|DOCX|OK|QR|ID|E-mail|Email|IELTS|SAT|STEM|SMS|PIN|Demo|DEMO|Online|Stroop|Schulte|Google Maps|Wi-?Fi|JSON|OCR|Word|ISO|CEFR|GPA)$/i;

export function audit(): Finding[] {
  const out: Finding[] = [];
  const dicts = loadDictionaries();
  for (const [name, d] of Object.entries(dicts)) {
    const all = new Set<string>([...d.uz.keys(), ...d.ru.keys(), ...d.en.keys()]);
    for (const key of all) {
      for (const l of LOCALES) if (!d[l].has(key)) out.push({ dict: name, kind: "missing", key, detail: l });
      const vals = LOCALES.map((l) => d[l].get(key));
      for (const l of LOCALES) {
        const v = d[l].get(key);
        if (typeof v === "string" && v.trim() === "" && vals.some((x) => typeof x === "string" && x.trim() !== "")) out.push({ dict: name, kind: "empty", key, detail: l });
      }
      const [uz, ru, en] = vals;
      if (typeof uz === "string" && CYR.test(uz)) out.push({ dict: name, kind: "uz-has-cyrillic", key, detail: uz.slice(0, 60) });
      if (typeof en === "string" && CYR.test(en)) out.push({ dict: name, kind: "en-has-cyrillic", key, detail: en.slice(0, 60) });
      if (typeof ru === "string" && ru.length > 3) {
        const latin = (ru.match(LAT_WORD) ?? []).filter((w) => !RU_LATIN_OK.test(w));
        if (!CYR.test(ru) && latin.length > 0 && !BRAND_SAME.test(ru) && !/^[\w.@:/ -]+$/.test(ru)) out.push({ dict: name, kind: "ru-not-cyrillic", key, detail: ru.slice(0, 60) });
      }
      if (typeof uz === "string" && uz === ru && ru === en) {
        const letters = uz.replace(/[^\p{L}]/gu, "");
        if (letters.length >= 4 && !BRAND_SAME.test(uz.trim()) && !/^[\w.@:/#$%+&|·-]+$/.test(uz) && !/^https?:/.test(uz)) out.push({ dict: name, kind: "same-in-all", key, detail: uz.slice(0, 60) });
      }
      for (const l of LOCALES) {
        const v = d[l].get(key);
        if (typeof v === "string" && l === "uz" && /[‘ʻʼ´`’]/.test(v)) out.push({ dict: name, kind: "uz-apostrophe", key, detail: v.slice(0, 60) });
      }
      // plural functions: ru needs 1 / 2-4 / 5+ forms, en 1 / many, uz has none
      if (typeof ru === "function") {
        const f = ru as (n: number) => string;
        try {
          const one = f(1), few = f(2), many = f(5);
          const eleven = f(11), twentyOne = f(21), twentyTwo = f(22);
          const noun = (s: string) => s.replace(/\d+/g, "").trim();
          if (new Set([noun(one), noun(few), noun(many)]).size < 3) out.push({ dict: name, kind: "ru-plural-collapsed", key, detail: `${one} | ${few} | ${many}` });
          if (noun(eleven) !== noun(many) || noun(twentyOne) !== noun(one) || noun(twentyTwo) !== noun(few)) out.push({ dict: name, kind: "ru-plural-wrong", key, detail: `${eleven} | ${twentyOne} | ${twentyTwo}` });
        } catch {
          /* not a (n) => string plural */
        }
      }
    }
  }
  return out;
}

/** hard-coded user-visible strings in JSX: text nodes and common attributes that contain letters and are not i18n lookups */
export function scanHardcodedStrings(root = process.cwd()): Finding[] {
  const out: Finding[] = [];
  const dirs = ["components", "app"].map((d) => path.join(root, d));
  const skip = /(^|[\\/])(api|node_modules)([\\/]|$)/;
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (skip.test(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name)) files.push(p);
    }
  };
  dirs.forEach(walk);
  const attr = /\b(placeholder|aria-label|title|alt)=("([^"{}]*[A-Za-zА-Яа-я]{3,}[^"{}]*)")/g;
  const textNode = />\s*([A-ZА-Я][^<>{}\n]{3,}[a-zа-я.!?])\s*</g;
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, "/");
    const src = fs.readFileSync(f, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const m of line.matchAll(attr)) {
        const val = m[3];
        if ((m[1] === "title" || m[1] === "alt") && /^[a-z0-9_:./#-]+$/.test(val)) continue;
        if (/^(https?:\/\/|[+\d\s().-]+)$/.test(val) || /^[\w.]+@[\w.]+$/.test(val)) continue; // URL / phone / e-mail example placeholders
        out.push({ dict: rel, kind: `attr-${m[1]}`, key: String(i + 1), detail: val.slice(0, 60) });
      }
      for (const m of line.matchAll(textNode)) {
        const val = m[1].trim();
        if (/^[A-Z_]+$/.test(val)) continue;
        out.push({ dict: rel, kind: "text-node", key: String(i + 1), detail: val.slice(0, 60) });
      }
    });
  }
  return out;
}
