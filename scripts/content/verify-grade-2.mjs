// Independently recomputes every answer of content/quizzes/grade-2.json from each question's "check" spec
// and compares with the text of the option marked `correct`. Exits 1 on any mismatch.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const data = JSON.parse(readFileSync(join(root, "content", "quizzes", "grade-2.json"), "utf8"));
const bad = [];
let checked = 0;

const evalExpr = (s) => {
  const e = String(s).replace(/[×∙*]/g, "*").replace(/[÷:]/g, "/");
  if (!/^[0-9+\-*/(). ]+$/.test(e)) throw new Error(`ruxsat etilmagan ifoda: ${s}`);
  const val = Function(`"use strict"; return (${e});`)();
  if (!Number.isInteger(val)) throw new Error(`butun emas: ${s} = ${val}`);
  // every division must be exact: re-evaluate pieces simply by checking integer result of each a/b literal
  for (const m of e.matchAll(/(\d+)\s*\/\s*(\d+)/g)) if (Number(m[1]) % Number(m[2]) !== 0) throw new Error(`bo'linma butun emas: ${m[0]} (${s})`);
  return val;
};
const nums = (t) => (String(t).match(/\d+/g) ?? []).map(Number);
const UNIT = { kg: ["w", 1000], g: ["w", 1], m: ["l", 100], sm: ["l", 1], soat: ["t", 60], daqiqa: ["t", 1] };
const base = ([v, u]) => v * UNIT[u][1];

