// Extract questions (no answer keys) from the grade 2-5 Word test files into JSON.
// Usage: node scripts/content/extract-docx.mjs [inputDir]
//   inputDir defaults to %TEMP%/tests-in (c2.docx .. c5.docx)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { parseXml, kids, kid, find, ommlToText } from "./omml.mjs";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "content", "extracted");
const MEDIA = path.join(OUT, "media");
const IN = process.argv[2] || path.join(process.env.TEMP || os.tmpdir(), "tests-in");

const FILES = [
  { grade: 2, file: "c2.docx", source: "2-sinf Toshkent 1.docx" },
  { grade: 3, file: "c3.docx", source: "3-sinf Toshkent 1.docx" },
  { grade: 4, file: "c4.docx", source: "4-sinf.docx" },
  { grade: 5, file: "c5.docx", source: "5-sinf Toshkent 1.docx" },
];

// Marker characters (private use) embedded in the text stream.
const FIG_O = "\uE003", FIG_C = "\uE004", EQ_O = "\uE005", EQ_C = "\uE006", SEC_O = "\uE001", SEC_C = "\uE002";

const FIGURE_WORDS = /shakl|rasm\b|rasmda|chizma|namuna|jadval|diagramma|qora rangli|picture|figure|quyida berilgan/i;

// Manual overrides after visual review of the figures: { grade: { no: {needsFigure, note} } }
const OVERRIDES = {};

// ---------------------------------------------------------------- text helpers
function normText(s) {
  return s
    .replace(/[\uFEFF\u200B\u200C\u200D\u2060]/g, "")
    .replace(/[\u00A0\u2007\u2009\u202F]/g, " ")
    .replace(/[\u2018\u2019\u02BC\u02BB\u02B9\u0060\u00B4\u2032]/g, "'")
    .replace(/[\u2212]/g, "-")
    .replace(/[ \t\r\f\v]+/g, " ");
}
// Cyrillic homoglyph option labels -> Latin (only when used as "X)" labels)
function fixLabels(s) {
  const map = { "\u0410": "A", "\u0412": "B", "\u0421": "C", "\u0414": "D", "\u0415": "E", "\u0430": "A", "\u0432": "B", "\u0441": "C", "\u0435": "E" };
  return s.replace(/(?<![\p{L}\p{N}])([\u0410\u0412\u0421\u0414\u0415\u0430\u0432\u0441\u0435])(?=\s*\))/gu, (m, c) => map[c]);
}

// ---------------------------------------------------------------- docx walking
async function loadDocx(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const doc = parseXml(await zip.file("word/document.xml").async("string"));
  const relsXml = zip.file("word/_rels/document.xml.rels");
  const rels = {};
  if (relsXml) {
    for (const r of find(parseXml(await relsXml.async("string")), "Relationship")) rels[r.attrs.Id] = r.attrs.Target;
  }
  return { zip, doc, rels };
}

function makeCtx(zip, rels) {
  return { zip, rels, figures: [], equations: 0 };
}

function analyzeFigure(node, ctx) {
  const media = [];
  for (const b of find(node, "a:blip")) {
    const id = b.attrs["r:embed"] || b.attrs["r:link"];
    if (id && ctx.rels[id]) media.push(ctx.rels[id]);
  }
  for (const b of find(node, "v:imagedata")) {
    const id = b.attrs["r:id"];
    if (id && ctx.rels[id]) media.push(ctx.rels[id]);
  }
  const texts = [];
  for (const tb of find(node, "w:txbxContent")) {
    const sub = { ...ctx, figures: [] };
    const t = kids(tb).map((p) => walkInline(p, sub)).join(" ").replace(/\s+/g, " ").trim();
    if (t) texts.push(t);
  }
  const fig = { media: [...new Set(media)], texts, kind: media.length ? "image" : "shape" };
  ctx.figures.push(fig);
  return FIG_O + (ctx.figures.length - 1) + FIG_C;
}

