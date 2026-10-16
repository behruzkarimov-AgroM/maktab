// ZIP central-directory inspection (nothing is inflated by zipDirectory): entry-count / size / ratio guards, encryption and macro detection.
// verifyZipTruthful() then inflates every entry under a hard output cap and checks it against the declared size, so the declared sizes
// that every later consumer (JSZip, mammoth, xlsx) relies on can be trusted (a zip bomb with lying headers is rejected here).
import { inflateRawSync } from "node:zlib";
import { ImportError } from "../errors";

export const ZIP_MAX_ENTRIES = 500;
export const ZIP_MAX_TOTAL = 64 * 1024 * 1024;
export const ZIP_MAX_ENTRY = 40 * 1024 * 1024;

export interface ZipEntry {
  name: string;
  method: number;
  comp: number;
  uncomp: number;
  /** offset of the local file header */
  offset: number;
}

export interface ZipInfo {
  names: string[];
  sizes: Map<string, number>;
  encrypted: boolean;
  entries: ZipEntry[];
}

/** Reads the central directory. Throws ImportError("zip_bomb" | "not_docx"-style codes via `bad`). */
export function zipDirectory(b: Uint8Array, bad: "not_docx" | "bad_magic" = "bad_magic"): ZipInfo {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportError(bad);
  const entries = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  let off = dv.getUint32(eocd + 16, true);
  if (entries === 0xffff || off === 0xffffffff || cdSize === 0xffffffff) throw new ImportError("zip_bomb");
  if (entries > ZIP_MAX_ENTRIES) throw new ImportError("zip_bomb");
  if (off + cdSize > b.length) throw new ImportError(bad);
  const names: string[] = [];
  const sizes = new Map<string, number>();
  const list: ZipEntry[] = [];
  let total = 0;
  let encrypted = false;
  const td = new TextDecoder();
  for (let i = 0; i < entries; i++) {
    if (off + 46 > b.length || dv.getUint32(off, true) !== 0x02014b50) throw new ImportError(bad);
    const flags = dv.getUint16(off + 8, true);
    const method = dv.getUint16(off + 10, true);
    const localOffset = dv.getUint32(off + 42, true);
    const comp = dv.getUint32(off + 20, true);
    const uncomp = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    if (off + 46 + nameLen > b.length) throw new ImportError(bad);
    const name = td.decode(b.subarray(off + 46, off + 46 + nameLen));
    if (flags & 1) encrypted = true;
    if (uncomp > ZIP_MAX_ENTRY) throw new ImportError("zip_bomb");
    if (uncomp > 1024 * 1024 && comp > 0 && uncomp / comp > 150) throw new ImportError("zip_bomb");
    total += uncomp;
    if (total > ZIP_MAX_TOTAL) throw new ImportError("zip_bomb");
    names.push(name);
    sizes.set(name, uncomp);
    list.push({ name, method, comp, uncomp, offset: localOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return { names, sizes, encrypted, entries: list };
}

/**
 * Inflates every entry with a hard output limit and compares the real size with the declared one. Throws zip_bomb for lying sizes,
 * truncated/corrupt data or unsupported methods. Entry names are only ever used as lookup keys (nothing is written to disk), so path
 * traversal ("../") cannot escape anything; names containing it are additionally refused here.
 */
export function verifyZipTruthful(b: Uint8Array, info: ZipInfo): void {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let total = 0;
  for (const e of info.entries) {
    if (e.name.split(/[\\/]/).some((p) => p === "..") || e.name.includes("\0")) throw new ImportError("zip_bomb");
    if (e.name.endsWith("/") && e.uncomp === 0) continue;
    const o = e.offset;
    if (o + 30 > b.length || dv.getUint32(o, true) !== 0x04034b50) throw new ImportError("zip_bomb");
    const start = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true);
    if (start + e.comp > b.length) throw new ImportError("zip_bomb");
    const data = b.subarray(start, start + e.comp);
    total += e.uncomp;
    if (total > ZIP_MAX_TOTAL) throw new ImportError("zip_bomb");
    if (e.method === 0) {
      if (e.comp !== e.uncomp) throw new ImportError("zip_bomb");
    } else if (e.method === 8) {
      let out: Buffer;
      try {
        out = inflateRawSync(data, { maxOutputLength: e.uncomp + 1 });
      } catch {
        throw new ImportError("zip_bomb");
      }
      if (out.length !== e.uncomp) throw new ImportError("zip_bomb");
    } else throw new ImportError("zip_bomb");
  }
}

/** Content of the first stored "mimetype" entry (ODF / EPUB), without inflating anything. */
export function zipMimetype(b: Uint8Array): string {
  if (b.length < 60) return "";
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== 0x04034b50) return "";
  const method = dv.getUint16(8, true);
  const size = dv.getUint32(18, true);
  const nameLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  const name = new TextDecoder().decode(b.subarray(30, 30 + nameLen));
  if (name !== "mimetype" || method !== 0 || size > 200) return "";
  return new TextDecoder().decode(b.subarray(30 + nameLen + extraLen, 30 + nameLen + extraLen + size)).trim();
}

export const hasMacros = (names: string[]) => names.some((n) => /vbaproject\.bin$/i.test(n) || /^(?:word|xl|ppt)\/vba/i.test(n) || /^(?:Basic|Scripts)\//.test(n));