for (const v of data.variants) {
  const count = { A: 0, B: 0, C: 0, D: 0 };
  v.questions.forEach((q, i) => {
    const tag = `v${v.variant} #${i + 1}`;
    const fail = (m) => bad.push(`${tag}: ${m}  [${q.stem.uz.slice(0, 60)}]`);
    count[q.correct]++;
    const c = q.check;
    if (!c) return fail("check yo'q");
    const opt = (L) => q.options.find((o) => o.id === L).text.uz;
    const correctText = opt(q.correct);
    const others = q.options.filter((o) => o.id !== q.correct).map((o) => o.text.uz);
    try {
      checked++;
      switch (c.kind) {
        case "expr": {
          const val = evalExpr(c.expr);
          if (val < 0) fail(`manfiy javob ${val}`);
          const got = nums(correctText);
          if (got.length !== 1 || got[0] !== val) fail(`kutilgan ${val}, to'g'ri variant '${correctText}'`);
          for (const o of others) { const n = nums(o); if (n.length === 1 && n[0] === val) fail(`noto'g'ri variant '${o}' ham ${val}`); }
          if (!c.skipStem) {
            const stemNums = new Set(nums(q.stem.uz));
            for (const n of nums(c.expr)) if (!stemNums.has(n)) fail(`ifodadagi ${n} savol matnida yo'q`);
          }
          break;
        }
        case "seq": {
          const full = Array.from({ length: c.len }, (_, k) => c.start + k * c.step);
          const exp = c.blanks.map((k) => full[k]);
          const got = nums(correctText);
          if (got.join() !== exp.join()) fail(`qator: kutilgan ${exp}, bor ${got}`);
          const shown = full.map((x, k) => (c.blanks.includes(k) ? "__" : x)).join(", ");
          if (!q.stem.uz.includes(shown)) fail("savol matnidagi qator hisoblangan qatorga mos emas");
          for (const o of others) if (nums(o).join() === exp.join()) fail("noto'g'ri variant ham to'g'ri");
          break;
        }
        case "extreme": {
          const cands = q.options.map((o) => ({ id: o.id, n: nums(o.text.uz)[0] })).filter((x) => String(x.n).length === c.digits);
          const best = cands.reduce((a, b) => (c.mode === "min" ? (b.n < a.n ? b : a) : (b.n > a.n ? b : a)));
          if (best.id !== q.correct) fail(`kutilgan ${best.id} (${best.n})`);
          const lo = 10 ** (c.digits - 1), hi = 10 ** c.digits - 1;
          if (nums(correctText)[0] !== (c.mode === "min" ? lo : hi)) fail("mutlaq eng " + c.mode + " emas");
          break;
        }
        case "neighbors": {
          if (nums(correctText).join() !== [c.n - 1, c.n + 1].join()) fail(`qo'shnilar ${c.n - 1}, ${c.n + 1} bo'lishi kerak`);
          for (const o of others) if (nums(o).join() === [c.n - 1, c.n + 1].join()) fail("noto'g'ri variant ham to'g'ri");
          if (!nums(q.stem.uz).includes(c.n)) fail("son savolda yo'q");
          break;
        }
        case "exprs": {
          const vals = q.options.map((o) => ({ id: o.id, val: evalExpr(o.text.uz) }));
          const hit = vals.filter((x) => x.val === c.target);
          if (hit.length !== 1 || hit[0].id !== q.correct) fail(`${c.target} ga teng: ${hit.map((h) => h.id)}; correct=${q.correct}`);
          if (!nums(q.stem.uz).includes(c.target)) fail("maqsad son savolda yo'q");
          break;
        }
        case "divlist": {
          const ok = (t) => nums(t).length >= 3 && nums(t).every((x) => x % c.n === 0);
          const good = q.options.filter((o) => ok(o.text.uz)).map((o) => o.id);
          if (good.length !== 1 || good[0] !== q.correct) fail(`${c.n} ga bo'linadigan qatorlar: ${good}; correct=${q.correct}`);
          if (!nums(q.stem.uz).includes(c.n)) fail("bo'luvchi savolda yo'q");
          break;
        }
        case "compare": {
          const A = base(c.a), B = base(c.b);
          if (UNIT[c.a[1]][0] !== UNIT[c.b[1]][0]) fail("birliklar turli xil");
          const want = A === B ? c.eqText : A > B ? c.aText : c.bText;
          if (correctText !== want) fail(`kutilgan '${want}', bor '${correctText}'`);
          break;
        }
        case "wordsort": {
          const vals = c.items.map(([ch, e]) => [ch, evalExpr(e)]);
          if (new Set(vals.map((x) => x[1])).size !== vals.length) fail("qiymatlar takrorlangan");
          const word = vals.slice().sort((a, b) => (c.order === "desc" ? b[1] - a[1] : a[1] - b[1])).map((x) => x[0]).join("");
          if (correctText !== word) fail(`kutilgan ${word}, bor ${correctText}`);
          if (others.includes(word)) fail("noto'g'ri variant ham to'g'ri");
          for (const [ch, e] of c.items) if (!q.stem.uz.includes(`${ch}: ${e.replace("*", " × ")}`)) fail(`savolda ${ch} yo'q`);
          break;
        }
        default: fail(`noma'lum check turi ${c.kind}`);
      }
    } catch (e) { fail(String(e.message)); }
  });
  const n = v.questions.length;
  const share = Object.entries(count).map(([k, x]) => `${k}=${x}`).join(" ");
  console.log(`variant ${v.variant}: ${n} savol, javob harflari ${share}`);
  for (const [k, x] of Object.entries(count)) if (x / n < 0.15 || x / n > 0.35) bad.push(`v${v.variant}: '${k}' ulushi ${(100 * x / n).toFixed(0)}%`);
}

// cross-variant stem uniqueness
const seen = new Map();
for (const v of data.variants) v.questions.forEach((q, i) => {
  const k = q.stem.uz.trim().toLowerCase();
  if (seen.has(k)) bad.push(`takror savol matni: v${v.variant} #${i + 1} = ${seen.get(k)}`);
  seen.set(k, `v${v.variant} #${i + 1}`);
});

if (bad.length) {
  console.error(`\n${bad.length} ta XATO:`);
  bad.forEach((b) => console.error("  -", b));
  process.exit(1);
}
console.log(`OK: ${checked} ta savolning javobi mustaqil hisoblab tekshirildi, xato yo'q.`);
