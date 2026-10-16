// Builds zod schemas from resource field definitions. Shared by server routes and client forms.
import { z } from "zod";
import { GAME_CONTENT_TYPES, MAX_ITEMS, validateGameItems, type GameContentType } from "./game-content-types";
import { normalizeSurveyQuestion, surveyIssues, surveyQuestionIssues } from "./survey-rules";
import type { Field, ResourceDef } from "./types";

type Shape = Record<string, z.ZodType>;

/** Only http(s) links are accepted for url fields (blocks javascript:, data:, etc.). */
export function isHttpUrl(x: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(x);
}
/** Media: http(s), site-relative uploads or (demo mode) blob: object URLs. */
export function isSafeMediaUrl(x: string): boolean {
  return x === "" || isHttpUrl(x) || /^blob:/i.test(x) || /^\/(?!\/)[^\s]*$/.test(x);
}

const numericSelect = (f: Field) => !!f.options?.length && f.options.every((o) => /^-?\d+$/.test(o.value));

function fieldSchema(f: Field): z.ZodType {
  switch (f.type) {
    case "url":
    case "image": {
      const ok = (x: string) => (f.type === "image" ? isSafeMediaUrl(x) : isHttpUrl(x));
      const base = z.string().max(2000).refine((x) => x === "" || ok(x), { message: "invalid url" });
      return f.required ? base.refine((x) => x !== "", { message: "required" }) : base.nullable().optional();
    }
    case "text":
    case "textarea":
    case "tel":
    case "password":
    case "color": {
      const base = z.string().max(f.type === "textarea" ? 20000 : 2000);
      return f.required ? base.min(1) : base.nullable().optional();
    }
    case "email": {
      return f.required
        ? z.email().max(320)
        : z.union([z.literal(""), z.email().max(320)]).nullable().optional();
    }
    case "number": {
      let n = f.int ? z.number().int() : z.number();
      if (f.min !== undefined) n = n.min(f.min);
      if (f.max !== undefined) n = n.max(f.max);
      const pre = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
      return f.required ? z.preprocess(pre, n) : z.preprocess(pre, n.nullable());
    }
    case "boolean":
      return z.boolean();
    case "select": {
      const values = (f.options ?? []).map((o) => o.value);
      if (numericSelect(f)) {
        const pre = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
        const n = z.number().int().refine((x) => values.includes(String(x)));
        return f.required ? z.preprocess(pre, n) : z.preprocess(pre, n.nullable());
      }
      const s = z.string().refine((x) => values.includes(x), { message: "invalid option" });
      return f.required ? s : z.union([z.literal(""), s]).nullable().optional();
    }
    case "date":
    case "datetime":
      return f.required ? z.string().min(1) : z.string().nullable().optional();
    case "localized":
    case "localizedArea": {
      const part = z.string().max(f.type === "localizedArea" ? 20000 : 1000);
      const obj = z.object({ uz: f.required ? part.min(1) : part, ru: part, en: part });
      return f.nullable ? obj.nullable().optional() : obj;
    }
    case "imageList":
      return z.array(z.string().max(2000).refine(isSafeMediaUrl, { message: "invalid url" })).max(200);
    case "stringList":
      return z.array(z.string().max(2000)).max(200);
    case "grades":
      return z.array(z.coerce.number().int().min(1).max(11)).max(11);
    case "repeater": {
      let arr = z.array(z.object(shapeOf(f.fields ?? [], false))).max(f.maxItems ?? 200);
      if (f.minItems) arr = arr.min(f.minItems);
      return arr;
    }
    case "group":
      return z.object(shapeOf(f.fields ?? [], false));
    case "gameItems":
      // structure is checked per game type in buildSchema().superRefine (validateGameItems)
      return z.array(z.record(z.string(), z.unknown())).max(MAX_ITEMS);
  }
}