function runFormat(r) {
  const va = kid(r, "w:rPr") && kid(kid(r, "w:rPr"), "w:vertAlign");
  return va ? va.attrs["w:val"] : "";
}

function walkInline(n, ctx) {
  if (typeof n === "string") return "";
  switch (n.tag) {
    case "w:t": return n.children.filter((x) => typeof x === "string").join("");
    case "w:tab": return "\t";
    case "w:br": case "w:cr": return n.attrs["w:type"] === "page" ? "\n" : " ";
    case "w:noBreakHyphen": return "-";
    case "w:sym": return n.attrs["w:char"] ? String.fromCharCode(parseInt(n.attrs["w:char"], 16) & 0xff) : "";
    case "w:drawing": case "w:pict": case "w:object": return analyzeFigure(n, ctx);
    case "mc:AlternateContent": {
      const ch = kid(n, "mc:Choice") || kid(n, "mc:Fallback");
      return ch ? analyzeFigure(ch, ctx) : "";
    }
    case "m:oMathPara": return kids(n).map((c) => walkInline(c, ctx)).join(" ");
    case "m:oMath": {
      const t = ommlToText(n);
      ctx.equations++;
      return " " + EQ_O + t + EQ_C + " ";
    }
    case "w:r": {
      const fmt = runFormat(n);
      const t = kids(n).filter((c) => c.tag !== "w:rPr").map((c) => walkInline(c, ctx)).join("");
      if (fmt === "superscript" && t.trim()) return "^" + t;
      if (fmt === "subscript" && t.trim()) return "_" + t;
      return t;
    }
    case "w:pPr": case "w:rPr": case "w:del": case "w:instrText": case "w:delText": case "w:proofErr": case "w:bookmarkStart":
    case "w:bookmarkEnd": case "w:txbxContent": case "w:footnoteReference": case "w:lastRenderedPageBreak":
      return "";
    default:
      return kids(n).map((c) => walkInline(c, ctx)).join("");
  }
}

/** Return ordered list of paragraph strings (with markers) from the document body. */
function bodyParagraphs(doc, ctx) {
  const body = find(doc, "w:body")[0];
  const out = [];
  const walkBlock = (n) => {
    if (n.tag === "w:p") out.push(walkInline(n, ctx));
    else if (n.tag === "w:tbl") {
      for (const tr of kids(n).filter((x) => x.tag === "w:tr"))
        for (const tc of kids(tr).filter((x) => x.tag === "w:tc")) for (const c of kids(tc)) walkBlock(c);
    } else if (n.tag === "w:sdt") {
      const c = kid(n, "w:sdtContent");
      if (c) kids(c).forEach(walkBlock);
    } else if (n.tag === "w:sectPr") {
      /* ignore */
    }
  };
  kids(body).forEach(walkBlock);
  return out;
}

// ---------------------------------------------------------------- question splitting
const HEADINGS = [
  { re: /^ingliz tili$/i, section: "english" },
  { re: /^tanqidiy fikrlash.*$/i, section: "logic" },
  { re: /^(matematika|mantiq)$/i, section: (m) => (/mantiq/i.test(m) ? "logic" : "math") },
];

function buildStream(paras) {
  const lines = [];
  for (const raw of paras) {
    const t = normText(raw).replace(/\t/g, " ");
    const plain = t.replace(new RegExp(`[${FIG_O}${FIG_C}${EQ_O}${EQ_C}]`, "g"), "").replace(/\d+(?=\uE004)/g, "").trim();
    if (!plain && !/[\uE003\uE005]/.test(t)) continue;
    if (/^\d+\s*-\s*sinf$/i.test(plain)) continue; // stray page header
    let head = null;
    for (const h of HEADINGS) if (h.re.test(plain)) head = typeof h.section === "function" ? h.section(plain) : h.section;
    if (head && !/[\uE003\uE005]/.test(t)) { lines.push(SEC_O + head + SEC_C); continue; }
    lines.push(t.trim());
  }
  return lines;
}

