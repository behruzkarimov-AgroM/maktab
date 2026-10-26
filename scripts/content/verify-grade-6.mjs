// Independently re-computes every math/logic answer of content/quizzes/grade-6.json
// (exact rational arithmetic with BigInt, no floats) and compares it with the option marked `correct`.
// Usage: node scripts/content/verify-grade-6.mjs   (exit code 1 on any mismatch)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const data = JSON.parse(readFileSync(join(root, "content", "quizzes", "grade-6.json"), "utf8"));

// ---- exact rationals as [num, den] BigInt pairs ----
const g = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { const t = a % b; a = b; b = t; } return a; };
const R = (n, d = 1n) => { if (d === 0n) throw new Error("division by zero"); if (d < 0n) { n = -n; d = -d; } const k = g(n, d) || 1n; return { n: n / k, d: d / k }; };
const add = (x, y) => R(x.n * y.d + y.n * x.d, x.d * y.d);
const sub = (x, y) => R(x.n * y.d - y.n * x.d, x.d * y.d);
const mul = (x, y) => R(x.n * y.n, x.d * y.d);
const div = (x, y) => R(x.n * y.d, x.d * y.n);
const eq = (x, y) => x.n === y.n && x.d === y.d;
const isInt = (x) => x.d === 1n;
const pow = (x, k) => { if (!isInt(k)) throw new Error("non-integer exponent"); let e = k.n, r = R(1n), b = x; if (e < 0n) { b = div(R(1n), x); e = -e; } while (e > 0n) { if (e & 1n) r = mul(r, b); b = mul(b, b); e >>= 1n; } return r; };
const isqrt = (n) => { if (n < 0n) throw new Error("sqrt negative"); if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; };
const show = (x) => (isInt(x) ? x.n.toString() : `${x.n}/${x.d}`);

// ---- expression evaluator: + - − × * ÷ / : ^ ( ) numbers (decimals ok) gcd() lcm() sqrt() ----
function evalExpr(src) {
  const s = src.replace(/\s+/g, "").replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  let i = 0;
  const peek = () => s[i];
  const num = () => {
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i)); if (!m) throw new Error(`number expected at ${i} in "${src}"`);
    i += m[0].length; const [ip, fp = ""] = m[0].split("."); return R(BigInt(ip + fp), 10n ** BigInt(fp.length));
  };
  function atom() {
    if (peek() === "(") { i++; const v = expr(); if (peek() !== ")") throw new Error("missing ) in " + src); i++; return v; }
    const fm = /^(gcd|lcm|sqrt)\(/.exec(s.slice(i));
    if (fm) {
      i += fm[0].length; const args = [expr()]; while (peek() === ",") { i++; args.push(expr()); }
      if (peek() !== ")") throw new Error("missing ) in " + src); i++;
      if (fm[1] === "sqrt") { const a = args[0]; const nn = isqrt(a.n), dd = isqrt(a.d); if (nn * nn !== a.n || dd * dd !== a.d) throw new Error("irrational sqrt"); return R(nn, dd); }
      const [a, b] = args; if (!isInt(a) || !isInt(b)) throw new Error("gcd/lcm need integers");
      const gg = g(a.n, b.n); return fm[1] === "gcd" ? R(gg) : R((a.n / gg) * b.n);
    }
    return num();
  }
  function unary() { if (peek() === "-") { i++; return mul(R(-1n), unary()); } return power(); }
  function power() { const b = atom(); if (peek() === "^") { i++; return pow(b, unary()); } return b; }
  function term() { let v = unary(); while (peek() === "*" || peek() === "/" || peek() === ":") { const op = s[i++]; const r = unary(); v = op === "*" ? mul(v, r) : div(v, r); } return v; }
  function expr() { let v = term(); while (peek() === "+" || peek() === "-") { const op = s[i++]; const r = term(); v = op === "+" ? add(v, r) : sub(v, r); } return v; }
  const out = expr(); if (i !== s.length) throw new Error(`trailing input at ${i} in "${src}"`); return out;
}

