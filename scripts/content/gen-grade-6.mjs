// Generates content/quizzes/grade-6.json (4 variants x 30 questions: 18 math, 3 logic, 9 English).
// Math answers are computed here in code; each math/logic question also carries a `check` spec
// that scripts/content/verify-grade-6.mjs re-evaluates independently (exact rational arithmetic).
// Usage: node scripts/content/gen-grade-6.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------- exact fractions ----------
const gcdB = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
class Fr {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) throw new Error("zero denominator");
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdB(n, d) || 1n; this.n = n / g; this.d = d / g;
  }
  static of(x) { return x instanceof Fr ? x : new Fr(x); }
  add(o) { o = Fr.of(o); return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Fr.of(o); return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Fr.of(o); return new Fr(this.n * o.n, this.d * o.d); }
  div(o) { o = Fr.of(o); return new Fr(this.n * o.d, this.d * o.n); }
  eq(o) { o = Fr.of(o); return this.n === o.n && this.d === o.d; }
  pos() { return this.n > 0n; }
  isInt() { return this.d === 1n; }
}
const f = (n, d = 1) => new Fr(n, d);
const frStr = (x) => (x.isInt() ? x.n.toString() : `${x.n}/${x.d}`);
const mixedStr = (x) => {
  if (x.isInt() || x.n < 0n) return frStr(x);
  const w = x.n / x.d, r = x.n % x.d;
  return w === 0n ? `${r}/${x.d}` : `${w} ${r}/${x.d}`;
};
const decStr = (x, sep = ",") => {
  let k = 0; let p = 1n;
  while (p % x.d !== 0n) { p *= 10n; k++; if (k > 12) throw new Error("non-terminating " + frStr(x)); }
  const neg = x.n < 0n; let s = ((neg ? -x.n : x.n) * (p / x.d)).toString();
  if (k > 0) { s = s.padStart(k + 1, "0"); s = s.slice(0, s.length - k) + sep + s.slice(s.length - k); }
  return (neg ? "-" : "") + s;
};
const mixedExpr = (w, n, d) => `(${w} + ${n}/${d})`;

// ---------- rng ----------
const mk = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pk = (r, arr) => arr[Math.floor(r() * arr.length)];
const shuffle = (r, arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a, b) => (a / gcd(a, b)) * b;
const I = (x) => String(x);
const okI = (x, suf = "") => (Number.isInteger(x) ? I(x) + suf : null);
const intNear = (ans, suf = "") => [1, -1, 2, -2, 3, -3, 10, -10, 5].map((o) => I(ans + o) + suf);
const divisors = (n) => { const o = []; for (let i = 2; i < n; i++) if (n % i === 0) o.push(i); return o; };
const coprimePair = (r, lo, hi) => { for (;;) { const a = ri(r, lo, hi), b = ri(r, lo, hi); if (a !== b && gcd(a, b) === 1) return [a, b]; } };

// ---------- MATH templates: (r, v) => {stem, ans, wrong[], expl, check} ----------
const math = [];