function findStart(S, k, from) {
  const num = String(k);
  const a = new RegExp(`(?:^|\\n)[ \\t]*(${num})(?!\\d)[ \\t]*[.)\u2026][ \\t]*`, "g");
  const b = new RegExp(`(?<=[.!?\u201D"'\\u2019)])[ \\t]*(${num})(?!\\d)[ \\t]*\\.[ \\t]*(?=[A-Z\u0410-\u042F\u201C"'])`, "g");
  let best = null;
  for (const re of [a, b]) {
    re.lastIndex = from;
    const m = re.exec(S);
    if (m && (!best || m.index < best.index)) best = { index: m.index, end: m.index + m[0].length };
  }
  return best;
}

function splitQuestions(S) {
  const starts = [];
  const warnings = [];
  let pos = 0, k = 1;
  while (true) {
    let m = findStart(S, k, pos), kk = k;
    if (!m) {
      for (const skip of [1, 2]) {
        const mm = findStart(S, k + skip, pos);
        if (mm) { m = mm; kk = k + skip; warnings.push(`Raqamlashda tushib qolgan: ${Array.from({ length: skip }, (_, i) => k + i).join(", ")}`); break; }
      }
    }
    if (!m) break;
    starts.push({ no: kk, index: m.index, bodyStart: m.end });
    pos = m.end;
    k = kk + 1;
  }
  return { starts, warnings };
}

function parseOptions(text) {
  // text: question chunk (normalised, labels already fixed)
  const labelRe = /(?<![\p{L}\p{N}])([A-E])\s*\)/gu;
  const found = [...text.matchAll(labelRe)].map((m) => ({ id: m[1], index: m.index, end: m.index + m[0].length }));
  const As = found.filter((f) => f.id === "A");
  for (let i = As.length - 1; i >= 0; i--) {
    const a = As[i];
    const after = found.filter((f) => f.index > a.index);
    const pick = [a];
    let ok = true;
    for (const id of ["B", "C", "D", "E"]) {
      const f = after.find((x) => x.id === id);
      if (f) pick.push(f);
      else if (id !== "E") { ok = false; break; }
    }
    if (!ok) continue;
    pick.sort((x, y) => x.index - y.index);
    const options = pick.map((p, j) => ({
      id: p.id,
      raw: text.slice(p.end, j + 1 < pick.length ? pick[j + 1].index : text.length),
    }));
    return { stemRaw: text.slice(0, a.index), options };
  }
  return { stemRaw: text, options: [] };
}

function cleanLines(s) {
  // join lines: new line only when it starts a sub-list item
  const parts = s.split("\n").map((x) => x.trim()).filter(Boolean);
  let out = "";
  for (const p of parts) {
    if (!out) out = p;
    else out += (/^(\d+[.)]|[A-E]\))/.test(p) ? "\n" : " ") + p;
  }
  return out;
}

