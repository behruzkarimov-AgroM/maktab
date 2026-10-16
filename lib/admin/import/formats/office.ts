// Text extractors for office-like formats. All of them only READ text/structure: no macros, scripts, links or embedded
// objects are executed or fetched, images are ignored.
import JSZip from "jszip";
import { decodeEntities, htmlToBlocks, type Block } from "../blocks";
import { ImportError } from "../errors";
import { cleanLine, tidyBold } from "../text";
import type { ImportKind } from "../types";
import { zipDirectory, hasMacros, type ZipInfo } from "./zip";

export interface Extracted {
  blocks: Block[];
  units?: { pages?: number; sheets?: number; slides?: number };
}

const XML_CAP = 20 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLS = 40;

async function load(bytes: Uint8Array, bad: ImportError["code"]): Promise<{ zip: JSZip; info: ZipInfo }> {
  const info = zipDirectory(bytes, "bad_magic");
  if (info.encrypted) throw new ImportError("encrypted_file");
  if (hasMacros(info.names)) throw new ImportError("macros_not_allowed");
  try {
    return { zip: await JSZip.loadAsync(bytes), info };
  } catch {
    throw new ImportError(bad);
  }
}

async function text(zip: JSZip, info: ZipInfo, name: string): Promise<string> {
  const f = zip.file(name);
  if (!f) return "";
  if ((info.sizes.get(name) ?? 0) > XML_CAP) throw new ImportError("zip_bomb");
  return f.async("string");
}

const inner = (xml: string) =>
  decodeEntities(
    xml
      .replace(/<text:tab\s*\/>|<a:tab\s*\/>/g, " ")
      .replace(/<text:line-break\s*\/>|<a:br\s*\/>/g, "\n")
      .replace(/<text:s\b[^>]*\/>/g, " ")
      .replace(/<[^>]+>/g, ""),
  );

const clean = (s: string) => tidyBold(cleanLine(s));

/* ------------------------------------------------------------------ OpenDocument (odt / ods / odp) */

export function odfBlocks(xml: string): { blocks: Block[]; tables: number } {
  const blocks: Block[] = [];
  let tables = 0;
  const re = /<table:table\b[^>]*>([\s\S]*?)<\/table:table>|<(text:p|text:h)\b[^>]*>([\s\S]*?)<\/\2>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) {
      tables++;
      const rows: string[][] = [];
      for (const r of m[1].matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
        const cells: string[] = [];
        for (const c of r[1].matchAll(/<table:table-cell\b[^>]*?(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g)) {
          const paras = [...(c[1] ?? "").matchAll(/<text:(?:p|h)\b[^>]*>([\s\S]*?)<\/text:(?:p|h)>/g)].map((p) => clean(inner(p[1])));
          cells.push(paras.filter(Boolean).join(" "));
        }
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        if (cells.length) rows.push(cells.slice(0, MAX_COLS));
        if (rows.length >= MAX_ROWS) break;
      }
      if (rows.length) blocks.push({ t: "table", rows });
    } else {
      const t = clean(inner(m[3]));
      if (t) blocks.push({ t: "line", text: t });
    }
  }
  return { blocks, tables };
}

export async function extractOdf(bytes: Uint8Array, type: "odt" | "ods" | "odp"): Promise<Extracted> {
  const { zip, info } = await load(bytes, "odf_failed");
  const xml = await text(zip, info, "content.xml");
  if (!xml) throw new ImportError("odf_failed");
  const { blocks, tables } = odfBlocks(xml);
  const slides = type === "odp" ? (xml.match(/<draw:page\b/g) ?? []).length : undefined;
  return { blocks, units: { sheets: type === "ods" ? tables : undefined, slides } };
}

/* ------------------------------------------------------------------ pptx */

export async function extractPptx(bytes: Uint8Array): Promise<Extracted> {
  const { zip, info } = await load(bytes, "pptx_failed");
  const num = (n: string) => Number(/(\d+)\.xml$/.exec(n)?.[1] ?? 0);
  const slides = info.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
  if (!slides.length) throw new ImportError("pptx_failed");
  const blocks: Block[] = [];
  for (const s of slides.slice(0, 300)) {
    const parts = [await text(zip, info, s), await text(zip, info, `ppt/notesSlides/notesSlide${num(s)}.xml`)];
    for (const xml of parts) {
      for (const p of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
        const t = clean(inner([...p[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g)].map((x) => (x[1] !== undefined ? x[1] : "\n")).join("")));
        if (t) blocks.push({ t: "line", text: t });
      }
    }
  }
  return { blocks, units: { slides: slides.length } };
}

/* ------------------------------------------------------------------ epub */

export async function extractEpub(bytes: Uint8Array): Promise<Extracted> {
  const { zip, info } = await load(bytes, "epub_failed");
  const pages = info.names.filter((n) => /\.(?:x?html?)$/i.test(n)).sort().slice(0, 400);
  if (!pages.length) throw new ImportError("epub_failed");
  const blocks: Block[] = [];
  let chars = 0;
  for (const p of pages) {
    const b = htmlToBlocks(await text(zip, info, p));
    blocks.push(...b);
    chars += b.length;
    if (chars > 200_000) break;
  }
  return { blocks, units: { pages: pages.length } };
}

/* ------------------------------------------------------------------ spreadsheets */