// 1. order of operations
math.push((r) => {
  const A = ri(r, 12, 60), B = ri(r, 3, 9), C = ri(r, 3, 9), E = ri(r, 2, 9), k = ri(r, 3, 9), D = E * k;
  const ans = A + B * C - k;
  const e = `${A} + ${B} × ${C} − ${D} ÷ ${E}`;
  return { stem: `Hisoblang: ${e}`, ans: I(ans),
    wrong: [I((A + B) * C - k), I(A + B * C - E), I(A + B + C - k), okI((A + B * C - D) / E), ...intNear(ans)],
    expl: `Avval ko'paytirish va bo'lish: ${B} × ${C} = ${B * C}, ${D} ÷ ${E} = ${k}. Keyin: ${A} + ${B * C} − ${k} = ${ans}.`,
    check: { expr: e } };
});
// 2. powers + brackets
math.push((r) => {
  const p = ri(r, 8, 15), q = ri(r, 3, 7), s = ri(r, 12, 30), t = ri(r, 2, 9), u = ri(r, 2, 8);
  const ans = p * p - q * q + (s - t) * u;
  const e = `${p}^2 − ${q}^2 + (${s} − ${t}) × ${u}`;
  return { stem: `Hisoblang: ${e}`, ans: I(ans),
    wrong: [I((p - q) ** 2 + (s - t) * u), I(p * p - q * q + s - t * u), I(2 * p - 2 * q + (s - t) * u), I(p * p + q * q + (s - t) * u), ...intNear(ans)],
    expl: `${p}^2 = ${p * p}, ${q}^2 = ${q * q}, (${s} − ${t}) × ${u} = ${(s - t) * u}. Natija: ${p * p} − ${q * q} + ${(s - t) * u} = ${ans}.`,
    check: { expr: e } };
});
// 3. divisibility
math.push((r, v) => {
  const d = [9, 6, 12, 15][v];
  const rule = { 9: "raqamlari yig'indisi 9 ga bo'linadi", 6: "son juft va raqamlari yig'indisi 3 ga bo'linadi", 12: "son 3 ga (raqamlari yig'indisi) va 4 ga (oxirgi ikki raqami) bo'linadi", 15: "son 3 ga (raqamlari yig'indisi) va 5 ga (oxiri 0 yoki 5) bo'linadi" }[d];
  const q = ri(r, Math.ceil(100 / d), Math.floor(999 / d)); const ans = d * q;
  const ms = divisors(d); const wrong = []; let guard = 0;
  while (wrong.length < 3 && guard++ < 500) {
    const m = ms[wrong.length % ms.length];
    const x = m * ri(r, Math.ceil(100 / m), Math.floor(999 / m));
    if (x % d !== 0 && !wrong.includes(I(x))) wrong.push(I(x));
  }
  return { stem: `Quyidagi sonlardan qaysi biri ${d} ga qoldiqsiz bo'linadi?`, ans: I(ans), wrong,
    expl: `${d} ga bo'linish belgisi: ${rule}. ${ans} ÷ ${d} = ${q}, qoldiq yo'q. Boshqa sonlar ${d} ga bo'linmaydi.`,
    check: { kind: "div", d } };
});
// 4. GCD
math.push((r) => {
  const g = ri(r, 6, 18); const [x, y] = coprimePair(r, 2, 9); const a = g * x, b = g * y;
  return { stem: `${a} va ${b} sonlarining eng katta umumiy bo'luvchisini (EKUB) toping.`, ans: I(g),
    wrong: [I(lcm(a, b)), I(2 * g), I(Math.abs(a - b)), I(Math.min(a, b)), ...intNear(g)],
    expl: `${a} = ${g} × ${x}, ${b} = ${g} × ${y}. ${x} va ${y} o'zaro tub, shuning uchun EKUB(${a}; ${b}) = ${g}.`,
    check: { expr: `gcd(${a}, ${b})` } };
});
// 5. LCM word problem
math.push((r, v) => {
  const g = ri(r, 2, 6); const [x, y] = coprimePair(r, 2, 7); const p = g * x, q = g * y; const L = lcm(p, q);
  const ctx = [
    [`Ikki avtobus bekatdan bir vaqtda yo'lga chiqdi. Birinchisi har ${p} daqiqada, ikkinchisi har ${q} daqiqada shu bekatga qaytadi. Necha daqiqadan keyin ular bekatda yana birga bo'ladi?`, " daqiqa"],
    [`Mayoqdagi ikki chiroq bir vaqtda yondi. Biri har ${p} soniyada, ikkinchisi har ${q} soniyada yonadi. Necha soniyadan so'ng ular yana bir vaqtda yonadi?`, " soniya"],
    [`Ikki sportchi aylana yo'lakda bir vaqtda start oldi. Biri bir aylanani ${p} daqiqada, ikkinchisi ${q} daqiqada yuguradi. Necha daqiqadan so'ng ular yana startda uchrashadi?`, " daqiqa"],
    [`Ikki qorovul navbatma-navbat ishlaydi: birinchisi har ${p} kunda, ikkinchisi har ${q} kunda ishga chiqadi. Bugun ikkalasi birga ishlayapti. Necha kundan keyin yana birga ishlaydi?`, " kun"],
  ][v];
  const u = ctx[1];
  return { stem: ctx[0], ans: I(L) + u,
    wrong: [I(p * q) + u, I(g) + u, I(p + q) + u, I(2 * L) + u, I(L + g) + u],
    expl: `Ular birga uchrashadigan vaqt — EKUK(${p}; ${q}). ${p} = ${g} × ${x}, ${q} = ${g} × ${y}, EKUK = ${g} × ${x} × ${y} = ${L}.`,
    check: { expr: `lcm(${p}, ${q})` } };
});
// 6. fractions + / −
math.push((r) => {
  for (;;) {
    const L = pk(r, [12, 24, 20, 30, 18, 36]); const ds = divisors(L).filter((d) => d >= 3);
    const b = pk(r, ds), d = pk(r, ds), ff = pk(r, ds);
    if (new Set([b, d, ff]).size < 3) continue;
    const a = ri(r, 1, b - 1), c = ri(r, 1, d - 1), e = ri(r, 1, ff - 1);
    if (gcd(a, b) !== 1 || gcd(c, d) !== 1 || gcd(e, ff) !== 1) continue;
    const t = f(a, b).add(f(c, d)).sub(f(e, ff));
    if (!t.pos() || t.n > 2n * t.d || t.d > 36n) continue;
    const e0 = `${a}/${b} + ${c}/${d} − ${e}/${ff}`;
    const Ld = BigInt(lcm(lcm(b, d), ff)); const step = f(1, Number(Ld));
    const wr = [t.add(step), t.sub(step), f(a + c - e, Math.max(b, d, ff)), f(a + c - e, b + d - ff > 0 ? b + d - ff : 1), t.add(step.mul(2))];
    return { stem: `Hisoblang: ${e0}`, ans: mixedStr(t),
      wrong: wr.filter((x) => x.pos()).map(mixedStr),
      expl: `Umumiy maxraj ${Ld}: ${a}/${b} = ${Number(Ld) / b * a}/${Ld}, ${c}/${d} = ${Number(Ld) / d * c}/${Ld}, ${e}/${ff} = ${Number(Ld) / ff * e}/${Ld}. Hisob: (${Number(Ld) / b * a} + ${Number(Ld) / d * c} − ${Number(Ld) / ff * e})/${Ld} = ${mixedStr(t)}.`,
      check: { expr: e0 } };
  }
});
// 7. fractions × ÷
math.push((r) => {
  for (;;) {
    const a = ri(r, 1, 9), b = ri(r, 2, 9), c = ri(r, 1, 9), d = ri(r, 2, 9);
    if (gcd(a, b) !== 1 || gcd(c, d) !== 1 || a === c || b === d) continue;
    const t = f(a, b).div(f(c, d));
    if (t.d > 12n || t.n > 20n || t.isInt() || t.eq(f(a, b).mul(f(c, d)))) continue;
    const wr = [f(a, b).mul(f(c, d)), f(b, a).mul(f(c, d)), f(b, a).div(f(c, d)), f(a + d, b + c), t.add(f(1, 2))];
    return { stem: `Hisoblang: (${a}/${b}) ÷ (${c}/${d})`, ans: mixedStr(t),
      wrong: wr.map(mixedStr),
      expl: `Bo'lishni ko'paytirishga almashtiramiz: (${a}/${b}) × (${d}/${c}) = ${a * d}/${b * c} = ${mixedStr(t)}.`,
      check: { expr: `(${a}/${b}) ÷ (${c}/${d})` } };
  }
});
// 8. mixed numbers subtraction with borrowing
math.push((r) => {
  for (;;) {
    const L = pk(r, [12, 24, 20, 30]); const ds = divisors(L).filter((d) => d >= 3);
    const d1 = pk(r, ds), d2 = pk(r, ds); if (d1 === d2) continue;
    const n1 = ri(r, 1, d1 - 1), n2 = ri(r, 1, d2 - 1);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) continue;
    if (!(f(n1, d1).sub(f(n2, d2)).n < 0n)) continue;
    const w2 = ri(r, 2, 6), w1 = w2 + ri(r, 2, 5);
    const x = f(w1).add(f(n1, d1)), y = f(w2).add(f(n2, d2)); const t = x.sub(y);
    const step = f(1, lcm(d1, d2));
    const wrongA = f(w1 - w2).add(f(n2, d2).sub(f(n1, d1)));
    const wr = [wrongA, t.add(step), t.sub(step), t.add(1), f(w1 - w2 - 1).add(f(n2, d2).sub(f(n1, d1)))];
    return { stem: `Hisoblang: ${w1} ${n1}/${d1} − ${w2} ${n2}/${d2}`, ans: mixedStr(t),
      wrong: wr.filter((q) => q.pos()).map(mixedStr),
      expl: `Butun va kasr qismlar: ${n1}/${d1} < ${n2}/${d2}, shuning uchun bitta butunni ochamiz: ${w1} ${n1}/${d1} = ${mixedStr(x)} va ${w2} ${n2}/${d2} = ${mixedStr(y)}. Ayirma: ${mixedStr(t)}.`,
      check: { expr: `${mixedExpr(w1, n1, d1)} − ${mixedExpr(w2, n2, d2)}` } };
  }
});
// 9. decimals * and +
math.push((r) => {
  for (;;) {
    const a = f(ri(r, 12, 98), 10); if (a.isInt()) continue;
    const b = pk(r, [f(1, 2), f(1, 4), f(2, 5), f(3, 20), f(3, 2), f(5, 2), f(3, 50), f(1, 25)]);
    const c = f(ri(r, 11, 99), 100); if (decStr(c).endsWith("0")) continue;
    const ab = a.mul(b); const t = ab.add(c);
    const wr = [ab.div(10).add(c), ab.mul(10).add(c), ab.sub(c), a.add(b).add(c), ab.add(c.div(10)), t.add(f(1, 10))];
    const e0 = `${decStr(a, ".")} × ${decStr(b, ".")} + ${decStr(c, ".")}`;
    return { stem: `Hisoblang: ${decStr(a)} × ${decStr(b)} + ${decStr(c)}`, ans: decStr(t),
      wrong: wr.filter((q) => q.pos()).map((q) => decStr(q)),
      expl: `Avval ko'paytiramiz: ${decStr(a)} × ${decStr(b)} = ${decStr(ab)}. Keyin qo'shamiz: ${decStr(ab)} + ${decStr(c)} = ${decStr(t)}.`,
      check: { expr: e0 } };
  }
});
// 10. decimal division
math.push((r) => {
  const b = pk(r, [f(1, 5), f(1, 2), f(1, 25), f(1, 4), f(6, 5), f(4, 5), f(1, 20), f(3, 20)]);
  const q = f(ri(r, 12, 99), pk(r, [1, 10]));
  const a = q.mul(b); const sep = decStr(a, ".");
  return { stem: `Hisoblang: ${decStr(a)} ÷ ${decStr(b)}`, ans: decStr(q),
    wrong: [q.mul(10), q.div(10), q.mul(100), q.div(100), a.mul(b)].map((x) => decStr(x)),
    expl: `Bo'luvchini butun qilish uchun ikkala sonni bir xil darajada 10 ga ko'paytiramiz. ${decStr(a)} ÷ ${decStr(b)} = ${decStr(q)}, tekshiruv: ${decStr(q)} × ${decStr(b)} = ${decStr(a)}.`,
    check: { expr: `${sep} ÷ ${decStr(b, ".")}` } };
});
// 11. proportion (price) / ratio sharing
math.push((r, v) => {
  if (v % 2 === 0) {
    const item = ["olma", "uzum", "pomidor", "gilos"][v === 0 ? 0 : 2];
    const k1 = ri(r, 2, 9), k2 = k1 + ri(r, 2, 7); const p = pk(r, [3000, 4500, 6000, 7500, 8000, 9000, 12000, 15000]);
    const P1 = k1 * p, ans = k2 * p; const u = " so'm";
    return { stem: `${k1} kg ${item} ${P1} so'm turadi. ${k2} kg ${item} necha so'm turadi?`, ans: I(ans) + u,
      wrong: [I(ans - 2 * p) + u, I(p * (k2 + k1)) + u, I(p * (k2 - k1)) + u, I(ans + p) + u, I(ans - p) + u],
      expl: `1 kg narxi: ${P1} ÷ ${k1} = ${p} so'm. ${k2} kg narxi: ${p} × ${k2} = ${ans} so'm.`,
      check: { expr: `${P1} ÷ ${k1} × ${k2}` } };
  }
  const [x, y] = coprimePair(r, 2, 8); const a = Math.min(x, y), b = Math.max(x, y); const k = ri(r, 6, 20); const total = k * (a + b);
  const diff = v === 3;
  const ans = diff ? k * (b - a) : k * b;
  const thing = v === 1 ? "ta konfet" : "ta daftar";
  return { stem: `${total} ${thing} ikki o'quvchi o'rtasida ${a}:${b} nisbatda bo'lindi. ${diff ? "Ularning ulushlari farqi nechaga teng?" : "Ko'p olgan o'quvchi nechta oldi?"}`, ans: I(ans),
    wrong: diff ? [I(k), I(k * a), I(k * b), I(total - ans), ...intNear(ans)] : [I(k), I(k * a), I(total / 2), I(ans + k), ...intNear(ans)],
    expl: `Jami ulushlar: ${a} + ${b} = ${a + b}. Bir ulush: ${total} ÷ ${a + b} = ${k}. ${diff ? `Farq: ${b - a} ulush = ${k} × ${b - a} = ${ans}.` : `Katta ulush: ${k} × ${b} = ${ans}.`}`,
    check: { expr: diff ? `${total} ÷ (${a} + ${b}) × (${b} − ${a})` : `${total} ÷ (${a} + ${b}) × ${b}` } };
});
// 12. percent (discount)
math.push((r, v) => {
  const item = ["Kitob", "Sumka", "Futbolka", "Velosiped"][v]; const N = ri(r, 3, 30) * 1000; const p = pk(r, [10, 15, 20, 25, 30, 35, 40, 45]);
  const ans = (N * (100 - p)) / 100; const u = " so'm";
  return { stem: `${item} narxi ${N} so'm edi. Chegirma ${p}% bo'ldi. Chegirmadan keyin narxi necha so'm bo'ladi?`, ans: I(ans) + u,
    wrong: [I((N * p) / 100) + u, I((N * (100 + p)) / 100) + u, I(N - p) + u, I(ans + 1000) + u, I(ans - 1000) + u],
    expl: `Chegirma: ${N} × ${p} ÷ 100 = ${(N * p) / 100} so'm. Yangi narx: ${N} − ${(N * p) / 100} = ${ans} so'm.`,
    check: { expr: `${N} × (100 − ${p}) ÷ 100` } };
});
// 13. equations
math.push((r, v) => {
  if (v % 2 === 0) {
    for (;;) {
      const x0 = ri(r, 3, 12), a = ri(r, 5, 9), c = ri(r, 2, a - 2), b = ri(r, 2, 15); const d = (a - c) * x0 - b;
      if (d < 2) continue;
      const wr = [okI((d - b) / (a - c)), okI((d + b) / (a + c)), I(x0 + 1), I(x0 - 1), I(x0 + 2), I(x0 - 2)];
      return { stem: `Tenglamani yeching: ${a}x − ${b} = ${c}x + ${d}`, ans: I(x0), wrong: wr,
        expl: `x li hadlarni bir tomonga: ${a}x − ${c}x = ${d} + ${b}, ya'ni ${a - c}x = ${d + b}. x = ${d + b} ÷ ${a - c} = ${x0}.`,
        check: { expr: `(${d} + ${b}) ÷ (${a} − ${c})` } };
    }
  }
  const x0 = ri(r, 5, 14), b = ri(r, 1, 4), a = ri(r, 2, 7), c = ri(r, 1, 12); const d = a * (x0 - b) + c;
  return { stem: `Tenglamani yeching: ${a}(x − ${b}) + ${c} = ${d}`, ans: I(x0),
    wrong: [I((d - c) / a - b), I((d - c) / a), I(x0 + 1), I(x0 - 1), I(x0 + 2)],
    expl: `${a}(x − ${b}) = ${d} − ${c} = ${d - c}. x − ${b} = ${d - c} ÷ ${a} = ${(d - c) / a}. x = ${(d - c) / a} + ${b} = ${x0}.`,
    check: { expr: `(${d} − ${c}) ÷ ${a} + ${b}` } };
});
// 14. negative numbers
math.push((r) => {
  for (;;) {
    const a = ri(r, 2, 15), b = ri(r, 2, 20), c = ri(r, 2, 12), d = ri(r, 2, 15);
    const ans = -a + b + c - d;
    const wr = [-a + b - c - d, -ans, a + b + c - d, -a - b + c - d, ans + 2 * c];
    if (ans === 0) continue;
    return { stem: `Hisoblang: (−${a}) + ${b} − (−${c}) − ${d}`, ans: I(ans), wrong: [...wr.map(I), ...intNear(ans)],
      expl: `Manfiy sonni ayirish qo'shishga teng: − (−${c}) = + ${c}. Hisob: −${a} + ${b} + ${c} − ${d} = ${ans}.`,
      check: { expr: `(-${a}) + ${b} − (-${c}) − ${d}` } };
  }
});
// 15. rectangle area from perimeter
math.push((r) => {
  for (;;) {
    const a = ri(r, 6, 18), b = ri(r, 4, 14); if (a === b) continue; const P = 2 * (a + b); const u = " sm^2";
    return { stem: `To'g'ri to'rtburchakning perimetri ${P} sm, bir tomoni ${a} sm. Uning yuzini toping.`, ans: I(a * b) + u,
      wrong: [I(a * (P - a)) + u, I(a * (P / 2)) + u, I(a * a) + u, I(a * b + a) + u, I(a * b - a) + u],
      expl: `Yarim perimetr: ${P} ÷ 2 = ${P / 2}. Ikkinchi tomon: ${P / 2} − ${a} = ${b} sm. Yuz: ${a} × ${b} = ${a * b} sm^2.`,
      check: { expr: `${a} × (${P} ÷ 2 − ${a})` } };
  }
});
// 16. volume
math.push((r, v) => {
  if (v % 2 === 0) {
    for (;;) {
      const a = ri(r, 3, 12), b = ri(r, 3, 12), h = ri(r, 3, 12); if (new Set([a, b, h]).size < 3) continue; const V = a * b * h; const u = " sm";
      return { stem: `To'g'ri burchakli parallelepipedning hajmi ${V} sm^3, uzunligi ${a} sm, eni ${b} sm. Uning balandligi necha sm?`, ans: I(h) + u,
        wrong: [I(h + 1) + u, I(h - 1) + u, I(2 * h) + u, I(h + 2) + u, I(h + 3) + u],
        expl: `V = a × b × h, bundan h = V ÷ (a × b) = ${V} ÷ (${a} × ${b}) = ${V} ÷ ${a * b} = ${h} sm.`,
        check: { expr: `${V} ÷ (${a} × ${b})` } };
    }
  }
  const a = pk(r, [20, 30, 40, 50, 60, 80]), b = pk(r, [20, 30, 40, 50]), h = pk(r, [30, 40, 50, 60]);
  const ans = (a * b * h) / 1000; const u = " l";
  return { stem: `Akvariumning uzunligi ${a} sm, eni ${b} sm, balandligi ${h} sm. Unga necha litr suv sig'adi? (1 litr = 1 dm^3)`, ans: I(ans) + u,
    wrong: [I(ans * 10) + u, I(ans * 100) + u, I((a * b * h) / 100) + u, I(a * b * h) + u, I(ans + 10) + u],
    expl: `Hajm: ${a} × ${b} × ${h} = ${a * b * h} sm^3. 1 dm^3 = 1000 sm^3, shuning uchun ${a * b * h} ÷ 1000 = ${ans} dm^3 = ${ans} litr.`,
    check: { expr: `${a} × ${b} × ${h} ÷ 1000` } };
});
// 17. average
math.push((r, v) => {
  const C = [
    { n: 4, lo: 70, hi: 98, w: (vals, m) => `Madina 4 ta nazorat ishidan ${vals.join(", ")} va x ball oldi. Uning o'rtacha bali ${m} bo'lsa, x nechaga teng?`, u: " ball" },
    { n: 5, lo: 12, hi: 28, w: (vals, m) => `Besh kunlik o'rtacha harorat ${m} °C bo'ldi. Dastlabki to'rt kunda harorat ${vals.join(", ")} °C edi. Beshinchi kuni harorat necha °C bo'lgan?`, u: " °C" },
    { n: 5, lo: 140, hi: 156, w: (vals, m) => `Beshta o'quvchining bo'yi o'rtacha ${m} sm. Ulardan to'rttasining bo'yi ${vals.join(", ")} sm. Beshinchi o'quvchining bo'yi necha sm?`, u: " sm" },
    { n: 4, lo: 20, hi: 60, w: (vals, m) => `To'rt kunda kutubxonadan o'rtacha kuniga ${m} ta kitob berildi. Dastlabki uch kunda ${vals.join(", ")} ta kitob berilgan edi. To'rtinchi kuni nechta kitob berilgan?`, u: " ta" },
  ][v];
  for (;;) {
    const vals = Array.from({ length: C.n - 1 }, () => ri(r, C.lo, C.hi)); const x = ri(r, C.lo, C.hi);
    const sum = vals.reduce((s, y) => s + y, 0); if ((sum + x) % C.n !== 0) continue;
    const m = (sum + x) / C.n; const u = C.u;
    const wr = [I(m), I(x + 2 * C.n), I(x + C.n), I(x - C.n), I((C.n - 1) * m - sum)];
    return { stem: C.w(vals, m), ans: I(x) + u, wrong: wr.map((s) => s + u).concat(intNear(x, u)),
      expl: `Jami: ${C.n} × ${m} = ${C.n * m}. Ma'lum qiymatlar yig'indisi ${sum}. Noma'lum: ${C.n * m} − ${sum} = ${x}.`,
      check: { expr: `${C.n} × ${m} − (${vals.join(" + ")})` } };
  }
});
// 18. motion / work
math.push((r, v) => {
  if (v === 0) {
    const v1 = pk(r, [45, 50, 55, 60, 65]), v2 = pk(r, [40, 70, 75, 80, 85]), t = ri(r, 3, 7); const D = (v1 + v2) * t; const u = " soat";
    return { stem: `Ikki shahar orasidagi masofa ${D} km. Ikkala shahardan bir vaqtda bir-biriga qarab ikkita poyezd yo'lga chiqdi, tezliklari ${v1} km/soat va ${v2} km/soat. Necha soatdan keyin ular uchrashadi?`, ans: I(t) + u,
      wrong: [I(t + 1) + u, I(t - 1) + u, I(2 * t) + u, I(t + 2) + u, I(t + 3) + u],
      expl: `Yaqinlashish tezligi: ${v1} + ${v2} = ${v1 + v2} km/soat. Vaqt: ${D} ÷ ${v1 + v2} = ${t} soat.`,
      check: { expr: `${D} ÷ (${v1} + ${v2})` } };
  }
  if (v === 2) {
    const s = pk(r, [12, 15, 18, 21, 24, 27]), m = pk(r, [20, 40, 80, 100, 120]); const ans = (s * m) / 60; const u = " km";
    return { stem: `Velosipedchi ${s} km/soat tezlik bilan ${m} daqiqa yurdi. U necha km yo'l bosdi?`, ans: I(ans) + u,
      wrong: [I(s * m) + u, I(s + m) + u, I(2 * ans) + u, I(ans + s) + u, I(ans + 2) + u],
      expl: `${m} daqiqa = ${m} ÷ 60 soat. Yo'l: ${s} × ${m} ÷ 60 = ${ans} km.`,
      check: { expr: `${s} × ${m} ÷ 60` } };
  }
  const [a, b] = v === 1 ? [15, 10] : [20, 30]; const ans = (a * b) / (a + b); const u = v === 1 ? " kun" : " soat";
  const stem = v === 1
    ? `Birinchi ishchi ishni ${a} kunda, ikkinchisi ${b} kunda bajaradi. Ikkalasi birgalikda ishlasa, shu ishni necha kunda bajaradi?`
    : `Birinchi quvur hovuzni ${a} soatda, ikkinchisi ${b} soatda to'ldiradi. Ikkala quvur bir vaqtda ochilsa, hovuz necha soatda to'ladi?`;
  return { stem, ans: I(ans) + u, wrong: [I((a + b) / 2) + u, I(a + b) + u, I(2 * ans) + u, I(Math.abs(a - b)) + u, I(ans + 1) + u],
    expl: `1 ${v === 1 ? "kunda" : "soatda"} ish ${"1/" + a} + ${"1/" + b} = ${frStr(f(1, a).add(f(1, b)))} qismi bajariladi. Butun ish uchun: 1 ÷ ${frStr(f(1, a).add(f(1, b)))} = ${ans}.`,
    check: { expr: `1 ÷ (1/${a} + 1/${b})` } };
});

