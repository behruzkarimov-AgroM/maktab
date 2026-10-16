// Server-side text extraction for the document import. The file TYPE is detected from content (formats/sniff.ts).
// Nothing here executes document content: macros are never run, scripts/images/styles/external links are dropped
// and never fetched, only text, basic formatting (bold) and tables survive.
import { parseCsv } from "@/lib/admin/validation";
import { htmlToBlocks, textToBlocks, type Block } from "./blocks";
import { ImportError } from "./errors";
import { decodeSmart, declaredCharset } from "./formats/decode";
import { extractDoc, extractEpub, extractOdf, extractPptx, extractSheets, rtfToText, type Extracted } from "./formats/office";
import { ocrEnabled, ocrImages, ocrLangs, OCR_MAX_PAGES } from "./formats/ocr";
import { withOcrSlot } from "./limiter";
import { sniff, isTextType, type DocType } from "./formats/sniff";
import { hasMacros, zipDirectory, type ZipInfo } from "./formats/zip";
import { cleanLine, tidyBold, translitBlocks, UZ_CYR } from "./text";
import type { ImportKind, LangChoice } from "./types";

export { ImportError } from "./errors";
export { htmlToBlocks, textToBlocks, type Block } from "./blocks";
export type { DocType } from "./formats/sniff";

export interface ExtractOpts {
  lang?: LangChoice;
  /** convert Uzbek Cyrillic to Latin after extraction (and use the Cyrillic OCR model) */
  translit?: boolean;
}

export interface ExtractedDoc {
  format: DocType;
  blocks: Block[];
  chars: number;
  /** text with its original blank lines (text formats) or the joined blocks */
  rawText: string;
  units?: Extracted["units"];
  ocr?: boolean;
  ocrConfidence?: number;
  uzCyrillic?: boolean;
  transliterated?: boolean;
  zip?: ZipInfo;
}

const MAX_CHARS = 600_000;
const MAX_PDF_PAGES = 150;
const PDF_TIMEOUT_MS = 40_000;
/** hard cap on the number of pages a PDF may have (text extraction walks every page, so this is checked BEFORE it starts) */
const MAX_PDF_TOTAL_PAGES = 400;
/** largest rendered page (pixels) when a scanned PDF is rasterised for OCR */
const MAX_RENDER_PIXELS = 12_000_000;

/** Kept for the .docx structure checks: zip bomb / not a Word package / macros. */
export function inspectDocx(b: Uint8Array): void {
  const info = zipDirectory(b, "not_docx");
  if (info.encrypted) throw new ImportError("encrypted_file");
  if (!info.names.includes("word/document.xml")) throw new ImportError("not_docx");
  if (hasMacros(info.names)) throw new ImportError("macros_not_allowed");
}

/* ------------------------------------------------------------------ extractors */

async function extractDocx(bytes: Uint8Array, keepTabs: boolean): Promise<Block[]> {
  inspectDocx(bytes);
  let html: string;
  try {
    const mammoth = (await import("mammoth")).default;
    const out = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes) },
      {
        // images are never embedded: they only cost memory and cannot become text
        convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
        ignoreEmptyParagraphs: true,
      },
    );
    html = out.value;
  } catch {
    throw new ImportError("docx_failed");
  }
  if (html.length > MAX_CHARS * 4) throw new ImportError("file_too_large", 413);
  return htmlToBlocks(html, keepTabs);
}

const PAGE_NO = /^(?:page|bet|стр\.?|страница)\s*\d+(?:\s*(?:\/|of|из)\s*\d+)?$/i;

export function pdfTextToBlocks(pages: string[]): Block[] {
  const blocks: Block[] = [];
  for (const page of pages) {
    for (const raw of page.split(/\r?\n/)) {
      const text = cleanLine(raw);
      if (!text) continue;
      if (PAGE_NO.test(text) || /^[-–—]?\s*\d{1,3}\s*[-–—]?$/.test(text)) continue; // page numbers
      blocks.push({ t: "line", text });
    }
  }
  return blocks;
}

