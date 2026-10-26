// Minimal XML parser + Office Math (OMML) -> linear text converter.
// No dependencies. Used by extract-docx.mjs.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENT[e] ?? m;
  });
}

/** Parse XML into {tag, attrs, children:(node|string)[]}. */
export function parseXml(xml) {
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.children.push(m[1]); continue; }
    if (m[6] !== undefined) { top.children.push(decode(m[6])); continue; }
    if (m[3] === undefined) continue; // comment / PI
    if (m[2]) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
    const node = { tag: m[3], attrs, children: [] };
    top.children.push(node);
    if (!m[5]) stack.push(node);
  }
  return root;
}

export const kids = (n) => n.children.filter((c) => typeof c !== "string");
export const kid = (n, tag) => kids(n).find((c) => c.tag === tag);
export const kidsOf = (n, tag) => kids(n).filter((c) => c.tag === tag);
export function find(n, tag, out = []) {
  for (const c of kids(n)) { if (c.tag === tag) out.push(c); find(c, tag, out); }
  return out;
}

// ---------------- OMML ----------------
const norm = (s) =>
  s.replace(/[−‒–]/g, "-").replace(/[∙⋅]/g, "·").replace(/ /g, " ");

function atomic(s) {
  s = s.trim();
  if (/^[\w.,·]+$/u.test(s)) return true;
  if (s[0] === "(" && s.at(-1) === ")") {
    let d = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") d++;
      else if (s[i] === ")") { d--; if (d === 0 && i < s.length - 1) return false; }
    }
    return d === 0;
  }
  return false;
}
const wrap = (s) => (atomic(s) ? s.trim() : "(" + s.trim() + ")");
const val = (n, tag, def) => {
  const p = n && kid(n, tag);
  if (!p) return def;
  return p.attrs["m:val"] ?? def;
};
const sub = (n, tag) => {
  const c = kid(n, tag);
  return c ? seq(c) : "";
};

function seq(n) {
  return kids(n)
    .filter((c) => !/Pr$/.test(c.tag) && c.tag !== "m:argPr")
    .map(conv)
    .join("");
}

function conv(n) {
  switch (n.tag) {
    case "m:r": {
      let t = "";
      for (const c of kids(n)) if (c.tag === "m:t" || c.tag === "w:t") t += c.children.filter((x) => typeof x === "string").join("");
      return norm(t);
    }
    case "m:f": {
      const nu = sub(n, "m:num"), de = sub(n, "m:den");
      return "(" + wrap(nu) + "/" + wrap(de) + ")";
    }
    case "m:sSup": return wrap(sub(n, "m:e")) + "^" + wrap(sub(n, "m:sup"));
    case "m:sSub": return wrap(sub(n, "m:e")) + "_" + wrap(sub(n, "m:sub"));
    case "m:sSubSup": return wrap(sub(n, "m:e")) + "_" + wrap(sub(n, "m:sub")) + "^" + wrap(sub(n, "m:sup"));
    case "m:sPre": return "_" + wrap(sub(n, "m:sub")) + "^" + wrap(sub(n, "m:sup")) + wrap(sub(n, "m:e"));
    case "m:rad": {
      const deg = sub(n, "m:deg").trim();
      const e = sub(n, "m:e");
      return deg && deg !== "2" ? `root(${deg}, ${e})` : `sqrt(${e})`;
    }
    case "m:d": {
      const pr = kid(n, "m:dPr");
      const beg = val(pr, "m:begChr", "("), end = val(pr, "m:endChr", ")"), sep = val(pr, "m:sepChr", "|");
      const parts = kidsOf(n, "m:e").map(seq);
      if (beg === "(" && end === ")" && parts.length === 1 && parts[0].trim()[0] === "(" && atomic(parts[0]) && /^\(.*\)$/.test(parts[0].trim())) return parts[0];
      return beg + parts.join(sep) + end;
    }
    case "m:nary": {
      const pr = kid(n, "m:naryPr");
      const chr = val(pr, "m:chr", "∫");
      const name = { "∑": "sum", "∏": "prod", "∫": "int", "∬": "iint", "∮": "oint" }[chr] ?? chr;
      const lo = sub(n, "m:sub"), hi = sub(n, "m:sup");
      return name + (lo ? "_" + wrap(lo) : "") + (hi ? "^" + wrap(hi) : "") + " " + wrap(sub(n, "m:e"));
    }
    case "m:func": return sub(n, "m:fName").trim() + wrap(sub(n, "m:e"));
    case "m:bar": return "overline" + wrap(sub(n, "m:e"));
    case "m:acc": return wrap(sub(n, "m:e")) + val(kid(n, "m:accPr"), "m:chr", "̂");
    case "m:limLow": return wrap(sub(n, "m:e")) + "_" + wrap(sub(n, "m:lim"));
    case "m:limUpp": return wrap(sub(n, "m:e")) + "^" + wrap(sub(n, "m:lim"));
    case "m:eqArr": return kidsOf(n, "m:e").map(seq).join("; ");
    case "m:m":
      return "[" + kidsOf(n, "m:mr").map((r) => "[" + kidsOf(r, "m:e").map(seq).join(", ") + "]").join("; ") + "]";
    case "m:groupChr": return seq(n);
    default: return seq(n);
  }
}

/** Convert an m:oMath node to compact linear text with sensible operator spacing. */
export function ommlToText(node) {
  let t = seq(node);
  t = t.replace(/\s*([+=×÷·<>≤≥≠])\s*/g, " $1 ");
  t = t.replace(/([\w)\]])\s*-\s*(?=[\w(])/g, "$1 - ");
  t = t.replace(/\s*:\s*(?=[\w(])/g, " : ");
  return t.replace(/\s+/g, " ").trim();
}