// ---------- LOGIC (hand-written, numeric ones checked) ----------
const DAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const logic = [
  // sequences
  [
    { stem: "Ketma-ketlikning keyingi hadini toping: 3, 6, 12, 24, ...", ans: "48", wrong: ["36", "30", "44"], expl: "Har bir had oldingisidan 2 marta katta: 24 × 2 = 48.", check: { expr: "24 × 2" } },
    { stem: "Ketma-ketlikning keyingi hadini toping: 2, 5, 10, 17, 26, ...", ans: "37", wrong: ["35", "36", "38"], expl: "Farqlar 3, 5, 7, 9 — toq sonlar, keyingi farq 11. 26 + 11 = 37.", check: { expr: "26 + 11" } },
    { stem: "Ketma-ketlikning keyingi hadini toping: 1, 1, 2, 3, 5, 8, ...", ans: "13", wrong: ["11", "12", "16"], expl: "Har bir had oldingi ikkitasining yig'indisi: 5 + 8 = 13.", check: { expr: "5 + 8" } },
    { stem: "Ketma-ketlikning keyingi hadini toping: 100, 91, 82, 73, ...", ans: "64", wrong: ["63", "65", "62"], expl: "Har gal 9 ga kamayadi: 73 − 9 = 64.", check: { expr: "73 − 9" } },
  ],
  // calendar
  [
    { stem: "Bugun dushanba. 45 kundan keyin haftaning qaysi kuni bo'ladi?", ans: "Payshanba", wrong: ["Chorshanba", "Juma", "Seshanba"], expl: "45 = 6 × 7 + 3. Hafta 7 kun, demak dushanbadan 3 kun keyin — payshanba.", check: { kind: "weekday", start: 0, add: 45, ans: 3 } },
    { stem: "Bugun chorshanba. 100 kundan keyin haftaning qaysi kuni bo'ladi?", ans: "Juma", wrong: ["Payshanba", "Shanba", "Chorshanba"], expl: "100 = 14 × 7 + 2. Chorshanbadan 2 kun keyin — juma.", check: { kind: "weekday", start: 2, add: 100, ans: 4 } },
    { stem: "Bugun yakshanba. 30 kun oldin haftaning qaysi kuni bo'lgan?", ans: "Juma", wrong: ["Shanba", "Payshanba", "Dushanba"], expl: "30 = 4 × 7 + 2. Yakshanbadan 2 kun orqaga — juma.", check: { kind: "weekday", start: 6, add: -30, ans: 4 } },
    { stem: "Bugun shanba. 59 kundan keyin haftaning qaysi kuni bo'ladi?", ans: "Seshanba", wrong: ["Dushanba", "Chorshanba", "Yakshanba"], expl: "59 = 8 × 7 + 3. Shanbadan 3 kun keyin — seshanba.", check: { kind: "weekday", start: 5, add: 59, ans: 1 } },
  ],
  // reasoning
  [
    { stem: "6 ta do'st uchrashdi va har biri qolgan hammasi bilan bir martadan qo'l siqishdi. Jami nechta qo'l siqish bo'ldi?", ans: "15", wrong: ["30", "12", "36"], expl: "Har biri 5 kishi bilan: 6 × 5 = 30, lekin har bir juft ikki marta sanaldi. 30 ÷ 2 = 15.", check: { expr: "6 × 5 ÷ 2" } },
    { stem: "Otasi 40 yoshda, o'g'li 10 yoshda. Necha yildan keyin ota o'g'lidan roppa-rosa 3 marta katta bo'ladi?", ans: "5", wrong: ["10", "4", "6"], expl: "Yosh farqi 30 o'zgarmaydi. Ota 3 marta katta bo'lsa, farq o'g'lining yoshidan 2 marta ko'p: o'g'li 15 yosh. 15 − 10 = 5 yil.", check: { expr: "(40 − 3 × 10) ÷ (3 − 1)" } },
    { stem: "Qopda 8 ta qizil, 7 ta ko'k va 5 ta yashil shar bor. Ko'rmasdan kamida nechta shar olinsa, ular orasida albatta bir xil rangli 2 ta shar bo'ladi?", ans: "4", wrong: ["3", "2", "9"], expl: "3 xil rang bor. Eng yomon holda 3 ta shar hammasi har xil rangda bo'ladi, 4-shar esa albatta takrorlanadi: 3 + 1 = 4.", check: { expr: "3 + 1" } },
    { stem: "Baqa 7 m chuqurlikdagi quduqdan chiqmoqchi. Kunduzi 3 m yuqoriga sakraydi, kechasi 2 m pastga tushadi. Necha kunda quduqdan chiqadi?", ans: "5", wrong: ["7", "4", "6"], expl: "Har kun sof 1 m ko'tariladi. 4 kundan so'ng 4 m da bo'ladi, 5-kuni kunduzi 4 + 3 = 7 m ga yetib chiqadi: (7 − 3) ÷ 1 + 1 = 5.", check: { expr: "(7 − 3) ÷ (3 − 2) + 1" } },
  ],
];