// ---- parse an option text to a rational (leading number: -3, 3/4, 2 1/4, 3,5, 12%, "68 dm") ----
function parseOpt(t) {
  const s = t.trim().replace(/−/g, "-"); let m;
  if ((m = /^(-?)(\d+)\/(\d+)/.exec(s))) return R(BigInt(m[1] + m[2]), BigInt(m[3]));
  if ((m = /^(-?)(\d+) (\d+)\/(\d+)/.exec(s))) { const v = add(R(BigInt(m[2])), R(BigInt(m[3]), BigInt(m[4]))); return m[1] ? mul(R(-1n), v) : v; }
  if ((m = /^(-?)(\d+)(?:[.,](\d+))?/.exec(s))) { const fp = m[3] ?? ""; return R(BigInt(m[1] + m[2] + fp), 10n ** BigInt(fp.length)); }
  throw new Error(`cannot parse option "${t}"`);
}

const DAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
let checked = 0, bad = 0; const problems = [];
const fail = (m) => { bad++; problems.push(m); };
const allStems = new Map();

for (const v of data.variants) {
  const tag = `v${v.variant}`;
  const counts = { A: 0, B: 0, C: 0, D: 0 }, sec = {};
  v.questions.forEach((q, idx) => {
    const qt = `${tag} #${idx + 1}`;
    counts[q.correct]++; sec[q.section] = (sec[q.section] ?? 0) + 1;
    const stem = q.stem.uz.toLowerCase().replace(/\s+/g, " ");
    if (allStems.has(stem)) fail(`${qt}: stem duplicates ${allStems.get(stem)}`); else allStems.set(stem, qt);
    const texts = q.options.map((o) => o.text.uz);
    const cor = q.options.find((o) => o.id === q.correct)?.text.uz;
    if (q.section === "english") {
      for (const x of [q.stem, ...q.options.map((o) => o.text)]) if (x.uz !== x.ru || x.uz !== x.en) fail(`${qt}: english text differs between languages`);
      return;
    }
    const c = q.check;
    if (!c) { fail(`${qt}: no check spec`); return; }
    checked++;
    try {
      if (c.kind === "div") {
        const d = BigInt(c.d);
        q.options.forEach((o) => { const divisible = BigInt(o.text.uz) % d === 0n; if (divisible !== (o.id === q.correct)) fail(`${qt}: option ${o.id}=${o.text.uz} divisibility by ${c.d} is ${divisible}`); });
      } else if (c.kind === "weekday") {
        const exp = DAYS[(((c.start + c.add) % 7) + 7) % 7];
        if (exp !== cor) fail(`${qt}: weekday expected ${exp}, correct option says ${cor}`);
        if (DAYS[c.ans] !== exp) fail(`${qt}: check.ans ${DAYS[c.ans]} != computed ${exp}`);
        if (texts.filter((t) => t === exp).length !== 1) fail(`${qt}: expected weekday must appear exactly once`);
      } else {
        const want = evalExpr(c.expr); const got = parseOpt(cor);
        if (!eq(want, got)) fail(`${qt}: "${c.expr}" = ${show(want)} but correct option "${cor}" = ${show(got)}`);
        q.options.forEach((o) => { if (o.id !== q.correct && eq(parseOpt(o.text.uz), want)) fail(`${qt}: distractor ${o.id} "${o.text.uz}" equals the right answer`); });
      }
    } catch (e) { fail(`${qt}: ${e.message}`); }
  });
  const n = v.questions.length;
  const shares = Object.entries(counts).map(([k, c]) => `${k}:${c}`).join(" ");
  console.log(`${tag}: ${n} questions ${JSON.stringify(sec)}  correct letters ${shares}`);
  for (const [k, c] of Object.entries(counts)) if (c / n < 0.15 || c / n > 0.35) fail(`${tag}: letter ${k} share ${(100 * c / n).toFixed(0)}%`);
}
console.log(`Checked ${checked} math/logic answers with exact arithmetic.`);
if (bad) { console.error(`\nFAILED: ${bad} problem(s)`); problems.forEach((p) => console.error("  - " + p)); process.exit(1); }
console.log("VERIFY OK: all answers match.");