export async function extractSheets(bytes: Uint8Array, kind: ImportKind, rowsToBlocks: (rows: string[][], kind: ImportKind) => Block[], isZipFile: boolean): Promise<Extracted> {
  if (isZipFile) {
    const info = zipDirectory(bytes, "bad_magic");
    if (info.encrypted) throw new ImportError("encrypted_file");
    if (hasMacros(info.names)) throw new ImportError("macros_not_allowed");
  }
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false, sheetRows: MAX_ROWS + 1, dense: false });
    const blocks: Block[] = [];
    for (const name of wb.SheetNames.slice(0, 30)) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const rows = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][])
        .slice(0, MAX_ROWS)
        .map((r) => r.slice(0, MAX_COLS).map((c) => cleanLine(String(c ?? ""))));
      while (rows.length && rows[rows.length - 1].every((c) => !c)) rows.pop();
      if (!rows.length) continue;
      const q = rowsToBlocks(rows, kind);
      if (q.length) blocks.push(...q);
      else if (rows.every((r) => r.filter(Boolean).length <= 1)) rows.forEach((r) => r.filter(Boolean).forEach((c) => blocks.push({ t: "line", text: c })));
      else blocks.push({ t: "table", rows });
    }
    return { blocks, units: { sheets: wb.SheetNames.length } };
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("xlsx_failed");
  }
}

/* ------------------------------------------------------------------ legacy .doc */

export async function extractDoc(bytes: Uint8Array): Promise<Extracted> {
  // encrypted OOXML packages are stored in an OLE container too
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 8192))).toString("latin1");
  if (/E\0n\0c\0r\0y\0p\0t\0e\0d\0P\0a\0c\0k\0a\0g\0e/.test(head)) throw new ImportError("encrypted_file");
  try {
    const WordExtractor = (await import("word-extractor")).default;
    const doc = await new WordExtractor().extract(Buffer.from(bytes));
    const body: string = doc.getBody();
    const lines = body.split(/\r?\n|\r|\u000b|\u0007/).map((l: string) => tidyBold(cleanLine(l))).filter(Boolean);
    return { blocks: lines.map((text: string) => ({ t: "line" as const, text })) };
  } catch {
    throw new ImportError("doc_failed");
  }
}

/* ------------------------------------------------------------------ rtf */

const RTF_SKIP = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl", "footerr", "themedata", "datastore", "listtable", "listoverridetable", "rsidtbl", "generator", "latentstyles", "filetbl", "revtbl", "object", "fldinst", "xmlnstbl", "colorschememapping", "template", "private", "bkmkstart", "bkmkend", "shpinst", "falt"]);

/** Minimal RTF -> text. Control words only change text flow; embedded objects/pictures/fields are skipped. */
export function rtfToText(src: string): string {
  let out = "";
  const stack: { skip: boolean }[] = [];
  let skip = false;
  let cp = 1252;
  let uc = 1;
  let bytes: number[] = [];
  const flush = () => {
    if (!bytes.length) return;
    if (!skip) {
      try {
        out += new TextDecoder(`windows-${cp}`).decode(Uint8Array.from(bytes));
      } catch {
        out += new TextDecoder("windows-1252").decode(Uint8Array.from(bytes));
      }
    }
    bytes = [];
  };
  const m = /^\{\\rtf/i.exec(src.slice(0, 20));
  if (!m) throw new ImportError("rtf_failed");
  for (let i = 0; i < src.length && out.length < 2_000_000; i++) {
    const ch = src[i];
    if (ch === "{") {
      flush();
      stack.push({ skip });
      if (src[i + 1] === "\\" && src[i + 2] === "*") skip = true;
    } else if (ch === "}") {
      flush();
      skip = stack.pop()?.skip ?? false;
    } else if (ch === "\\") {
      const n = src[i + 1];
      if (n === "'") {
        const h = parseInt(src.slice(i + 2, i + 4), 16);
        if (!Number.isNaN(h)) bytes.push(h);
        i += 3;
      } else if (n === "\\" || n === "{" || n === "}") {
        flush();
        if (!skip) out += n;
        i += 1;
      } else if (n === "~") {
        flush();
        if (!skip) out += " ";
        i += 1;
      } else if (n === "-" || n === "_") {
        i += 1;
      } else if (n === "*") {
        i += 1;
      } else {
        const w = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
        if (!w) continue;
        flush();
        const word = w[1];
        const val = w[2] === undefined ? undefined : Number(w[2]);
        i += w[0].length - 1;
        if (RTF_SKIP.has(word)) skip = true;
        else if (word === "ansicpg" && val) cp = val;
        else if (word === "uc" && val !== undefined) uc = val;
        else if (word === "u" && val !== undefined) {
          if (!skip) out += String.fromCharCode(val < 0 ? val + 65536 : val);
          // skip the ANSI fallback characters
          let k = uc;
          while (k > 0 && i + 1 < src.length) {
            if (src[i + 1] === "\\" && src[i + 2] === "'") i += 4;
            else i += 1;
            k--;
          }
        } else if (!skip) {
          if (word === "par" || word === "line" || word === "sect" || word === "page" || word === "row") out += "\n";
          else if (word === "tab" || word === "cell") out += "\t";
          else if (word === "emdash") out += "—";
          else if (word === "endash") out += "–";
          else if (word === "lquote" || word === "rquote") out += "'";
          else if (word === "ldblquote" || word === "rdblquote") out += '"';
          else if (word === "bullet") out += "•";
        }
      }
    } else if (ch !== "\r" && ch !== "\n") {
      flush();
      if (!skip) out += ch;
    }
  }
  flush();
  return out;
}