async function extractPdf(bytes: Uint8Array, opts: ExtractOpts): Promise<Pick<ExtractedDoc, "blocks" | "units" | "ocr" | "ocrConfidence" | "rawText">> {
  let pages: string[] = [];
  let total = 0;
  let scannedImages: Uint8Array[] | null = null;
  const run = async () => {
    const { getDocumentProxy, extractText, renderPageAsImage } = await import("unpdf");
    // eval/font loading are disabled: the document can never run code in this process
    const o = { isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false } as Record<string, unknown>;
    const pdf = await getDocumentProxy(new Uint8Array(bytes), o);
    total = pdf.numPages;
    if (total > MAX_PDF_TOTAL_PAGES) throw new ImportError("file_too_large", 413);
    const out = await extractText(pdf, { mergePages: false });
    pages = out.text.slice(0, MAX_PDF_PAGES);
    const letters = pages.join("").replace(/\s/g, "").length;
    if (letters < 20 && ocrEnabled()) {
      // image-only PDF: render the first pages and recognise them (OCR)
      const imgs: Uint8Array[] = [];
      await withOcrSlot(async () => {
        for (let p = 1; p <= Math.min(total, OCR_MAX_PAGES); p++) {
          // scale 2 for small pages, lower for huge MediaBoxes so one page never exceeds MAX_RENDER_PIXELS
          const vp = (await (await pdf.getPage(p)).getViewport({ scale: 1 })) as { width: number; height: number };
          const area = Math.max(1, vp.width * vp.height);
          const scale = Math.max(0.5, Math.min(2, Math.sqrt(MAX_RENDER_PIXELS / area)));
          const buf = await renderPageAsImage(pdf, p, { canvasImport: () => import("@napi-rs/canvas"), scale });
          imgs.push(new Uint8Array(buf));
        }
      });
      scannedImages = imgs;
    }
  };
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([run(), new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error("timeout")), PDF_TIMEOUT_MS)))]);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if ((e as { name?: string })?.name === "PasswordException") throw new ImportError("pdf_encrypted");
    throw new ImportError("pdf_failed");
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (scannedImages) {
    const r = await ocrImages(scannedImages, ocrLangs(opts.lang === "auto" || !opts.lang ? "auto" : opts.lang, !!opts.translit));
    const blocks = pdfTextToBlocks([r.text]);
    return { blocks, units: { pages: total }, ocr: true, ocrConfidence: Math.round(r.confidence), rawText: "" };
  }
  const blocks = pdfTextToBlocks(pages);
  const letters = blocks.reduce((n, b) => n + (b.t === "line" ? b.text.replace(/\s/g, "").length : 0), 0);
  if (letters < 20) throw new ImportError("no_selectable_text");
  return { blocks, units: { pages: total }, rawText: "" };
}

/* ---- csv: rows -> the same line format the text parser reads ---- */

type Col = { kind: "q" | "opt" | "score" | "correct" | "points" | "expl" | "title"; letter?: string; lang?: "uz" | "ru" | "en"; idx: number };