function shapeOf(fields: Field[], topLevel: boolean, creating = false): Shape {
  const shape: Shape = {};
  for (const f of fields) {
    // top-level readOnly fields are never accepted from the client
    if (topLevel && f.readOnly) continue;
    if (topLevel && f.createOnly && !creating) continue;
    let s = fieldSchema(f);
    if (topLevel && !f.required) s = s.optional(); // omitted optional fields fall back to DB defaults
    // repeater child readOnly fields (ids) are still sent
    if (!topLevel && f.readOnly) s = z.any();
    shape[f.name] = s;
  }
  return shape;
}

export function buildSchema(res: ResourceDef, mode: "create" | "update") {
  const shape = shapeOf(res.fields, true, mode === "create");
  if (res.parent && mode === "create") {
    shape[res.parent.field] = z.union([z.string().min(1), z.number()]);
  }
  const obj = z.object(shape);
  const base = mode === "update" ? obj.partial() : obj;
  return base.superRefine((data, ctx) => {
    const d = data as Record<string, unknown>;
    const opts = d.options;
    // quiz questions: option ids must be unique and the correct id must exist
    if (Array.isArray(opts) && res.fields.some((f) => f.name === "options" && f.autoId)) {
      const ids = opts.map((o) => String((o as { id?: unknown })?.id ?? ""));
      if (new Set(ids).size !== ids.length || ids.some((x) => !x)) ctx.addIssue({ code: "custom", path: ["options"], message: "duplicate option ids" });
      if (typeof d.correct_option_id === "string" && !ids.includes(d.correct_option_id)) {
        ctx.addIssue({ code: "custom", path: ["correct_option_id"], message: "correct answer is not one of the options" });
      }
    }
    if (typeof d.min_score === "number" && typeof d.max_score === "number" && d.min_score > d.max_score && res.table === "psych_result_scales") {
      ctx.addIssue({ code: "custom", path: ["max_score"], message: "max must be >= min" });
    }
    // surveys: date window + question rules (options required for choice types, unique ids, scale_min < scale_max)
    if (res.table === "survey_questions" || res.table === "surveys") {
      for (const i of res.table === "surveys" ? surveyIssues(d) : surveyQuestionIssues(d)) ctx.addIssue({ code: "custom", path: i.path, message: i.message });
    }
    if (res.table === "game_content_sets" && Array.isArray(d.items)) {
      // on update the (create-only) game_type is not sent: infer it from the item shape
      const type = (GAME_CONTENT_TYPES as readonly string[]).includes(String(d.game_type)) ? (d.game_type as GameContentType) : inferGameType(d.items);
      if (!type) ctx.addIssue({ code: "custom", path: ["items"], message: "unknown item shape" });
      else for (const is of validateGameItems(type, d.items)) ctx.addIssue({ code: "custom", path: is.path ? ["items", ...is.path.split(".")] : ["items"], message: is.message });
    }
  });
}

/** Guess the game type from the first item (used when only `items` is sent, e.g. on update). */
function inferGameType(items: unknown[]): GameContentType | null {
  const f = items[0] as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  if ("left" in f) return "matching";
  if ("statement" in f) return "true_false";
  if ("options" in f) return "quiz_race";
  return null;
}

const EMPTY_TO_NULL =new Set(["date", "datetime", "image", "select", "url"]);

/** Post-parse cleanup: "" -> null for typed columns, drops virtual fields. */
export function normalize(res: ResourceDef, data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const f of res.fields) {
    if (f.virtual) {
      delete out[f.name];
      continue;
    }
    if (EMPTY_TO_NULL.has(f.type) && !f.required && out[f.name] === "") out[f.name] = null;
  }
  if (res.table === "survey_questions") return normalizeSurveyQuestion(out);
  return out;
}

/** CSV parser (RFC4180-ish) for the quiz question bulk import. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const src = text.replace(/^﻿/, "");
  const delim = (src.split("\n")[0].match(/;/g)?.length ?? 0) > (src.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** Neutralises spreadsheet formulas (=, +, -, @, tab, CR); plain phone numbers / negative numbers are kept. */
export function csvSafe(s: string): string {
  if (!/^[=+\-@\t\r]/.test(s)) return s;
  if (/^[+-]?\d[\d ()-]*$/.test(s) || /^-?\d*\.?\d+$/.test(s)) return s;
  return `'${s}`;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? String(v) : csvSafe(String(v));
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
