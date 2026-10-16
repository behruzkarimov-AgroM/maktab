// Text decoding with encoding detection (UTF-8/16, windows-1251, koi8-r, windows-1252/latin1) so Cyrillic never turns into mojibake.

const cyr = (s: string) => (s.match(/[Ѐ-ӿ]/g) ?? []).length;
const lowerCyr = (s: string) => (s.match(/[а-яёўқғҳ]/g) ?? []).length;

function tryDecode(label: string, bytes: Uint8Array, fatal = false): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/** `hint`: charset label from an HTML <meta> / XML declaration, tried first when valid. */
export function decodeSmart(bytes: Uint8Array, hint?: string): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  const utf8 = tryDecode("utf-8", bytes, true);
  if (utf8 !== null) return { text: utf8, encoding: "utf-8" };
  if (hint) {
    const h = tryDecode(hint.trim().toLowerCase(), bytes);
    if (h !== null && !h.includes("�")) return { text: h, encoding: hint.toLowerCase() };
  }
  // single-byte candidates: pick the one that looks most like natural text
  const cands = ["windows-1251", "koi8-r", "windows-1252"]
    .map((enc) => ({ enc, text: tryDecode(enc, bytes) ?? "" }))
    .map((c) => {
      const n = cyr(c.text);
      const lower = lowerCyr(c.text);
      // natural Cyrillic text is mostly lower-case; a wrong code page yields capitals and rare letters
      const score = n > 8 ? (lower / n) * 100 + Math.min(n, 400) / 40 : c.enc === "windows-1252" ? 50 : 0;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
  const best = cands[0];
  return { text: best.text, encoding: best.enc };
}

/** Charset declared inside an HTML/XML document (first 2 KB). */
export function declaredCharset(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  return /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] ?? /<\?xml[^>]+encoding\s*=\s*["']([\w-]+)/i.exec(head)?.[1];
}