// ---------- ENGLISH: 9 topics x 4 variants [stem, correct, w1, w2, w3, explanation] ----------
const EN = [
  [ // Present Simple
    ["My brother ... football every Saturday.", "plays", "play", "playing", "is play", "Present Simple: he/she/it bilan fe'lga -s qo'shiladi: plays."],
    ["She ... like spicy food.", "doesn't", "don't", "isn't", "not", "He/she/it bilan inkor: doesn't + fe'l asosi: She doesn't like."],
    ["... your father work in a bank?", "Does", "Do", "Is", "Are", "He/she/it bilan so'roq gap Does bilan boshlanadi: Does your father work...?"],
    ["Water ... at 100 degrees Celsius.", "boils", "boil", "is boil", "boiling", "Umumiy haqiqat Present Simple da, it bilan -s: boils."],
  ],
  [ // Present Continuous
    ["Look! The children ... in the garden now.", "are playing", "play", "plays", "played", "Look! va now — hozir davom etayotgan ish: are + fe'l-ing."],
    ["Be quiet! The baby ... .", "is sleeping", "sleeps", "sleep", "slept", "Be quiet! — hozir bo'layotgan ish: is sleeping."],
    ["What ... at the moment?", "are you doing", "do you do", "you are doing", "did you do", "Present Continuous so'roq tuzilishi: are + you + fe'l-ing."],
    ["Listen! Our teacher ... a song.", "is singing", "sings", "sing", "are singing", "Listen! — hozir davom etayotgan ish; teacher birlik: is singing."],
  ],
  [ // Past Simple
    ["Yesterday we ... to the museum.", "went", "go", "goes", "were go", "Yesterday — o'tgan zamon. go fe'lining o'tgan shakli: went."],
    ["I ... TV yesterday evening.", "watched", "watch", "watching", "am watching", "Yesterday evening — Past Simple: watch + ed = watched."],
    ["He ... any breakfast this morning.", "didn't eat", "doesn't eat", "not ate", "don't ate", "O'tgan zamon inkori: didn't + fe'l asosi: didn't eat."],
    ["I ... my keys yesterday, so I couldn't open the door.", "lost", "lose", "loses", "am losing", "Voqea o'tgan zamonda bo'lgan: lose — lost."],
  ],
  [ // have got / to be
    ["My sister ... two cats.", "has got", "have got", "is got", "haves", "She bilan have got ning shakli: has got."],
    ["We ... got a new car.", "have", "has", "are", "do", "We bilan have got: We have got."],
    ["... Anvar got a bicycle?", "Has", "Have", "Is", "Does", "Anvar (he) bilan so'roq gap: Has Anvar got...?"],
    ["There ... a lot of books on the shelf.", "are", "is", "am", "have", "There are + ko'plik ot (books)."],
  ],
  [ // comparatives / superlatives
    ["This bag is ... than that one.", "heavier", "heavyer", "more heavy", "heaviest", "Qisqa sifat: heavy — heavier (y — ier)."],
    ["Mount Everest is the ... mountain in the world.", "highest", "higher", "more high", "most high", "the bilan orttirma daraja: the highest."],
    ["Maths is ... than History for me.", "more difficult", "difficulter", "most difficult", "the more difficult", "Uzun sifat: more + sifat + than: more difficult than."],
    ["Tashkent is ... city in Uzbekistan.", "the biggest", "bigger", "more big", "biggest", "Orttirma daraja: the + biggest (big — bigger — the biggest)."],
  ],
  [ // modals
    ["You ... cross the road when the light is red.", "mustn't", "must", "can", "should", "Qizil chiroqda o'tish taqiqlanadi: mustn't (mumkin emas)."],
    ["... you swim when you were five?", "Could", "Must", "Should", "May", "O'tgan zamondagi qobiliyat: Could you swim...?"],
    ["You look tired. You ... go to bed early.", "should", "mustn't", "can't", "have got", "Maslahat berish uchun should ishlatiladi."],
    ["... I open the window, please?", "Can", "Am", "Do", "Does", "Ruxsat so'rash: Can I ...?"],
  ],
  [ // prepositions
    ["The lesson starts ... 9 o'clock.", "at", "in", "on", "by", "Aniq vaqt oldidan at: at 9 o'clock."],
    ["My birthday is ... March.", "in", "on", "at", "of", "Oy nomlari oldidan in: in March."],
    ["She is sitting ... her mother and her brother.", "between", "on", "at", "into", "Ikki kishi oralig'ida: between."],
    ["We usually play football ... Sundays.", "on", "in", "at", "to", "Hafta kunlari oldidan on: on Sundays."],
  ],
  [ // quantifiers
    ["How ... milk do you drink every day?", "much", "many", "few", "a few", "Sanalmaydigan ot (milk) bilan How much."],
    ["There aren't ... chairs in the room.", "any", "some", "much", "a little", "Inkor gapda sanaladigan ko'plik ot bilan any ishlatiladi."],
    ["I have ... friends in this city, so I feel lonely.", "few", "little", "a little", "much", "Sanaladigan ko'plik ot, \"deyarli yo'q\" ma'nosida: few friends."],
    ["Would you like ... tea?", "some", "many", "a few", "few", "Taklif qilishda some ishlatiladi; tea sanalmaydi, shuning uchun many/few mos emas."],
  ],
  [ // question words
    ["... is your birthday? - On the 5th of May.", "When", "Where", "Who", "Why", "Javob sana, shuning uchun When (qachon)."],
    ["... is that tall boy? - He is my cousin.", "Who", "Where", "When", "How many", "Javob inson haqida, shuning uchun Who (kim)."],
    ["... does the film start? - At seven.", "What time", "How far", "How many", "Whose", "Javob soat, shuning uchun What time (soat nechada)."],
    ["... is it from your school to the park? - About two kilometres.", "How far", "How old", "How much", "How many", "Masofa so'ralyapti: How far."],
  ],
];