function classify(h: string, idx: number): Col | null {
  let s = h.trim().toLowerCase().replace(/'/g, "").replace(/[\s-]+/g, "_");
  let lang: Col["lang"];
  const lm = /_(uz|ru|en)$/.exec(s);
  if (lm) {
    lang = lm[1] as Col["lang"];
    s = s.slice(0, -3);
  }
  const base = { lang, idx };
  if (/^(question|savol|вопрос|text|savol_matni|question_text)$/.test(s)) return { kind: "q", ...base };
  if (/^(title|nomi|sarlavha|название)$/.test(s)) return { kind: "title", ...base };
  let m = /^(?:option_|variant_|opt_|вариант_)?([a-f])(?:_(?:text|matn))?$/.exec(s);
  if (m) return { kind: "opt", letter: m[1].toUpperCase(), ...base };
  m = /^(?:([a-f])_(?:score|ball|балл)|(?:score|ball|балл)_([a-f]))$/.exec(s);
  if (m) return { kind: "score", letter: (m[1] ?? m[2]).toUpperCase(), ...base };
  if (/^(correct|correct_option|correct_answer|answer|javob|togri|togri_javob|ответ|правильный_ответ)$/.test(s)) return { kind: "correct", ...base };
  if (/^(points|point|ball|балл|баллы)$/.test(s)) return { kind: "points", ...base };
  if (/^(explanation|izoh|tushuntirish|пояснение|объяснение)$/.test(s)) return { kind: "expl", ...base };
  return null;
}

export function csvToBlocks(text: string, kind: ImportKind): Block[] {
  return rowsToBlocks(parseCsv(text), kind);
}

/** Spreadsheet-like rows (csv / xlsx / ods / json): a recognised header becomes question lines, otherwise nothing. */
export function rowsToBlocks(rows: string[][], kind: ImportKind): Block[] {
  if (rows.length < 2) return [];
  const cols = rows[0].map((h, i) => classify(h, i)).filter((c): c is Col => !!c);
  if (!cols.some((c) => c.kind === "q")) return [];
  const tag = (l?: string) => (l ? `[${l.toUpperCase()}] ` : "");
  const out: Block[] = [];
  const titleCol = cols.filter((c) => c.kind === "title");
  const first = rows[1];
  for (const c of titleCol) if ((first[c.idx] ?? "").trim()) out.push({ t: "line", text: `${tag(c.lang)}Nomi: ${first[c.idx].trim()}` });
  rows.slice(1).forEach((r, i) => {
    const get = (c: Col) => (r[c.idx] ?? "").trim();
    for (const c of cols.filter((x) => x.kind === "q")) if (get(c)) out.push({ t: "line", text: `${tag(c.lang)}${i + 1}. ${get(c).replace(/\s+/g, " ")}` });
    for (const c of cols.filter((x) => x.kind === "opt")) {
      if (!get(c)) continue;
      const sc = cols.find((s) => s.kind === "score" && s.letter === c.letter);
      const score = sc && get(sc) !== "" ? ` (${get(sc)})` : "";
      out.push({ t: "line", text: `${tag(c.lang)}${c.letter}) ${get(c)}${kind === "psych" ? score : ""}` });
    }
    const cor = cols.find((x) => x.kind === "correct");
    if (cor && get(cor)) out.push({ t: "line", text: `Javob: ${get(cor)}` });
    const pts = cols.find((x) => x.kind === "points");
    if (pts && get(pts)) out.push({ t: "line", text: `Ball: ${get(pts)}` });
    for (const c of cols.filter((x) => x.kind === "expl")) if (get(c)) out.push({ t: "line", text: `${tag(c.lang)}Izoh: ${get(c)}` });
  });
  return out.map((b) => (b.t === "line" ? { t: "line", text: tidyBold(cleanLine(b.text)) } : b));
}


/* ------------------------------------------------------------------ text-like formats */

function markdownBlocks(text: string): Block[] {
  const out: Block[] = [];
  let fence = false;
  let table: string[][] = [];
  const flushTable = () => {
    const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    if (rows.length) out.push({ t: "table", rows });
    table = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(raw) && !fence) {
      table.push(raw.trim().slice(1, -1).split("|").map((c) => cleanLine(c)));
      continue;
    }
    if (table.length) flushTable();
    let t = raw
      .replace(/^\s*#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^(\s*)[-+]\s+\[ \]\s+/, "$1☐ ")
      .replace(/^(\s*)[-+]\s+\[[xX]\]\s+/, "$1☑ ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/__([^_]+)__/g, "**$1**");
    t = tidyBold(cleanLine(t));
    if (t) out.push({ t: "line", text: t });
  }
  if (table.length) flushTable();
  return out;
}

function jsonBlocks(text: string, kind: ImportKind): Block[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("bad_magic");
  }
  if (Array.isArray(data) && data.length && data.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
    const keys = [...new Set(data.flatMap((o) => Object.keys(o as object)))].slice(0, 40);
    const rows = [keys, ...data.slice(0, 5000).map((o) => keys.map((k) => String((o as Record<string, unknown>)[k] ?? "")))];
    const q = rowsToBlocks(rows, kind);
    return q.length ? q : [{ t: "table", rows }];
  }
  const lines: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (lines.length > 5000) return;
    if (typeof v === "string") lines.push(cleanLine(key && !/^\d+$/.test(key) ? `${key}: ${v}` : v));
    else if (typeof v === "number" || typeof v === "boolean") lines.push(key ? `${key}: ${v}` : String(v));
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(data);
  return lines.filter(Boolean).map((text) => ({ t: "line" as const, text }));
}

function blocksToText(blocks: Block[]): string {
  return blocks.map((b) => (b.t === "line" ? b.text : b.rows.map((r) => r.join(" | ")).join("\n"))).join("\n");
}

/* ------------------------------------------------------------------ entry point */

export async function extractDocument(bytes: Uint8Array, filename: string, kind: ImportKind, opts: ExtractOpts = {}): Promise<ExtractedDoc> {
  const sn = sniff(bytes, filename);
  const type = sn.type;
  const keepTabs = kind === "game";
  let blocks: Block[] = [];
  let rawText = "";
  let units: Extracted["units"];
  let ocr: boolean | undefined;
  let ocrConfidence: number | undefined;

  const fromExtracted = (x: Extracted) => {
    blocks = x.blocks;
    units = x.units;
  };

  switch (type) {
    case "docx":
      blocks = await extractDocx(bytes, keepTabs);
      break;
    case "pdf": {
      const r = await extractPdf(bytes, opts);
      blocks = r.blocks;
      units = r.units;
      ocr = r.ocr;
      ocrConfidence = r.ocrConfidence;
      break;
    }
    case "doc":
      fromExtracted(await extractDoc(bytes));
      break;
    case "xls":
    case "xlsx":
      fromExtracted(await extractSheets(bytes, kind, rowsToBlocks, type === "xlsx"));
      break;
    case "odt":
    case "odp":
      fromExtracted(await extractOdf(bytes, type));
      break;
    case "ods": {
      const x = await extractOdf(bytes, "ods");
      blocks = x.blocks.flatMap((b) => {
        if (b.t !== "table") return [b];
        const q = rowsToBlocks(b.rows, kind);
        return q.length ? q : [b];
      });
      units = x.units;
      break;
    }
    case "pptx":
      fromExtracted(await extractPptx(bytes));
      break;
    case "epub":
      fromExtracted(await extractEpub(bytes));
      break;
    case "rtf":
      rawText = rtfToText(new TextDecoder("latin1").decode(bytes));
      blocks = textToBlocks(rawText, keepTabs);
      break;
    case "image": {
      const r = await ocrImages([bytes], ocrLangs(opts.lang ?? "auto", !!opts.translit));
      rawText = r.text;
      blocks = textToBlocks(r.text, keepTabs);
      ocr = true;
      ocrConfidence = Math.round(r.confidence);
      units = { pages: 1 };
      break;
    }
    case "zip":
      throw new ImportError("unsupported_type", 415); // archives are expanded by the caller (importZip)
    default: {
      if (!isTextType(type)) throw new ImportError("unsupported_type", 415);
      const { text } = decodeSmart(bytes, type === "html" || type === "xml" ? declaredCharset(bytes) : undefined);
      if (text.length > MAX_CHARS * 2) throw new ImportError("file_too_large", 413);
      rawText = text;
      if (type === "html" || type === "xml") blocks = htmlToBlocks(text, keepTabs);
      else if (type === "md") blocks = markdownBlocks(text);
      else if (type === "json") blocks = jsonBlocks(text, kind);
      else if (type === "csv" || type === "tsv") {
        const rows = type === "tsv" ? text.split(/\r?\n/).map((l) => l.split("\t")) : parseCsv(text);
        blocks = rowsToBlocks(rows, kind);
        if (!blocks.length) blocks = textToBlocks(text, keepTabs);
      } else blocks = textToBlocks(text, keepTabs);
    }
  }

  let transliterated = false;
  if (opts.translit) {
    const t = translitBlocks(blocks);
    transliterated = t.changed;
    blocks = t.blocks;
    rawText = "";
  }
  if (!rawText) rawText = blocksToText(blocks);
  let chars = 0;
  for (const b of blocks) chars += b.t === "line" ? b.text.length : b.rows.reduce((n, r) => n + r.join(" ").length, 0);
  if (chars === 0) throw new ImportError("empty_document");
  if (chars > MAX_CHARS) throw new ImportError("file_too_large", 413);
  return { format: type, blocks, chars, rawText: rawText.slice(0, 150_000), units, ocr, ocrConfidence, uzCyrillic: UZ_CYR.test(rawText), transliterated, zip: sn.zip };
}
