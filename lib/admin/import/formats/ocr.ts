// OCR (server only) with tesseract.js. Language data ships in the @tesseract.js-data/* packages, so it works fully offline.
// OCR is CPU/memory heavy: it is a feature flag (IMPORT_OCR=on|off; default ON locally, OFF on Vercel unless set to "on").
import { copyFile, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Locale } from "@/lib/types";
import { ImportError } from "../errors";
import { withOcrSlot } from "../limiter";

export const OCR_MAX_PAGES = 30;
export const OCR_TIMEOUT_MS = 150_000;
export const OCR_MIN_CONFIDENCE = 40;
const MAX_PIXELS = 40_000_000;

export function ocrEnabled(): boolean {
  const v = (process.env.IMPORT_OCR ?? "").trim().toLowerCase();
  if (["off", "0", "false", "no"].includes(v)) return false;
  if (["on", "1", "true", "yes"].includes(v)) return true;
  return !process.env.VERCEL; // serverless platforms have tight CPU/memory/time limits: opt in explicitly there
}

/** Tesseract language codes for the language picker (+ Uzbek Cyrillic switch). */
export function ocrLangs(lang: Locale | "auto", uzCyrillic: boolean): string {
  if (lang === "ru") return "rus+eng";
  if (lang === "en") return "eng";
  if (lang === "uz") return uzCyrillic ? "uzb_cyrl+rus" : "uzb+eng";
  return uzCyrillic ? "uzb_cyrl+rus+eng" : "eng+uzb+rus";
}

let langDir: Promise<string> | null = null;

/** Gathers the .traineddata.gz files of the language packages into one directory (tesseract wants a single langPath). */
function ensureLangDir(): Promise<string> {
  langDir ??= (async () => {
    if (process.env.OCR_LANG_PATH) return process.env.OCR_LANG_PATH;
    const dir = path.join(os.tmpdir(), "maktab-ocr-lang");
    await mkdir(dir, { recursive: true });
    for (const l of ["eng", "rus", "uzb", "uzb_cyrl"]) {
      const dst = path.join(dir, `${l}.traineddata.gz`);
      const exists = await stat(dst).then((s) => s.size > 1000).catch(() => false);
      if (exists) continue;
      const src = path.join(process.cwd(), "node_modules", "@tesseract.js-data", l, "4.0.0_best_int", `${l}.traineddata.gz`);
      const alt = path.join(process.cwd(), "node_modules", "@tesseract.js-data", l, "4.0.0", `${l}.traineddata.gz`);
      await copyFile(src, dst).catch(() => copyFile(alt, dst));
    }
    return dir;
  })();
  langDir.catch(() => (langDir = null));
  return langDir;
}

/** Width x height from the header (png / jpeg / gif / bmp) to refuse decompression bombs before decoding. */
export function imagePixels(b: Uint8Array): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return dv.getUint32(16) * dv.getUint32(20);
    if (b[0] === 0x47 && b[1] === 0x49) return dv.getUint16(6, true) * dv.getUint16(8, true);
    if (b[0] === 0x42 && b[1] === 0x4d) return Math.abs(dv.getInt32(18, true)) * Math.abs(dv.getInt32(22, true));
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return dv.getUint16(i + 5) * dv.getUint16(i + 7);
        i += 2 + dv.getUint16(i + 2);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Light pre-processing: upscale small pictures (OCR needs ~300 dpi) and flatten transparency. Falls back to the raw bytes. */
async function prepare(bytes: Uint8Array): Promise<Uint8Array> {
  const px = imagePixels(bytes);
  if (px !== null && px > MAX_PIXELS) throw new ImportError("image_failed");
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(Buffer.from(bytes));
    if (img.width * img.height > MAX_PIXELS) throw new ImportError("image_failed");
    const scale = img.width < 1400 ? Math.min(3, 1800 / img.width) : 1;
    const c = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Uint8Array(c.toBuffer("image/png"));
  } catch (e) {
    if (e instanceof ImportError) throw e;
    return bytes;
  }
}

export interface OcrResult {
  text: string;
  confidence: number;
}

/** Recognises text from images (one worker, sequentially). Throws ocr_* codes. */
export async function ocrImages(images: Uint8Array[], langs: string): Promise<OcrResult> {
  if (!ocrEnabled()) throw new ImportError("ocr_disabled", 501);
  return withOcrSlot(() => ocrImagesUnlimited(images, langs));
}

async function ocrImagesUnlimited(images: Uint8Array[], langs: string): Promise<OcrResult> {
  let worker: import("tesseract.js").Worker | null = null;
  const run = async (): Promise<OcrResult> => {
    const { createWorker } = await import("tesseract.js");
    const dir = await ensureLangDir();
    worker = await createWorker(langs, 1, { langPath: dir, gzip: true, cacheMethod: "none", logger: () => undefined });
    const texts: string[] = [];
    let conf = 0;
    let n = 0;
    for (const img of images.slice(0, OCR_MAX_PAGES)) {
      const prepared = await prepare(img);
      const { data } = await worker.recognize(Buffer.from(prepared));
      texts.push(data.text);
      if (data.text.replace(/\s/g, "").length > 5) {
        conf += data.confidence;
        n++;
      }
    }
    return { text: texts.join("\n"), confidence: n ? conf / n : 0 };
  };
  let timer: NodeJS.Timeout | undefined;
  try {
    const out = await Promise.race([
      run(),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new ImportError("ocr_timeout", 504)), OCR_TIMEOUT_MS);
      }),
    ]);
    const letters = (out.text.match(/\p{L}/gu) ?? []).length;
    if (letters < 15 || out.confidence < OCR_MIN_CONFIDENCE) throw new ImportError("ocr_low_confidence", 422);
    return out;
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("ocr_failed", 500);
  } finally {
    if (timer) clearTimeout(timer);
    const w = worker as import("tesseract.js").Worker | null;
    await w?.terminate().catch(() => undefined);
  }
}