// ---------- assemble ----------
const seen = new Set();
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const variants = [];
for (let v = 0; v < 4; v++) {
  const rngPos = mk(9000 + v * 17);
  const order = [];
  while (order.length < 40) order.push(...shuffle(rngPos, [0, 1, 2, 3]));
  const raw = [];
  math.forEach((tpl, slot) => {
    for (let salt = 0; salt < 60; salt++) {
      const r = mk(1000 * (v + 1) + slot * 31 + salt * 7919);
      const q = tpl(r, v);
      if (seen.has(norm(q.stem))) continue;
      seen.add(norm(q.stem)); raw.push({ section: "math", ...q }); return;
    }
    throw new Error(`no unique stem for slot ${slot} v${v}`);
  });
  for (const row of logic) { const q = row[v]; if (seen.has(norm(q.stem))) throw new Error("dup logic"); seen.add(norm(q.stem)); raw.push({ section: "logic", ...q }); }
  for (const row of EN) {
    const [stem, ans, w1, w2, w3, expl] = row[v]; if (seen.has(norm(stem))) throw new Error("dup english " + stem); seen.add(norm(stem));
    raw.push({ section: "english", stem, ans, wrong: [w1, w2, w3], expl, english: true });
  }
  // distinct 3 wrongs
  const questions = raw.map((q, i) => {
    const wrong = []; for (const w of q.wrong) { if (w == null || w === q.ans || wrong.includes(w)) continue; wrong.push(w); if (wrong.length === 3) break; }
    if (wrong.length < 3) throw new Error(`not enough distractors: ${q.stem}`);
    const target = order[i]; const rest = shuffle(rngPos, wrong); const texts = []; let k = 0;
    for (let p = 0; p < 4; p++) texts.push(p === target ? q.ans : rest[k++]);
    const L = ["A", "B", "C", "D"];
    const T = (s) => (q.english ? { uz: s, ru: s, en: s } : { uz: s });
    const out = {
      section: q.section, stem: T(q.stem),
      options: texts.map((t, p) => ({ id: L[p], text: T(t) })),
      correct: L[target], explanation: { uz: q.expl }, source: "new",
    };
    if (q.check) out.check = q.check;
    return out;
  });
  variants.push({
    variant: v + 1,
    title: { uz: `6-sinf · Aralash test · ${v + 1}-variant`, ru: `6 класс · Смешанный тест · Вариант ${v + 1}`, en: `Grade 6 · Mixed test · Variant ${v + 1}` },
    description: {
      uz: "Matematika, mantiq va ingliz tili bo'yicha 30 ta savol. Vaqt: 45 daqiqa.",
      ru: "30 вопросов по математике, логике и английскому языку. Время: 45 минут.",
      en: "30 questions on maths, logic and English. Time: 45 minutes.",
    },
    durationMinutes: 45, passPercent: 60, difficulty: "medium", questions,
  });
}

