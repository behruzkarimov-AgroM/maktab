// Generic fallback: when the strict parsers find no structure, guess one from layout and rewrite the text into the
// canonical "1. question / A) option / Javob: X" format that the normal parsers understand. Pure and client-safe
// (it also powers the "re-parse extracted text" manual builder in the dialog).
import { plain } from "./text";

const LETTERS = "ABCDEFGH";
const STEM_END = /[?:…]\s*$|\.{3}\s*$|_{3,}\s*$/;
const NUMBERED = /^\s*(?:savol|вопрос|question|q)?\s*\d{1,3}\s*[.):-]\s+/i;
const OPT_PREFIX = /^\s*(?:[•·▪●○◦▫■□‣\-–—*+]|[☐☑✓✔]|[([]?[A-Za-zА-Яа-я0-9]{1,2}[)\].])\s+/;
const MARK_START = /^\s*(?:[*✓✔☑+]\s*|\*\*)/;
const MARK_END = /\s*(?:\*|✓|✔|\(\+\)|\(to'g'ri\)|\(correct\)|\(верно\))\s*$/i;

interface Q {
  stem: string;
  opts: string[];
  correct: number;
}

function cleanOpt(raw: string): { text: string; marked: boolean } {
  const bold = /^\*\*.+\*\*$/.test(raw.trim());
  let marked = bold || MARK_START.test(raw) || MARK_END.test(raw);
  let t = raw.replace(MARK_START, "").replace(MARK_END, "").replace(OPT_PREFIX, "").trim();
  t = plain(t).replace(/^[*✓✔☑+]\s*/, "").trim();
  if (/^[*✓✔☑+]/.test(raw.trim().replace(OPT_PREFIX, ""))) marked = true;
  return { text: t, marked };
}

const isStem = (l: string) => STEM_END.test(l) || NUMBERED.test(l);
const looksOpt = (l: string) => l.length <= 160 && !STEM_END.test(l);

function groupToQ(group: string[]): Q | null {
  if (group.length < 3) return null;
  const stem = plain(group[0]).replace(NUMBERED, "").trim();
  const opts: string[] = [];
  let correct = -1;
  for (const l of group.slice(1, 9)) {
    const o = cleanOpt(l);
    if (!o.text) continue;
    if (o.marked && correct < 0) correct = opts.length;
    opts.push(o.text);
  }
  return opts.length >= 2 && stem ? { stem, opts, correct } : null;
}

/** Returns canonical lines, or [] when nothing question-like can be found. */
export function genericCanonical(text: string): string[] {
  const raw = text.split(/\r?\n/).map((l) => l.trim());
  const qs: Q[] = [];
  const hasBlank = raw.some((l, i) => !l && i > 0 && i < raw.length - 1);
  if (hasBlank) {
    // blank-line separated blocks: first line = question, following lines = options
    const groups: string[][] = [[]];
    for (const l of raw) {
      if (!l) {
        if (groups[groups.length - 1].length) groups.push([]);
      } else groups[groups.length - 1].push(l);
    }
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const q = groupToQ(g);
      if (q) qs.push(q);
      else if (g.length === 1 && isStem(g[0]) && groups[i + 1] && groups[i + 1].length >= 2 && groups[i + 1].every(looksOpt)) {
        const q2 = groupToQ([g[0], ...groups[i + 1]]);
        if (q2) {
          qs.push(q2);
          i++;
        }
      }
    }
  }
  if (!qs.length) {
    // no blank lines: a stem-like line followed by 2..8 short lines
    const lines = raw.filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (!isStem(lines[i])) continue;
      const g = [lines[i]];
      let j = i + 1;
      while (j < lines.length && g.length < 9 && !isStem(lines[j]) && looksOpt(lines[j])) g.push(lines[j++]);
      const q = groupToQ(g);
      if (q) {
        qs.push(q);
        i = j - 1;
      }
    }
  }
  const out: string[] = [];
  qs.slice(0, 300).forEach((q, n) => {
    out.push(`${n + 1}. ${q.stem}`);
    q.opts.forEach((o, i) => out.push(`${LETTERS[i]}) ${o}`));
    if (q.correct >= 0) out.push(`Javob: ${LETTERS[q.correct]}`);
  });
  return out;
}
