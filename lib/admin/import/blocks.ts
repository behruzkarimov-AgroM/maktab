// Client-safe text/html -> block helpers (shared by the server extractors and the in-browser "manual builder").
import { cleanLine, tidyBold } from "./text";

export type Block = { t: "line"; text: string } | { t: "table"; rows: string[][] };

/* ------------------------------------------------------------------ html -> blocks */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

const LETTERS = "ABCDEFGH";
const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "br", "blockquote", "pre"]);

/** Converts mammoth's HTML into text lines (bold -> **x**) and tables. Lists get visible numbers/letters. */
export function htmlToBlocks(html: string, keepTabs = false): Block[] {
  // active content never becomes text: scripts, styles, templates and embedded objects are dropped before tokenising
  html = html.replace(/<(script|style|noscript|template|object|embed|iframe|svg)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const blocks: Block[] = [];
  const re =/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>|([^<]+)|</g;
  let buf = "";
  let boldDepth = 0;
  let globalNum = 0;
  let inTable = false;
  let rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  type ListCtx = { ordered: boolean; depth: number; idx: number; top: number[] | null };
  const lists: ListCtx[] = [];
  let pendingLi: { ctx: ListCtx } | null = null;

  const push = (text: string, li: ListCtx | null) => {
    if (!text) return;
    if (inTable) {
      cell += (cell ? " " : "") + text;
      return;
    }
    if (li) {
      if (!li.ordered) {
        blocks.push({ t: "line", text: `• ${text}` });
      } else if (li.depth >= 2) {
        blocks.push({ t: "line", text: `${LETTERS[Math.min(li.idx - 1, 7)]}) ${text}` });
      } else {
        li.top?.push(blocks.length);
        blocks.push({ t: "line", text });
      }
    } else {
      blocks.push({ t: "line", text });
    }
  };
  const flush = () => {
    const text = tidyBold(cleanLine(decodeEntities(buf), keepTabs));
    buf = "";
    if (!text) return;
    const li = pendingLi?.ctx ?? null;
    pendingLi = null;
    push(text, li);
  };
  const closeTopList = (ctx: ListCtx) => {
    const idxs = ctx.top ?? [];
    if (!idxs.length) return;
    const first = idxs[0];
    // previous non-list line that precedes this list
    let prev = "";
    for (let i = first - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.t === "line") {
        prev = b.text;
        break;
      }
    }
    const asOptions = idxs.length >= 2 && idxs.length <= 6 && /[?:_…]\s*$|\.{3}\s*$/.test(prev) && !/^\s*[\d]+[.)]/.test(prev) && !/(savollar|questions|вопросы|testlar)\s*:?$/i.test(prev);
    idxs.forEach((bi, k) => {
      const b = blocks[bi];
      if (b.t !== "line") return;
      b.text = asOptions ? `${LETTERS[k]}) ${b.text}` : `${++globalNum}. ${b.text}`;
    });
  };

  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[3] !== undefined) {
      buf += m[3];
      continue;
    }
    if (!m[2]) continue; // comment or stray "<"
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "strong" || tag === "b") {
      if (!closing) {
        boldDepth++;
        buf += "**";
      } else if (boldDepth > 0) {
        boldDepth--;
        buf += "**";
      }
      continue;
    }
    if (tag === "table") {
      flush();
      if (!closing) {
        inTable = true;
        rows = [];
      } else {
        if (row.length) rows.push(row);
        row = [];
        inTable = false;
        const filled = rows.filter((r) => r.some((c) => c.trim()));
        if (filled.length) blocks.push({ t: "table", rows: filled });
      }
      continue;
    }
    if (inTable && (tag === "tr" || tag === "td" || tag === "th")) {
      flush();
      if (tag === "tr") {
        if (closing || row.length) {
          if (row.length) rows.push(row);
          row = [];
        }
      } else if (closing) {
        row.push(tidyBold(cell).trim());
        cell = "";
      } else {
        cell = "";
      }
      continue;
    }
    if (tag === "ol" || tag === "ul") {
      flush();
      if (!closing) {
        const depth = lists.length + 1;
        lists.push({ ordered: tag === "ol", depth, idx: 0, top: depth === 1 && tag === "ol" ? [] : null });
      } else {
        const ctx = lists.pop();
        if (ctx && ctx.depth === 1 && ctx.ordered) closeTopList(ctx);
      }
      continue;
    }
    if (tag === "li") {
      flush();
      if (!closing) {
        const ctx = lists[lists.length - 1];
        if (ctx) {
          ctx.idx++;
          pendingLi = { ctx };
        }
      }
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush(); // a <br> inside a list item only prefixes its first line
      continue;
    }
  }
  flush();
  // unclosed top-level lists (malformed html)
  while (lists.length) {
    const ctx = lists.pop();
    if (ctx && ctx.depth === 1 && ctx.ordered) closeTopList(ctx);
  }
  return blocks;
}


export function textToBlocks(text: string, keepTabs = false): Block[] {
  const out: Block[] = [];
  for (const raw of text.split(/\r?\n|\u2028|\u2029/)) {
    // markdown style bold in .txt is kept as the same ** marker
    const t = tidyBold(cleanLine(raw, keepTabs));
    if (t) out.push({ t: "line", text: t });
  }
  return out;
}