const notes = [
  "Maktab 6-sinf hujjatini yuklamagan: barcha savollar yangi yozilgan (source=new), uslub va qiyinlik 5-sinf testiga qarab, bir pog'ona murakkabroq qilib moslangan.",
  "Har variant: 18 matematika, 3 mantiq, 9 ingliz tili (60% / 10% / 30%); har variantda bir xil mavzu tartibi, faqat sonlar va kontekst boshqa.",
  "Taxmin qilingan o'quv dasturi mavzulari: bo'linish belgilari (9, 6, 12, 15), EKUB/EKUK, oddiy kasrlarni 3 amal bilan hisoblash, aralash sonlar, o'nli kasrlar, nisbat va proporsiya, foiz, tenglamalar, manfiy sonlarga kirish, yuz/hajm/birliklar, o'rtacha arifmetik, harakat va ish masalalari.",
  "Matematik savollar faqat o'zbek tilida (stem/options matnlari raqam va belgilardan iborat); ingliz tili savollari uz/ru/en da bir xil.",
  "O'nli kasrlarda vergul ishlatilgan (3,6), manfiy sonlar oddiy chiziqcha bilan (-5); aralash son '2 1/4' ko'rinishida.",
  "Har bir matematik/mantiq savolda `check` maydoni bor — builder uni e'tiborsiz qoldiradi; scripts/content/verify-grade-6.mjs uni mustaqil, aniq kasr arifmetikasida qayta hisoblab to'g'ri javobni tekshiradi.",
  "Mantiq bo'limi: ketma-ketlik, hafta kunlari (taqvim) va mantiqiy masala; hammasi kod orqali tekshiriladi.",
  "Ingliz tili: har variantda 9 mavzu (Present Simple, Present Continuous, Past Simple, have got/to be, comparatives/superlatives, modals, prepositions, quantifiers, question words) bittadan savol; lug'at alohida savol sifatida kiritilmadi, ba'zi savollarda lug'at kontekst ichida keladi.",
];

const outFile = join(root, "content", "quizzes", "grade-6.json");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ grade: 6, notes, variants }, null, 2) + "\n", "utf8");
console.log("Yozildi:", outFile, variants.map((x) => x.questions.length).join(","));
