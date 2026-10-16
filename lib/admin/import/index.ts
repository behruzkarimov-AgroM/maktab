// Server entry point of the document import: bytes -> validated, structured PREVIEW draft (nothing is saved here).
import JSZip from "jszip";
import { aiAvailable, structureWithAI } from "./ai";
import { extractDocument, ImportError } from "./extract";
import { sniff } from "./formats/sniff";
import { verifyZipTruthful, zipDirectory } from "./formats/zip";
import { parseAny } from "./pipeline";
import { itemsOf, MAX_FILE_BYTES, type GameTypeChoice, type ImportKind, type ImportMeta, type ImportOk, type LangChoice } from "./types";

export { ImportError } from "./extract";

export interface ImportOpts {
  /** Uzbek Cyrillic -> Latin (also selects the Cyrillic OCR model) */
  translit?: boolean;
  /** use the optional AI structuring (extracted text only is sent out) */
  ai?: boolean;
  fetchImpl?: typeof fetch;
}

export type BatchEntry = ({ name: string; ok: true } & Pick<ImportOk, "draft" | "meta">) | { name: string; ok: false; error: string };

const MAX_ZIP_FILES = 20;

export async function importDocument(bytes: Uint8Array, filename: string, kind: ImportKind, lang: LangChoice, gameType: GameTypeChoice = "auto", opts: ImportOpts = {}): Promise<ImportOk> {
  const doc = await extractDocument(bytes, filename, kind, { lang, translit: opts.translit });
  let parsed: { draft: ImportOk["draft"]; detectedLang: ImportMeta["detectedLang"]; langs: ImportMeta["langs"] } | null = null;
  let parser: ImportMeta["parser"] = "rules";
  if (opts.ai) {
    if (!aiAvailable()) throw new ImportError("ai_unavailable", 501);
    const r = await structureWithAI(doc.rawText, { kind, lang, gameType, filename }, opts.fetchImpl);
    parsed = r;
    parser = "ai";
  } else {
    const r = parseAny(doc.blocks, doc.rawText, { kind, lang, gameType, filename });
    if (r) {
      parsed = r;
      parser = r.parser;
    }
  }
  if (!parsed || itemsOf(parsed.draft).length === 0) throw new ImportError("no_questions", 422, { text: doc.rawText.slice(0, 100_000), format: doc.format });
  const meta: ImportMeta = {
    filename,
    format: doc.format,
    units: doc.units,
    ocr: doc.ocr,
    ocrConfidence: doc.ocrConfidence,
    parser,
    text: doc.rawText.slice(0, 100_000),
    uzCyrillic: doc.uzCyrillic,
    transliterated: doc.transliterated,
    detectedLang: parsed.detectedLang,
    langs: parsed.langs,
    chars: doc.chars,
  };
  return { ok: true, draft: parsed.draft, meta };
}

/** True when the bytes are a plain archive (not docx/xlsx/pptx/odf/epub): the caller expands it with importZip. */
export function isArchive(bytes: Uint8Array, filename: string): boolean {
  try {
    return sniff(bytes, filename).type === "zip";
  } catch {
    return false;
  }
}

/** A .zip with several documents: every entry is imported on its own, one bad entry never fails the others. */
export async function importZip(bytes: Uint8Array, kind: ImportKind, lang: LangChoice, gameType: GameTypeChoice, opts: ImportOpts = {}): Promise<BatchEntry[]> {
  const info = zipDirectory(bytes, "bad_magic");
  if (info.encrypted) throw new ImportError("encrypted_file");
  verifyZipTruthful(bytes, info);
  const names = info.names.filter((n) => !n.endsWith("/") && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(n) && !n.split("/").some((p) => p === ".." || p.startsWith(".")));
  if (names.length === 0) throw new ImportError("empty_document");
  if (names.length > MAX_ZIP_FILES) throw new ImportError("too_many_entries", 413);
  const zip = await JSZip.loadAsync(bytes);
  const out: BatchEntry[] = [];
  const deadline = Date.now() + 240_000;
  for (const name of names) {
    const base = name.split("/").pop() ?? name;
    try {
      if (Date.now() > deadline) throw new ImportError("ocr_timeout", 504);
      if ((info.sizes.get(name) ?? 0) > MAX_FILE_BYTES) throw new ImportError("file_too_large", 413);
      const data = await zip.file(name)!.async("uint8array");
      if (sniff(data, base).type === "zip") throw new ImportError("unsupported_type", 415); // no nested archives
      const r = await importDocument(data, base, kind, lang, gameType, opts);
      out.push({ name: base, ok: true, draft: r.draft, meta: r.meta });
    } catch (e) {
      out.push({ name: base, ok: false, error: e instanceof ImportError ? e.code : "server_error" });
    }
  }
  return out;
}