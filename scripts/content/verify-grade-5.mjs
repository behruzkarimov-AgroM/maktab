// Independent verification of every math answer in content/quizzes/grade-5.json using exact BigInt fractions.
// Usage: node scripts/content/verify-grade-5.mjs   (exit code 1 on any mismatch)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const data = JSON.parse(readFileSync(join(root, "content", "quizzes", "grade-5.json"), "utf8"));

// ---------- exact rationals ----------
const babs = (a) => (a < 0n ? -a : a);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const F = (n, d = 1n) => { n = BigInt(n); d = BigInt(d); if (d === 0n) throw new Error("division by zero"); if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; return { n: n / g, d: d / g }; };
const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => F(a.n * b.n, a.d * b.d);
const div = (a, b) => F(a.n * b.d, a.d * b.n);
const eq = (a, b) => a.n === b.n && a.d === b.d;
const fpow = (a, e) => { if (!(e.d === 1n)) throw new Error("non-integer exponent"); let k = e.n; let base = a; if (k < 0n) { base = div(F(1), a); k = -k; } let r = F(1); for (let i = 0n; i < k; i++) r = mul(r, base); return r; };
const isqrtBig = (n) => { if (n < 0n) throw new Error("sqrt<0"); if (n < 2n) return n; let x = BigInt(Math.floor(Math.sqrt(Number(n)))); while (x * x > n) x--; while ((x + 1n) * (x + 1n) <= n) x++; return x; };
const fsqrt = (a) => { const sn = isqrtBig(a.n), sd = isqrtBig(a.d); if (sn * sn !== a.n || sd * sd !== a.d) throw new Error("sqrt not exact"); return F(sn, sd); };
const fstr = (a) => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`);

// ---------- expression parser ----------
function tokenize(s) {
  const t = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    let m;
    if ((m = /^(\d+) (\d+)\/(\d+)(?![\d])/.exec(s.slice(i)))) { t.push({ k: "num", v: F(BigInt(m[1]) * BigInt(m[3]) + BigInt(m[2]), BigInt(m[3])) }); i += m[0].length; continue; }
    if ((m = /^\d+/.exec(s.slice(i)))) { t.push({ k: "num", v: F(BigInt(m[0])) }); i += m[0].length; continue; }
    if (s.startsWith("sqrt", i)) { t.push({ k: "sqrt" }); i += 4; continue; }
    if (/[a-z]/i.test(c)) { t.push({ k: "id", v: c }); i++; continue; }
    if ("+-()^/:".includes(c)) { t.push({ k: c }); i++; continue; }
    if (c === "×" || c === "·" || c === "*") { t.push({ k: "*" }); i++; continue; }
    if (c === "÷") { t.push({ k: "/" }); i++; continue; }
    throw new Error(`bad char '${c}' in "${s}"`);
  }
  return t;
}
function parse(s, env = {}) {
  const t = tokenize(s); let p = 0;
  const peek = () => t[p]?.k;
  const expr = () => { let v = term(); while (peek() === "+" || peek() === "-") { const op = t[p++].k; const r = term(); v = op === "+" ? add(v, r) : sub(v, r); } return v; };
  const term = () => {
    let v = unary();
    for (;;) {
      const k = peek();
      if (k === "*" || k === "/" || k === ":") { p++; const r = unary(); v = k === "*" ? mul(v, r) : div(v, r); }
      else if (k === "id" || k === "(" || k === "sqrt") { v = mul(v, unary()); } // implicit multiplication: 5x, 3(…)
      else break;
    }
    return v;
  };
  const unary = () => { if (peek() === "-") { p++; return sub(F(0), unary()); } return power(); };
  const power = () => { const b = atom(); if (peek() === "^") { p++; return fpow(b, unary()); } return b; };
  const atom = () => {
    const tk = t[p++];
    if (!tk) throw new Error("unexpected end");
    if (tk.k === "num") return tk.v;
    if (tk.k === "id") { if (!(tk.v in env)) throw new Error(`unbound ${tk.v}`); return env[tk.v]; }
    if (tk.k === "sqrt") { if (t[p++]?.k !== "(") throw new Error("sqrt("); const v = expr(); if (t[p++]?.k !== ")") throw new Error(")"); return fsqrt(v); }
    if (tk.k === "(") { const v = expr(); if (t[p++]?.k !== ")") throw new Error("missing )"); return v; }
    throw new Error(`unexpected ${tk.k}`);
  };
  const v = expr();
  if (p !== t.length) throw new Error(`trailing tokens in "${s}"`);
  return v;
}
const tryVal = (s) => { try { return parse(s); } catch { return null; } };

// ---------- units ----------
const LEN = { mm: 1n, sm: 10n, dm: 100n, m: 1000n, km: 1000000n };
const AREA = { "mm^2": 1n, "sm^2": 100n, "dm^2": 10000n, "m^2": 1000000n, ar: 100000000n, sotix: 100000000n, ha: 10000000000n, ga: 10000000000n, gektar: 10000000000n, "km^2": 1000000000000n };
const unitF = (u) => LEN[u] ?? AREA[u] ?? null;
const conv = (n, u1, u2) => { const a = unitF(u1), b = unitF(u2); if (a == null || b == null) throw new Error(`unit ${u1}/${u2}`); const same = (u1 in LEN) === (u2 in LEN); if (!same) throw new Error("unit kind mismatch"); return F(BigInt(n) * a, b); };

// ---------- rules: stem -> expected (string) | {oneOf:[texts]} ----------
const num = (s) => BigInt(s);
const rules = [
  [/^Hisoblang: (\d+) sm\^2 - (\d+) mm\^2$/, (m) => `${num(m[1]) * 100n - num(m[2])} mm^2`],
  [/^(?:Hisoblang|Ifodaning qiymatini toping|Yig'indini hisoblang): (.+)$/, (m) => fstr(parse(m[1]))],
  [/^Agar x = (\d+) bo'lsa, ifodaning qiymatini toping: (.+)$/, (m) => fstr(parse(m[2], { x: F(num(m[1])) }))],
  [/^Tenglamani yeching: (.+) = (.+)$/, (m) => { const f = (x) => sub(parse(m[1], { x: F(x) }), parse(m[2], { x: F(x) })); const f0 = f(0), f1 = f(1); const sol = div(sub(F(0), f0), sub(f1, f0)); if (!eq(sub(parse(m[1], { x: sol }), parse(m[2], { x: sol })), F(0))) throw new Error("not linear"); return fstr(sol); }],
  [/^Ko'paytma necha xonali son\? (.+)$/, (m) => String(babs(parse(m[1]).n).toString().length)],
  [/^(\d+) · x \+ (\d+) = (\d+) va (\d+) · y \+ (\d+) = (\d+) bo'lsa, \(x \+ y\) : (\d+) ni toping\.$/, (m) => { const x = div(F(num(m[3]) - num(m[2])), F(num(m[1]))); const y = div(F(num(m[6]) - num(m[5])), F(num(m[4]))); return fstr(div(add(x, y), F(num(m[7])))); }],
  [/^Yuzi (\d+) (\w+)\^2 ga teng bo'lgan kvadratning perimetrini toping\.$/, (m) => `${4n * fsqrt(F(num(m[1]))).n} ${m[2]}`],
  [/^Perimetri (\d+) (\w+) bo'lgan kvadratning yuzini toping\.$/, (m) => { const s = div(F(num(m[1])), F(4)); return `${fstr(mul(s, s))} ${m[2]}^2`; }],
  [/^Eni (\d+) (\w+), bo'yi (\d+) \2 bo'lgan to'g'ri to'rtburchakning yuzini toping\.$/, (m) => `${num(m[1]) * num(m[3])} ${m[2]}^2`],
  [/^Uzunligi (\d+) (\w+), eni (\d+) \2 bo'lgan to'g'ri to'rtburchakning perimetrini toping\.$/, (m) => `${2n * (num(m[1]) + num(m[3]))} ${m[2]}`],
  [/^O'lchamlari (\d+) ?sm, (\d+) ?sm, (\d+) ?sm bo'lgan .* hajmini toping\.$/, (m) => `${num(m[1]) * num(m[2]) * num(m[3])} sm^3`],
  [/^(\d+) (\S+) necha (.+?) ?ga teng\?$/, (m) => `${fstr(conv(m[1], m[2], m[3]))} ${m[3]}`],
  [/^Jasur kitobning beshdan bir qismini/, (m, s) => { const left = Number(/yana (\d+)/.exec(s)[1]); return fstr(div(F(left), sub(F(1), F(1, 5)))); }],
  [/^\(1\/8\) \+ \(1\/8\) \+ \(1\/8\) \+ … \+ \(1\/8\) \(n ta qo'shiluvchi\) = (\d+) bo'lsa/, (m) => fstr(mul(F(num(m[1])), F(8)))],
  [/^Uchta nevara/, () => { const ok = []; for (let a = 50; a < 120; a++) { const e = [75, 78, 81].map((g) => Math.abs(a - g)).sort((p, q) => p - q).join(); if (e === "1,2,4") ok.push(a); } return ok.join(" yoki "); }],
  [/^A mulohaza/, () => { let A = true, B = true; for (let n = 1; n <= 2000; n++) { if (n % 2 === 0 && n % 6 !== 0) A = false; if (n % 6 === 0 && n % 2 !== 0) B = false; } return `A ${A ? "rost" : "yolg'on"} va B ${B ? "rost" : "yolg'on"}`; }],
  [/^Anora, Salim, Javlon va Aziz/, () => { const aziz = 36, javlon = aziz - 3, anora = javlon + 6, salim = anora - 3; return String(aziz + javlon + anora + salim); }],
  [/^\((\d+)\/(\d+)\) va \((\d+) · x\/(\d+)\) kasrlar/, (m) => fstr(div(mul(div(F(num(m[1])), F(num(m[2]))), F(num(m[4]))), F(num(m[3]))))],
  [/^Agar 4a \+ 5d - 2c = 2024 bo'lsa, (.+) = \?$/, (m) => { const g = (a, c, d) => { if (!eq(parse("4a + 5d - 2c", { a, c, d }), F(2024))) throw new Error("premise"); return parse(m[1], { a, c, d }); }; const v1 = g(F(506), F(0), F(0)), v2 = g(F(0), F(0), F(2024, 5)), v3 = g(F(0), F(-1012), F(0)); if (!eq(v1, v2) || !eq(v2, v3)) throw new Error("expression not constant"); return fstr(v1); }],
  [/^Agar a = (.+) va b = (.+) bo'lsa, a : b = \?$/, (m) => fstr(div(parse(m[1]), parse(m[2])))],
  [/(\d+) ta .*?\((\d+)\/(\d+)\) qismi/, (m) => fstr(div(mul(F(num(m[1])), F(num(m[3]) - num(m[2]))), F(num(m[3]))))],
  [/\((\d+)\/(\d+)\) qismini .*?yana (\d+)/, (m) => fstr(div(F(num(m[3])), sub(F(1), div(F(num(m[1])), F(num(m[2]))))))],
  [/masofa (\d+) km.*? (\d+) soatdan.*? (\d+) ?km\/h ortiq/, (m) => { const s = div(F(num(m[1])), F(num(m[2]))); const v2 = div(sub(s, F(num(m[3]))), F(2)); return `${fstr(add(v2, F(num(m[3]))))} km/h, ${fstr(v2)} km/h`; }],
  [/^Ketma-ket uchta natural sonning yig'indisi (\d+) ga teng/, (m) => fstr(div(F(num(m[1]) - 3n), F(3)))],
  [/^\((\d+)\/(\d+)\) kasrni qisqartiring\.$/, (m) => fstr(F(num(m[1]), num(m[2])))],
  [/^Aralash sonni noto'g'ri kasrga aylantiring: (.+)$/, (m) => fstr(parse(m[1]))],
];

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, "");
const same = (a, b) => { const va = tryVal(a), vb = tryVal(b); if (va && vb) return eq(va, vb); return norm(a) === norm(b); };
const hasUnit = (s) => /[a-z]/i.test(s.replace(/\^/g, ""));

let checked = 0, bad = 0; const skipped = []; const unmatched = [];
const fail = (tag, msg) => { bad++; console.error(`FAIL ${tag}: ${msg}`); };

for (const v of data.variants) {
  v.questions.forEach((q, i) => {
    const tag = `v${v.variant} #${i + 1}`;
    const stem = q.stem.uz;
    const opt = (id) => q.options.find((o) => o.id === id).text.uz;
    const correct = opt(q.correct);
    if (q.section === "english") { skipped.push(tag); return; }
    let exp;
    if (["To'g'ri bajarilgan ifodani toping:", "Quyidagi tengliklardan qaysi biri to'g'ri bajarilgan?", "Qaysi amal natijasi to'g'ri yozilgan?"].includes(stem)) {
      const good = q.options.filter((o) => { const [l, r] = o.text.uz.split(" = "); return eq(parse(l), parse(r)); });
      if (good.length !== 1) return fail(tag, `${good.length} true equalities`);
      exp = good[0].text.uz;
    } else if (stem === "Qaysi tenglik to'g'ri?") {
      const good = q.options.filter((o) => { const m = /^(\d+) (\S+) = (\d+) (\S+)$/.exec(o.text.uz); if (!m) throw new Error("fmt " + o.text.uz); return eq(conv(m[1], m[2], m[4]), F(num(m[3]))); });
      if (good.length !== 1) return fail(tag, `${good.length} true unit equalities`);
      exp = good[0].text.uz;
    } else if (stem.startsWith("Natural sonlar ketma-ketligi")) {
      const good = q.options.filter((o) => /^1,2,3.*…$/.test(o.text.uz));
      if (good.length !== 1) return fail(tag, "natural sequence option count");
      exp = good[0].text.uz;
    } else {
      for (const [re, fn] of rules) {
        const m = re.exec(stem); if (!m) continue;
        try { exp = fn(m, stem); } catch (e) { exp = undefined; if (!/bad char|unbound|trailing|unexpected|missing/.test(e.message)) return fail(tag, `rule error: ${e.message} :: ${stem}`); continue; }
        break;
      }
    }
    if (exp === undefined) { unmatched.push(`${tag}: ${stem.slice(0, 70)}`); return; }
    checked++;
    let e = exp;
    if (!hasUnit(correct) && /^[\d/ ]+ [a-z^0-9]+$/i.test(exp) && tryVal(correct)) e = exp.replace(/ [a-z^0-9]+$/i, "");
    if (!same(e, correct)) return fail(tag, `expected "${exp}" but correct option is ${q.correct} = "${correct}" :: ${stem.slice(0, 80)}`);
    for (const o of q.options) if (o.id !== q.correct && same(e, o.text.uz)) fail(tag, `distractor ${o.id} "${o.text.uz}" equals the right answer :: ${stem.slice(0, 60)}`);
  });
}
unmatched.forEach((u) => fail("no-rule", u));
console.log(`math answers recomputed: ${checked}; english (grammar, not computed): ${skipped.length}; failures: ${bad}`);
if (bad) process.exit(1);
console.log("VERIFY OK");