function stripMarkers(s) {
  return s
    .replace(new RegExp(`${EQ_C}\\s+([,.;?!])`, "g"), `${EQ_C}$1`)
    .replace(new RegExp(`${FIG_O}\\d+${FIG_C}`, "g"), "")
    .replace(new RegExp(`[${EQ_O}${EQ_C}]`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function tidy(s) {
  return s.replace(/\s+/g, " ").replace(/^[\s,;]+|[\s,;]+$/g, "").trim();
}

function guessSection(current, stem) {
  return current;
}

// ---------------------------------------------------------------- main
function saveMedia(zip, target, outName) {
  const entry = zip.file("word/" + target.replace(/^\/?(word\/)?/, ""));
  return entry;
}

function emfToPng(src, dst) {
  const ps = `Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Image]::FromFile('${src}'); $w=[int]($i.Width*3); $h=[int]($i.Height*3); $b=New-Object System.Drawing.Bitmap $w,$h; $g=[System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::White); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($i,0,0,$w,$h); $b.Save('${dst}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $i.Dispose()`;
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" });
  return r.status === 0 && fs.existsSync(dst);
}

async function processFile({ grade, file, source }) {
  const { zip, doc, rels } = await loadDocx(path.join(IN, file));
  const ctx = makeCtx(zip, rels);
  const paras = bodyParagraphs(doc, ctx);
  const lines = buildStream(paras);
  const S = fixLabels(lines.join("\n"));
  const { starts, warnings: fileWarnings } = splitQuestions(S);
  const items = [];
  let section = "math";
  // section tokens before first question
  const pre = S.slice(0, starts[0]?.index ?? 0);
  for (const m of pre.matchAll(new RegExp(`${SEC_O}(\\w+)${SEC_C}`, "g"))) section = m[1];

  for (let i = 0; i < starts.length; i++) {
    const st = starts[i];
    const chunkEnd = i + 1 < starts.length ? starts[i + 1].index : S.length;
    const chunk = S.slice(st.bodyStart, chunkEnd);
    const startSection = section;
    for (const m of chunk.matchAll(new RegExp(`${SEC_O}(\\w+)${SEC_C}`, "g"))) section = m[1];
    const chunkClean = chunk.replace(new RegExp(`${SEC_O}\\w+${SEC_C}`, "g"), "");
    const { stemRaw, options } = parseOptions(chunkClean);
    const warnings = [];
    const figIdx = (s) => [...s.matchAll(new RegExp(`${FIG_O}(\\d+)${FIG_C}`, "g"))].map((m) => +m[1]);
    const stemFigs = figIdx(stemRaw);
    const optFigs = options.flatMap((o) => figIdx(o.raw));
    const allFigs = [...stemFigs, ...optFigs, ...(options.length ? [] : [])];
    // figures located after the last option label belong to the last option text; keep them as question figures
    const hasEq = new RegExp(EQ_O).test(chunkClean);
    const stem = stripMarkers(cleanLines(stemRaw));
    options.sort((x, y) => x.id.localeCompare(y.id)); // some files lay options out A, C / B, D
    const opts = options.map((o) => ({
      id: o.id,
      text: stripMarkers(cleanLines(o.raw)),
      ...(figIdx(o.raw).length ? { _figs: figIdx(o.raw) } : {}),
    }));
    for (const m of chunkClean.matchAll(new RegExp(`${EQ_O}([^${EQ_C}]*)${EQ_C}`, "g"))) {
      const o = (m[1].match(/\(/g) || []).length, c = (m[1].match(/\)/g) || []).length;
      if (o !== c) warnings.push(`Formulada qavslar muvozanatsiz (manba hujjatda ham shunday): ${m[1]}`);
    }
    if (!options.length) warnings.push("Variantlar (A-D) topilmadi");
    else if (opts.length < 4) warnings.push(`Faqat ${opts.length} ta variant topildi`);
    for (const o of opts) if (!o.text && !o._figs) warnings.push(`Variant ${o.id} bo'sh (matn/formula/rasm yo'q)`);

    // figures
    const figs = allFigs.map((ix) => ctx.figures[ix]);
    const q = String(st.no).padStart(2, "0");
    const figureImages = [];
    let figureKind = null;
    const figureText = [];
    figs.forEach((f) => {
      if (f.texts.length) figureText.push(f.texts.join(" | "));
      if (f.kind === "image") figureKind = "image";
      else if (!figureKind) figureKind = "shape";
    });
    let n = 0;
    for (const f of figs) {
      for (const target of f.media) {
        const entry = zip.file("word/" + target.replace(/^\/?(word\/)?/, ""));
        if (!entry) { warnings.push(`Media topilmadi: ${target}`); continue; }
        n++;
        const ext = path.extname(target).toLowerCase();
        const base = `g${grade}-q${q}${n > 1 ? "-" + n : ""}`;
        fs.mkdirSync(MEDIA, { recursive: true });
        const buf = await entry.async("nodebuffer");
        const orig = path.join(MEDIA, base + ext);
        fs.writeFileSync(orig, buf);
        let rel = "content/extracted/media/" + base + ext;
        if (ext === ".emf" || ext === ".wmf") {
          const png = path.join(MEDIA, base + ".png");
          if (emfToPng(orig, png)) rel = "content/extracted/media/" + base + ".png";
          else warnings.push("EMF -> PNG konvertatsiya bo'lmadi");
        }
        figureImages.push(rel);
      }
    }
    const hasFigure = figs.length > 0;
    const emptyOptNoEq = opts.some((o) => !o.text && !o._figs) && !hasEq;
    let needsFigure = false;
    const reasons = [];
    if (FIGURE_WORDS.test(stem)) { needsFigure = true; reasons.push("savol matni shakl/rasmga tayanadi"); }
    if (opts.some((o) => o._figs) ) { needsFigure = true; reasons.push("variantlar rasm ko'rinishida"); }
    if (emptyOptNoEq) { needsFigure = true; reasons.push("variantlar matni bo'sh (rasm bo'lishi mumkin)"); }
    if (needsFigure && !hasFigure) warnings.push("needsFigure, lekin hujjatda rasm/shakl topilmadi: " + reasons.join("; "));
    if (hasFigure && !needsFigure && figureKind === "image") warnings.push("Rasm bor, lekin savol unga tayanmasligi mumkin (qo'lda tekshirish)");
    const ov = OVERRIDES[grade]?.[st.no];
    if (ov) { needsFigure = ov.needsFigure; if (ov.note) warnings.push(ov.note); }

    // section guess by content
    let sec = startSection;
    if (sec === "math" && /^[\x20-\x7E\u2018-\u201D]+$/.test(stem) && /\b(the|is|are|you|he|she|I|they|what|where|choose|find)\b/i.test(stem) && !/\b(sm|kg|ta)\b/.test(stem)) sec = "english";

    items.push({
      no: st.no,
      section: guessSection(sec, stem),
      stem,
      options: opts.map(({ _figs, ...o }) => ({
        ...o,
        ...(_figs ? { figureImage: figureImagesFor(_figs, figs, allFigs, figureImages) } : {}),
      })),
      hasFigure,
      needsFigure,
      ...(hasFigure ? { figureKind } : {}),
      ...(figureImages.length ? { figureImage: figureImages[0], ...(figureImages.length > 1 ? { figureImages } : {}) } : {}),
      ...(figureText.length ? { figureText: figureText.join(" || ") } : {}),
      ...(hasEq ? { hasEquation: true } : {}),
      warnings,
    });
  }

  // numbering checks
  const nos = items.map((x) => x.no);
  const seen = new Set();
  const w = [...fileWarnings];
  for (const n of nos) { if (seen.has(n)) w.push(`Takror raqam: ${n}`); seen.add(n); }
  const max = Math.max(...nos);
  for (let n = 1; n <= max; n++) if (!seen.has(n)) w.push(`Raqam yo'q: ${n}`);
  const unused = ctx.figures.length - items.reduce((a, it) => a + (it.hasFigure ? 1 : 0), 0);
  const result = {
    sourceFile: source,
    grade,
    counts: {
      total: items.length,
      needsFigure: items.filter((x) => x.needsFigure).length,
      withEquations: items.filter((x) => x.hasEquation).length,
    },
    warnings: w,
    items,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `grade-${grade}.json`), JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`grade-${grade}: total=${result.counts.total} (max no ${max}) needsFigure=${result.counts.needsFigure} equations=${result.counts.withEquations} figuresInDoc=${ctx.figures.length} warnings=${w.length}`);
  return result;
}

function figureImagesFor(optFigIdx, figs, allFigs, figureImages) {
  // best-effort: map option figure to the question image with the same ordinal
  const res = [];
  for (const ix of optFigIdx) {
    const pos = allFigs.indexOf(ix);
    const img = figureImages[pos];
    if (img) res.push(img);
  }
  return res[0];
}

for (const f of FILES) await processFile(f);
