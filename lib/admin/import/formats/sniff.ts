// File type detection from CONTENT (magic bytes / structure). The extension is only a consistency check, never trusted.
import { ImportError } from "../errors";
import { MAX_FILE_BYTES } from "../types";
import { verifyZipTruthful, zipDirectory, zipMimetype, type ZipInfo } from "./zip";

export type DocType =
  | "pdf" | "docx" | "doc" | "xls" | "xlsx" | "odt" | "ods" | "odp" | "pptx" | "epub" | "zip" | "rtf" | "image"
  | "html" | "xml" | "json" | "md" | "csv" | "tsv" | "text";

const TEXT_TYPES: DocType[] = ["html", "xml", "json", "md", "csv", "tsv", "text"];
export const isTextType = (t: DocType) => TEXT_TYPES.includes(t);

const DENY = new Set(["exe", "dll", "bat", "cmd", "com", "scr", "msi", "vbs", "vbe", "ps1", "sh", "jar", "apk", "app", "docm", "xlsm", "pptm", "dotm", "xlam", "lnk", "iso", "dmg", "7z", "rar", "gz", "tgz", "ppt", "pps", "pages", "numbers", "key", "wps", "wpd"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp", "gif"]);
const TEXT_EXT: Record<string, DocType> = { txt: "text", text: "text", log: "text", md: "md", markdown: "md", csv: "csv", tsv: "tsv", html: "html", htm: "html", xhtml: "html", xml: "xml", json: "json" };
const BINARY_EXT: Record<string, DocType[]> = {
  pdf: ["pdf"], docx: ["docx"], doc: ["doc", "docx"], xlsx: ["xlsx"], xls: ["xls", "xlsx"], pptx: ["pptx"], odt: ["odt"], ods: ["ods"], odp: ["odp"], epub: ["epub"], zip: ["zip"], rtf: ["rtf"],
};

const at = (b: Uint8Array, sig: number[], off = 0) => sig.every((x, i) => b[off + i] === x);

export interface Sniffed {
  type: DocType;
  zip?: ZipInfo;
}

export function sniff(bytes: Uint8Array, filename: string): Sniffed {
  if (bytes.length === 0) throw new ImportError("empty_document");
  if (bytes.length > MAX_FILE_BYTES) throw new ImportError("file_too_large", 413);
  const ext = /\.([a-z0-9]+)$/i.exec(filename.trim())?.[1]?.toLowerCase() ?? "";
  if (DENY.has(ext)) {
    throw new ImportError(["docm", "xlsm", "pptm", "dotm", "xlam"].includes(ext) ? "macros_not_allowed" : "unsupported_type", 415);
  }
  let type: DocType | null = null;
  let zip: ZipInfo | undefined;

  const head = bytes.subarray(0, 1024);
  let hasPdf = false;
  for (let i = 0; i + 5 <= head.length; i++) if (at(head, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) hasPdf = true;
  if (hasPdf) type = "pdf";
  else if (at(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    zip = zipDirectory(bytes, "bad_magic");
    verifyZipTruthful(bytes, zip);
    const n = zip.names;
    const mime = zipMimetype(bytes);
    if (n.includes("word/document.xml")) type = "docx";
    else if (n.includes("xl/workbook.xml")) type = "xlsx";
    else if (n.includes("ppt/presentation.xml")) type = "pptx";
    else if (mime === "application/vnd.oasis.opendocument.text") type = "odt";
    else if (mime === "application/vnd.oasis.opendocument.spreadsheet") type = "ods";
    else if (mime === "application/vnd.oasis.opendocument.presentation") type = "odp";
    else if (mime === "application/epub+zip") type = "epub";
    else type = "zip";
  } else if (at(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (["ppt", "pps"].includes(ext)) throw new ImportError("unsupported_type", 415);
    type = ext === "xls" ? "xls" : "doc";
  } else if (at(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66])) type = "rtf";
  else if (
    at(bytes, [0x89, 0x50, 0x4e, 0x47]) || at(bytes, [0xff, 0xd8, 0xff]) || at(bytes, [0x47, 0x49, 0x46, 0x38]) || at(bytes, [0x42, 0x4d]) ||
    at(bytes, [0x49, 0x49, 0x2a, 0x00]) || at(bytes, [0x4d, 0x4d, 0x00, 0x2a]) || (at(bytes, [0x52, 0x49, 0x46, 0x46]) && at(bytes, [0x57, 0x45, 0x42, 0x50], 8))
  ) {
    // "BM" is also a plausible text start: require a sane BMP header
    type = at(bytes, [0x42, 0x4d]) && !(bytes.length > 30 && bytes[6] === 0 && bytes[7] === 0) ? null : "image";
  }
  if (!type) {
    // executables / archives we do not read
    if (at(bytes, [0x4d, 0x5a]) || at(bytes, [0x7f, 0x45, 0x4c, 0x46]) || at(bytes, [0x1f, 0x8b]) || at(bytes, [0x37, 0x7a, 0xbc, 0xaf]) || at(bytes, [0x52, 0x61, 0x72, 0x21]) || at(bytes, [0x25, 0x21])) {
      throw new ImportError("unsupported_type", 415);
    }
    const bom16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
    const binary = !bom16 && bytes.subarray(0, 4096).includes(0);
    if (binary) throw new ImportError(ext in TEXT_EXT || ext in BINARY_EXT || IMAGE_EXT.has(ext) ? "bad_magic" : "unsupported_type", ext ? 400 : 415);
    const start = new TextDecoder("latin1").decode(bytes.subarray(0, 300)).trimStart().toLowerCase();
    const t: DocType = TEXT_EXT[ext] ?? (/^<(?:!doctype html|html|head|body)/.test(start) ? "html" : /^<\?xml/.test(start) ? "xml" : "text");
    type = t;
  }
  // consistency with the extension (when it is one we know)
  if (ext in BINARY_EXT && !BINARY_EXT[ext].includes(type)) throw new ImportError("bad_magic");
  if (IMAGE_EXT.has(ext) && type !== "image") throw new ImportError("bad_magic");
  if (ext in TEXT_EXT && !isTextType(type)) throw new ImportError("bad_magic");
  if (!ext || (!(ext in BINARY_EXT) && !(ext in TEXT_EXT) && !IMAGE_EXT.has(ext))) {
    // unknown extension: content decides, but "zip" and plain text of unknown origin are fine only when they parse
  }
  return { type, zip };
}
