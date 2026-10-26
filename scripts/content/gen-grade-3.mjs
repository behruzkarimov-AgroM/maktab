// Generates content/quizzes/grade-3.json (variant 1 = school doc, variants 2-4 = new, deterministic).
// Usage: node scripts/content/gen-grade-3.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LET = ["A", "B", "C", "D"];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let R = mulberry32(1);
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- question builders (position of correct option assigned later) ----
function N(stem, ans, cands, expl, unit = "") {
  const ds = [];
  for (const c of cands) if (Number.isInteger(c) && c > 0 && c !== ans && !ds.includes(c)) ds.push(c);
  const pool = shuffle(ds);
  let k = 1;
  while (pool.length < 3) { for (const c of [ans + k, ans - k]) if (c > 0 && c !== ans && !pool.includes(c) && pool.length < 3) pool.push(c); k++; }
  const f = (x) => (unit ? `${x} ${unit}` : String(x));
  return { section: "math", stem, correctText: f(ans), dists: pool.slice(0, 3).map(f), expl };
}
const L = (stem, correctText, dists, expl, section = "logic") => ({ section, stem, correctText, dists, expl });
const E = (stem, correctText, dists, expl) => ({ section: "english", stem, correctText, dists, expl, same: true });
const tm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---- math slots: [variant2, variant3, variant4] ----
const MATH = [
  // 1: add / subtract
  [() => { const a = ri(300, 600), b = ri(120, 290); return N(`Hisoblang: ${a} + ${b} = ?`, a + b, [a + b + 10, a + b - 10, a - b, a + b + 100], `${a} + ${b} = ${a + b}.`); },
   () => { const a = ri(500, 900), b = ri(150, 400); return N(`Hisoblang: ${a} - ${b} = ?`, a - b, [a - b + 100, a - b - 10, a + b, a - b + 10], `${a} - ${b} = ${a - b}.`); },
   () => { const a = ri(400, 800), b = ri(100, 300); return N(`Kutubxonada ${a} ta kitob bor edi. Ulardan ${b} tasini o'quvchilarga berishdi. Nechta kitob qoldi?`, a - b, [a + b, a - b + 10, a - b - 100, a - b - 10], `Qolgani: ${a} - ${b} = ${a - b} ta.`, "ta"); }],
  // 2: multiplication
  [() => { const a = ri(6, 9), b = ri(6, 9); return N(`${a} × ${b} = ?`, a * b, [a * b + a, a * b - b, a * b + 10, a + b], `${a} × ${b} = ${a * b} (ko'paytirish jadvali).`); },
   () => { const a = ri(4, 9), b = ri(6, 9); return N(`Do'konda ${a} ta qutida ${b} tadan qalam bor. Jami nechta qalam bor?`, a * b, [a + b, a * b + b, a * b - a, a * b + 10], `${a} qutida ${b} tadan: ${a} × ${b} = ${a * b} ta.`, "ta"); },
   () => { const a = ri(6, 9), b = ri(6, 9); return N(`? × ${b} = ${a * b}. Savol belgisi o'rniga qaysi son kerak?`, a, [a + 1, a - 1, b, a + 2], `${a * b} : ${b} = ${a}, chunki ${a} × ${b} = ${a * b}.`); }],
  // 3: division
  [() => { const b = ri(6, 9), a = ri(4, 9); return N(`${a * b} ÷ ${b} = ?`, a, [a + 1, a - 1, a + 2, b], `${a * b} : ${b} = ${a}, chunki ${a} × ${b} = ${a * b}.`); },
   () => { const b = ri(4, 8), a = ri(5, 9); return N(`${a * b} ta olma ${b} ta savatga teng bo'lib solindi. Har bir savatda nechta olma bor?`, a, [a + 1, a - 1, a * b, a + b], `${a * b} : ${b} = ${a} ta.`, "ta"); },
   () => { const b = ri(3, 8), a = ri(6, 12); return N(`${a * b} sm uzunlikdagi arqonni ${b} sm dan bo'laklarga kesishdi. Nechta bo'lak chiqdi?`, a, [a + 1, a - 1, a * b - b, a + b], `${a * b} : ${b} = ${a} ta bo'lak.`, "ta"); }],
  // 4: order of operations
  [() => { const a = ri(10, 40), b = ri(3, 9), c = ri(3, 9); return N(`Hisoblang: ${a} + ${b} × ${c}`, a + b * c, [(a + b) * c, a * b + c, a + b + c, a + b * c + 10], `Avval ko'paytiramiz: ${b} × ${c} = ${b * c}; keyin ${a} + ${b * c} = ${a + b * c}.`); },
   () => { const a = ri(12, 30), b = ri(3, 9), c = ri(3, 8); return N(`Hisoblang: (${a} + ${b}) × ${c}`, (a + b) * c, [a + b * c, a * b + c, (a + b) * c + c, (a + b) * c - 10], `Avval qavs ichi: ${a} + ${b} = ${a + b}; keyin ${a + b} × ${c} = ${(a + b) * c}.`); },
   () => { const a = ri(6, 9), b = ri(5, 9), c = ri(5, 30); return N(`Hisoblang: ${a} × ${b} - ${c}`, a * b - c, [a * b + c, a * (b - c), a + b - c, a * b - c + 10], `Avval ko'paytiramiz: ${a} × ${b} = ${a * b}; keyin ${a * b} - ${c} = ${a * b - c}.`); }],
  // 5: equations
  [() => { const a = ri(120, 400), b = a + ri(100, 400); return N(`Tenglamani yeching: x + ${a} = ${b}`, b - a, [a + b, b - a + 10, b - a - 10, b - a + 100], `x = ${b} - ${a} = ${b - a}.`); },
   () => { const a = ri(500, 900), b = ri(100, 400); return N(`Tenglamani yeching: ${a} - x = ${b}`, a - b, [a + b, a - b + 10, a - b - 10, a - b + 100], `x = ${a} - ${b} = ${a - b}.`); },
   () => { const k = pick([2, 3, 4, 5]), x = ri(10, 50), a = ri(5, 30), b = k * x + a; return N(`Tenglamani yeching: ${k} × x + ${a} = ${b}`, x, [b - a, x + a, x + 1, x - 1], `${k} × x = ${b} - ${a} = ${b - a}; x = ${b - a} : ${k} = ${x}.`); }],
  // 6: comparison word problems
  [() => { const a = ri(12, 40), k = pick([2, 3, 4, 5]); return N(`Sherzodda ${a} ta marka bor. Dilshodda Sherzoddagidan ${k} marta ko'p marka bor. Dilshodda nechta marka bor?`, a * k, [a + k, a * (k + 1), a * k - 10, a * k + 10], `${a} × ${k} = ${a * k} ta.`, "ta"); },
   () => { const k = pick([2, 3, 4, 5]), m = ri(5, 15), tot = k * m; return N(`Bog'da ${tot} ta olma daraxti bor. Nok daraxtlari olma daraxtlaridan ${k} marta kam. Bog'da nechta nok daraxti bor?`, m, [tot - k, tot * k, m + 1, m - 1], `${tot} : ${k} = ${m} ta.`, "ta"); },
   () => { const a = ri(15, 30), d = ri(3, 9); return N(`Nigoraning ${a} ta qo'g'irchog'i bor. Zilolaning qo'g'irchoqlari Nigoranikidan ${d} ta kam. Ikkalasida jami nechta qo'g'irchoq bor?`, 2 * a - d, [2 * a, 2 * a + d, a - d, a + d], `Zilolada ${a} - ${d} = ${a - d} ta; jami ${a} + ${a - d} = ${2 * a - d} ta.`, "ta"); }],
  // 7: number facts
  [() => N(`Eng katta uch xonali son va eng kichik ikki xonali son yig'indisi nechaga teng?`, 1009, [1099, 1000, 1019, 1109], `Eng katta uch xonali son 999, eng kichik ikki xonali son 10. 999 + 10 = 1009.`),
   () => N(`Eng kichik uch xonali son bilan eng katta bir xonali sonning yig'indisini toping.`, 109, [99, 119, 199, 110], `Eng kichik uch xonali son 100, eng katta bir xonali son 9. 100 + 9 = 109.`),
   () => N(`Eng katta uch xonali son eng kichik uch xonali sondan qancha ortiq?`, 899, [900, 898, 999, 799], `999 - 100 = 899.`)],
  // 8: age / years
  [() => { const m = ri(32, 40), d = ri(6, 10), k = ri(2, 5); return N(`Ona ${m} yoshda, qizi ${d} yoshda. ${k} yildan keyin qizi onasidan necha yosh kichik bo'ladi?`, m - d, [m - d + k, m - d - k, m + d, m - d + 1], `Yosh farqi hech qachon o'zgarmaydi: ${m} - ${d} = ${m - d} yosh.`, "yosh"); },
   () => { const y = ri(2, 6), age = ri(5, 9), b = 2025 - y - age; return N(`Hozir 2025-yil. Aziza ${y} yil avval ${age} yoshda edi. Aziza nechanchi yilda tug'ilgan?`, b, [2025 - age, b + 1, b - 1, 2025 - y + age], `${y} yil avval: 2025 - ${y} = ${2025 - y}-yil. Tug'ilgan yil: ${2025 - y} - ${age} = ${b}.`); },
   () => { const a = ri(8, 10), d = ri(3, 6), e = d + ri(3, 6); return N(`Dilnoza ${a} yoshda. Akasi undan ${d} yosh katta, ukasi esa akasidan ${e} yosh kichik. Ukasi necha yoshda?`, a + d - e, [a + d + e, a - e + 0 === a + d - e ? a + 2 : a - e, a + d, a + d - e + 1], `Akasi: ${a} + ${d} = ${a + d}. Ukasi: ${a + d} - ${e} = ${a + d - e}.`, "yosh"); }],
  // 9: perimeter / area
  [() => { const a = ri(8, 25), b = ri(4, a - 1); return N(`To'g'ri to'rtburchakning uzunligi ${a} sm, eni ${b} sm. Uning perimetrini toping.`, 2 * (a + b), [a + b, a * b, 2 * a + b, 2 * (a + b) + 4], `P = 2 × (${a} + ${b}) = 2 × ${a + b} = ${2 * (a + b)} sm.`, "sm"); },
   () => { const a = ri(6, 15), b = ri(3, a - 1); return N(`Uzunligi ${a} sm va eni ${b} sm bo'lgan to'g'ri to'rtburchakning yuzini toping.`, a * b, [2 * (a + b), a + b, a * b + a, a * b - b], `S = ${a} × ${b} = ${a * b} sm^2.`, "sm^2"); },
   () => { const a = ri(10, 25), b = ri(4, a - 1), P = 2 * (a + b); return N(`To'g'ri to'rtburchakning perimetri ${P} sm, uzunligi ${a} sm. Uning eni necha sm?`, b, [P / 2, P - a, 2 * b, b + 1], `Yarim perimetr: ${P} : 2 = ${P / 2} sm. Eni: ${P / 2} - ${a} = ${b} sm.`, "sm"); }],
  // 10: time
  [() => { const h = ri(2, 4), m = pick([10, 15, 20, 30, 40, 45]); return N(`${h} soat ${m} minut necha minut bo'ladi?`, 60 * h + m, [h + m, 100 * h + m, 60 * h + m + 10, 60 * h], `${h} soat = ${60 * h} minut; ${60 * h} + ${m} = ${60 * h + m} minut.`, "minut"); },
   () => { const d = ri(2, 5), x = ri(2, 6); return N(`${d} hafta ${x} kun jami necha kun bo'ladi?`, 7 * d + x, [10 * d + x, d + x, 7 * d, 7 * d + x + 7], `1 hafta = 7 kun; ${d} × 7 = ${7 * d}; ${7 * d} + ${x} = ${7 * d + x} kun.`, "kun"); },
   () => {
     const H = ri(13, 17), m0 = pick([0, 10, 20, 30, 40, 50]), dur = pick([70, 80, 90, 100, 110, 95]);
     const st = H * 60 + m0, en = st + dur;
     const cands = [en + 10, en - 10, en + 20, st + Math.floor(dur / 60) * 100 % 1440];
     const ds = [];
     for (const c of cands) if (c !== en && !ds.includes(c)) ds.push(c);
     const pool = shuffle(ds).slice(0, 3);
     return { section: "math", stem: `Film soat ${tm(st)} da boshlandi va ${dur} minut davom etdi. U soat nechada tugadi?`, correctText: tm(en), dists: pool.map(tm), expl: `${dur} minut = ${Math.floor(dur / 60)} soat ${dur % 60} minut. ${tm(st)} + ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")} = ${tm(en)}.` };
   }],
  // 11: money
  [() => { const p = pick([1500, 2000, 2500, 3000]), k = ri(3, 6); return N(`Bitta daftar ${p} so'm turadi. ${k} ta daftar necha so'm bo'ladi?`, p * k, [p + k, p * k + p, p * k - p, p * k + 500], `${p} × ${k} = ${p * k} so'm.`, "so'm"); },
   () => { const a = pick([2500, 3000, 3500]), b = pick([1500, 2000, 4000, 4500]), P = 10000; return N(`Ali ${P} so'm bilan do'konga bordi. U ${a} so'mlik non va ${b} so'mlik sut sotib oldi. Unda qancha pul qoldi?`, P - a - b, [P - a, P - b, a + b, P - a - b + 500], `Xarajat: ${a} + ${b} = ${a + b}; qoldi: ${P} - ${a + b} = ${P - a - b} so'm.`, "so'm"); },
   () => { const p = pick([8000, 9000, 12000, 15000]), k = ri(2, 5); return N(`Sotuvchi ${k} kg uzumni ${p * k} so'mga sotdi. 1 kg uzum necha so'm turadi?`, p, [p * k, p + 1000, p - 1000, p + 500], `${p * k} : ${k} = ${p} so'm.`, "so'm"); }],
  // 12: measures
  [() => { const a = ri(2, 9), b = ri(5, 90); return N(`${a} m ${b} sm necha santimetr bo'ladi?`, 100 * a + b, [10 * a + b, 1000 * a + b, a + b, 100 * a + b + 10], `1 m = 100 sm; ${a} × 100 = ${100 * a}; ${100 * a} + ${b} = ${100 * a + b} sm.`, "sm"); },
   () => { const a = ri(2, 6), b = ri(2, 18) * 50; return N(`${a} kg ${b} g necha gramm bo'ladi?`, 1000 * a + b, [100 * a + b, a + b, 1000 * a + b + 100, 1000 * a - b], `1 kg = 1000 g; ${a} × 1000 = ${1000 * a}; ${1000 * a} + ${b} = ${1000 * a + b} g.`, "g"); },
   () => { const a = ri(1, 3), b = ri(2, 8) * 50, c = ri(2, 8) * 50 - 0; const tot = 1000 * a + b; return N(`Idishda ${a} l ${b} ml sharbat bor edi. Undan ${c} ml ichishdi. Idishda necha ml sharbat qoldi?`, tot - c, [tot + c, tot - c + 100, 100 * a + b - c, tot - c - 100], `1 l = 1000 ml; ${tot} - ${c} = ${tot - c} ml.`, "ml"); }],
  // 13: multi-step word problems
  [() => { const a = ri(40, 90), b = ri(30, 80), c = ri(20, 70); return N(`Qutida ${a} ta qizil va ${b} ta ko'k shar bor edi. Bolalarga ${c} ta shar tarqatildi. Nechta shar qoldi?`, a + b - c, [a + b + c, a - b + c, a + b - c + 10, a + b - c - 10], `Jami: ${a} + ${b} = ${a + b}; qoldi: ${a + b} - ${c} = ${a + b - c} ta.`, "ta"); },
   () => { const a = ri(30, 50), b = ri(5, 20), c = ri(5, 25); return N(`Avtobusda ${a} yo'lovchi bor edi. Bekatda ${b} kishi tushdi, ${c} kishi chiqdi. Avtobusda nechta yo'lovchi bo'ldi?`, a - b + c, [a + b - c, a - b - c, a + b + c, a - b + c + 10], `${a} - ${b} = ${a - b}; ${a - b} + ${c} = ${a - b + c} ta.`, "ta"); },
   () => { const a = ri(8, 20), b = ri(10, 25); return N(`Hovlida ${a} ta quyon va ${b} ta tovuq bor. Hayvonlarning jami oyoqlari nechta?`, 4 * a + 2 * b, [a + b, 2 * a + 4 * b, 6 * (a + b), 4 * a + 2 * b + 4], `Quyonlar: ${a} × 4 = ${4 * a}; tovuqlar: ${b} × 2 = ${2 * b}; jami ${4 * a + 2 * b} ta.`, "ta"); }],
];

// ---- logic slots ----
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const letterQ = (start, step) => {
  const seq = [0, 1, 2, 3].map((i) => ALPHA[start + i * step]);
  const ans = start + 4 * step;
  const ds = [ans + 1, ans - 1, ans + 2, ans - 2].filter((i) => i >= 0 && i < 26 && i !== ans).map((i) => ALPHA[i]);
  return L(`Harflar qatorini davom ettiring (ingliz alifbosi): ${seq.join(", ")}, ?`, ALPHA[ans], ds.slice(0, 3), `Har harf alifboda ${Math.abs(step)} harf ${step > 0 ? "keyin" : "oldin"} turadi. Keyingi harf: ${ALPHA[ans]}.`);
};
const LOGIC = [
  // 1: number sequence
  [() => { const s = ri(2, 9), d = ri(3, 6), t = [0, 1, 2, 3].map((i) => s + i * d), ans = s + 4 * d; return L(`Qatorni davom ettiring: ${t.join(", ")}, ?`, String(ans), [ans + 1, ans - 1, ans + d, ans - 2].map(String), `Har safar ${d} ga ortadi. ${t[3]} + ${d} = ${ans}.`); },
   () => { const d = ri(4, 7), s = 40 + ri(0, 6) * d / d * d, t = [0, 1, 2, 3].map((i) => s - i * d), ans = s - 4 * d; return L(`Qatorni davom ettiring: ${t.join(", ")}, ?`, String(ans), [ans + 1, ans - 1, ans + d, ans - d].map(String), `Har safar ${d} ga kamayadi. ${t[3]} - ${d} = ${ans}.`); },
   () => { const s = ri(1, 4), t = [0, 1, 3, 6, 10].map((x) => s + x), ans = s + 15; return L(`Qatorni davom ettiring: ${t.join(", ")}, ?`, String(ans), [ans + 1, ans - 1, ans - 2, ans + 2].map(String), `Orttirma 1, 2, 3, 4 bo'lib boradi, keyingisi 5: ${t[4]} + 5 = ${ans}.`); }],
  // 2: letters
  [() => letterQ(0, 2), () => letterQ(25, -2), () => letterQ(1, 3)],
  // 3: odd one out
  [() => L(`Qaysi so'z ortiqcha: olma, nok, sabzi, uzum?`, "sabzi", ["olma", "nok", "uzum"], `Olma, nok va uzum — mevalar, sabzi esa sabzavot.`),
   () => L(`Qaysi son ortiqcha: 16, 24, 32, 27?`, "27", ["16", "24", "32"], `16, 24 va 32 sonlari 8 ga bo'linadi, 27 esa bo'linmaydi.`),
   () => L(`Qaysi so'z ortiqcha: stol, stul, shkaf, non?`, "non", ["stol", "stul", "shkaf"], `Stol, stul va shkaf — mebel, non esa ovqat.`)],
  // 4: ordering reasoning
  [() => L(`Ali Validan baland, Vali Samidan baland, Soli esa Samidan past. Ularning eng baland bo'ylisi kim?`, "Ali", ["Vali", "Sami", "Soli"], `Tartib: Ali > Vali > Sami > Soli. Eng baland — Ali.`),
   () => L(`Bobur Karimdan oldin, Karim Doniyordan oldin, Doniyor esa Farhoddan oldin marraga yetib keldi. Kim oxirgi bo'lib yetib keldi?`, "Farhod", ["Bobur", "Karim", "Doniyor"], `Tartib: Bobur, Karim, Doniyor, Farhod. Oxirgisi — Farhod.`),
   () => L(`Lola Malikadan katta, Malika Nargizadan katta, Nargiza esa Dilfuzadan katta. Yoshi bo'yicha eng kattasidan keyingi, ikkinchi katta kim?`, "Malika", ["Lola", "Nargiza", "Dilfuza"], `Tartib (kattadan kichikka): Lola, Malika, Nargiza, Dilfuza. Ikkinchisi — Malika.`)],
  // 5: think of a number
  [() => { const n = ri(5, 12), m = pick([3, 4, 5]), c = ri(3, 9), r = n * m + c; return L(`Men bir son o'yladim. Uni ${m} ga ko'paytirib, ${c} ni qo'shsam, ${r} chiqdi. Men qaysi sonni o'yladim?`, String(n), [r - c, n + 1, n - 1, r + c].map(String), `Teskari yo'l: ${r} - ${c} = ${r - c}; ${r - c} : ${m} = ${n}.`); },
   () => { const n = ri(6, 14), m = pick([3, 4, 5]), c = ri(3, 9), r = n * m - c; return L(`Men o'ylagan sonni ${m} ga ko'paytirib, natijadan ${c} ni ayirsam, ${r} chiqdi. Men qaysi sonni o'yladim?`, String(n), [r + c, n + 1, n - 1, r - c].map(String), `Teskari yo'l: ${r} + ${c} = ${r + c}; ${r + c} : ${m} = ${n}.`); },
   () => { const m = pick([3, 4, 5]), q = ri(5, 12), c = ri(3, 9), n = m * q, r = q + c; return L(`Men o'ylagan sonni ${m} ga bo'lib, ${c} ni qo'shsam, ${r} chiqdi. Men qaysi sonni o'yladim?`, String(n), [r - c, n + m, r * m, n - m].map(String), `Teskari yo'l: ${r} - ${c} = ${q}; ${q} × ${m} = ${n}.`); }],
  // 6: weekdays
  [() => { const i = ri(0, 6), k = ri(2, 5); return L(`Bugun ${DAYS[i].toLowerCase()}. ${k} kundan keyin qaysi kun bo'ladi?`, DAYS[(i + k) % 7], [1, 2, 3, 4, 5, 6].map((x) => DAYS[(i + k + x) % 7]), `${DAYS[i]}dan ${k} kun sanaymiz: ${DAYS[(i + k) % 7]}.`); },
   () => { const i = ri(0, 6); return L(`Kecha ${DAYS[i].toLowerCase()} edi. Ertaga qaysi kun bo'ladi?`, DAYS[(i + 2) % 7], [1, 3, 4, 5, 6].map((x) => DAYS[(i + 2 + x) % 7]), `Kecha ${DAYS[i].toLowerCase()} bo'lsa, bugun ${DAYS[(i + 1) % 7].toLowerCase()}, ertaga ${DAYS[(i + 2) % 7].toLowerCase()}.`); },
   () => { const i = ri(0, 6), k = ri(2, 5); return L(`Bugun ${DAYS[i].toLowerCase()}. ${k} kun oldin qaysi kun edi?`, DAYS[(i - k + 14) % 7], [1, 2, 3, 4, 5, 6].map((x) => DAYS[(i - k + x + 14) % 7]), `${DAYS[i]}dan ${k} kun orqaga sanaymiz: ${DAYS[(i - k + 14) % 7]}.`); }],
];
// shuffle distractors of weekday questions later (N picks first 3 only after shuffle here)
const fixDay = (q) => ({ ...q, dists: shuffle(q.dists).slice(0, 3) });
const fixDays = (q) => (q.stem.includes("qaysi kun") ? fixDay(q) : q);

// ---- English (static, per variant) ----
const EN = [
  [ // variant 2
    E("That … my brother.", "is", ["am", "are", "have"], "Birlik son, 3-shaxs (that) bilan 'is' ishlatiladi: That is my brother."),
    E("We … students.", "are", ["is", "am", "has"], "We (biz) bilan 'are' ishlatiladi: We are students."),
    E("… name is Anvar.", "His", ["He", "They", "We"], "Egalik olmoshi kerak: 'His name' — uning ismi."),
    E("There … two cats under the chair.", "are", ["is", "am", "has"], "Ko'plik (two cats) bilan 'There are' ishlatiladi."),
    E("She … a red bag.", "has", ["have", "are", "do"], "She (u, qiz) bilan 'has' ishlatiladi: She has a red bag."),
    E("I … milk every morning.", "drink", ["drinks", "drinking", "to drink"], "I bilan fe'l o'zgarmaydi (Present Simple): I drink milk."),
    E("One book, two …", "books", ["bookes", "bookies", "bookis"], "Ko'plik odatda -s qo'shimchasi bilan yasaladi: books."),
    E("We go … school by bus.", "to", ["in", "on", "at"], "'Go to school' — maktabga borish."),
    E("Which word is a fruit?", "apple", ["dog", "pencil", "chair"], "Apple — olma, bu meva. Dog — it, pencil — qalam, chair — stul."),
    E("Can you swim? Yes, I …", "can", ["do", "am", "are"], "'Can' bilan so'ralgan savolga 'Yes, I can' deb javob beriladi."),
  ],
  [ // variant 3
    E("My mother … a teacher.", "is", ["am", "are", "have"], "Birlik son, 3-shaxs (my mother) bilan 'is' ishlatiladi."),
    E("They … my friends.", "are", ["is", "am", "has"], "They (ular) bilan 'are' ishlatiladi: They are my friends."),
    E("… is my pencil case.", "This", ["These", "Those", "They"], "Birlik son uchun 'This is' ishlatiladi: This is my pencil case."),
    E("There … a lamp on the desk.", "is", ["are", "am", "have"], "Birlik son (a lamp) bilan 'There is' ishlatiladi."),
    E("He … two brothers.", "has", ["have", "are", "do"], "He (u, o'g'il bola) bilan 'has' ishlatiladi: He has two brothers."),
    E("My sister … TV in the evening.", "watches", ["watch", "watchs", "watching"], "3-shaxs birlikda fe'lga -es qo'shiladi: watches."),
    E("One child, two …", "children", ["childs", "childrens", "childes"], "'Child' ning ko'pligi tartibsiz: children."),
    E("We have lunch … one o'clock.", "at", ["in", "on", "to"], "Soat oldidan 'at' ishlatiladi: at one o'clock."),
    E("Which word is an animal?", "rabbit", ["pencil", "bread", "desk"], "Rabbit — quyon, bu hayvon. Pencil — qalam, bread — non, desk — parta."),
    E("Can a fish fly? No, it …", "can't", ["isn't", "doesn't", "aren't"], "'Can' bilan so'ralgan savolga inkor javob: No, it can't."),
  ],
  [ // variant 4
    E("I … ten years old.", "am", ["is", "are", "has"], "I (men) bilan 'am' ishlatiladi: I am ten years old."),
    E("You … my best friend.", "are", ["is", "am", "has"], "You (sen) bilan 'are' ishlatiladi."),
    E("… are my shoes.", "These", ["This", "That", "It"], "Ko'plik (shoes) uchun 'These are' ishlatiladi."),
    E("There … some milk in the glass.", "is", ["are", "am", "have"], "Sanalmaydigan ot (milk) bilan 'There is' ishlatiladi."),
    E("We … a big garden.", "have", ["has", "am", "does"], "We (biz) bilan 'have' ishlatiladi: We have a big garden."),
    E("Dilnoza … to school every day.", "goes", ["go", "going", "gos"], "3-shaxs birlikda 'go' fe'li 'goes' bo'ladi."),
    E("One box, two …", "boxes", ["boxs", "boxies", "boxen"], "-x bilan tugagan otlarga -es qo'shiladi: boxes."),
    E("Put the books … your bag.", "in", ["at", "to", "with"], "'Put in the bag' — sumkaga (ichiga) solish."),
    E("Which word is a colour?", "green", ["table", "dog", "milk"], "Green — yashil, bu rang. Table — stol, dog — it, milk — sut."),
    E("Is she your sister? Yes, she …", "is", ["am", "are", "has"], "'Is she ...?' savoliga: Yes, she is."),
  ],
];

// ---- variant 1 (school's own, solved) ----
const op = (arr, ci) => arr.map((t, i) => ({ id: LET[i], text: { uz: t } })).map((o, i) => ({ ...o, _c: i === ci }));
const D = (stem, texts, correct, expl, section, extra = {}) => ({ section, stem, texts, correct, expl, ...extra });
const V1 = [
  D(`Ikki sonning yig'indisi 103 ga teng bo'lsa, ular quyidagilardan qaysi biriga teng bo'lishi mumkin?`, ["46 va 67", "28 va 95", "21 va 98", "78 va 25"], "D", `78 + 25 = 103. Qolganlari: 46 + 67 = 113, 28 + 95 = 123, 21 + 98 = 119.`, "math"),
  D(`Hisoblang: 17 · (88 - 36 : 2 - 60)`, ["160", "170", "180", "115"], "B", `Avval bo'lish: 36 : 2 = 18. Qavs ichi: 88 - 18 - 60 = 10. Keyin 17 · 10 = 170.`, "math"),
  D(`Tenglamani yeching: 465 - 2a = 321`, ["144", "78", "72", "156"], "C", `2a = 465 - 321 = 144; a = 144 : 2 = 72.`, "math"),
  D(`10 kg yog'ochdan 3 ta o'yinchoq yasash mumkin. 40 kg yog'ochdan nechta o'yinchoq yasash mumkin?`, ["12 ta", "14 ta", "10 ta", "18 ta"], "A", `40 : 10 = 4 marta ko'p; 4 · 3 = 12 ta.`, "math"),
  D(`Quyidagi harflarni davom ettiring: B, I, U, T, B, O, …`, ["O, S", "Y, S", "O, Y", "S, N"], "B", `Harflar — o'zbekcha sonlarning bosh harflari: Bir, Ikki, Uch, To'rt, Besh, Olti. Keyingilari: Yetti, Sakkiz — Y, S.`, "logic"),
  D(`Alining kitoblari soni Valining kitoblaridan 2 marta ko'p. Agar Valining 18 ta kitobi bo'lsa, Alining kitoblari nechta?`, ["18 ta", "9 ta", "36 ta", "20 ta"], "C", `18 · 2 = 36 ta.`, "math"),
  D(`Eng kichik to'rt xonali son va eng katta ikki xonali sonlar yig'indisi 900 dan qancha ortiq?`, ["99", "110", "199", "222"], "C", `1000 + 99 = 1099; 1099 - 900 = 199.`, "math"),
  D(`Hozir 2022-yil. Nodir 23 yil avval 4 yoshda edi. Nodir nechanchi yil tug'ilgan?`, ["2003", "1997", "1995", "1996"], "C", `23 yil avval: 2022 - 23 = 1999-yil. U yerda 4 yoshda edi: 1999 - 4 = 1995.`, "math"),
  D(`To'g'ri to'rtburchakning yuzi S = 132 sm^2 va bo'yi b = 12 sm ekani ma'lum. Uning perimetrini aniqlang.`, ["46 sm", "36 sm", "48 sm", "23 sm"], "A", `Eni: 132 : 12 = 11 sm. Perimetr: 2 · (12 + 11) = 46 sm.`, "math"),
  D(`4 raqami bilan tugaydigan ikki xonali sonlar nechta?`, ["9 ta", "18 ta", "10 ta", "19 ta"], "A", `14, 24, 34, 44, 54, 64, 74, 84, 94 — jami 9 ta.`, "math"),
  D(`2 hafta 72 soat 4320 minut necha sutka?`, ["17", "21", "20", "19"], "C", `2 hafta = 14 sutka; 72 soat = 3 sutka; 4320 minut = 72 soat = 3 sutka. 14 + 3 + 3 = 20.`, "math"),
  D(`Nozima Charosdan 8 yoshga, Shoiradan 5 yoshga katta. Muslima 14 yoshda bo'lib, u Charosdan 3 yoshga kichik. Shoiraning yoshini aniqlang.`, ["30", "25", "20", "23"], "C", `Charos: 14 + 3 = 17. Nozima: 17 + 8 = 25. Shoira: 25 - 5 = 20.`, "math"),
  D(`Bahorda polizga 20 kg kartoshka urug'i ekilsa, kuzga kelib undan 140 kg hosil olish mumkin. Polizdan 770 kg kartoshka olish uchun bahorda necha kg urug' ekish kerak?`, ["70 kg", "100 kg", "110 kg", "590 kg"], "C", `140 : 20 = 7 — hosil urug'dan 7 marta ko'p. 770 : 7 = 110 kg.`, "math"),
  D(`Fermada 12 ta qo'y va 21 ta tovuq bor. Hayvonlarning jami oyoqlari nechta?`, ["66", "90", "86", "72"], "B", `Qo'ylar: 12 · 4 = 48. Tovuqlar: 21 · 2 = 42. Jami 48 + 42 = 90.`, "math"),
  D(`Agar Akmal Sobirdan baland bo'lsa, Karim esa Zokirdan pastroq, lekin Akmaldan balandroq bo'lsa, ularning eng past bo'ylisi kim?`, ["Sobir", "Akmal", "Karim", "Zokir"], "A", `Sobir < Akmal < Karim < Zokir. Eng past — Sobir.`, "logic"),
  D(`Bir g'aroyib shaharda yo'lning o'ng tomonidagi uylar nomeri barchasi toq sonlar. Ammo shahardagilar uylarni nomerlashda 3 raqamidan foydalanishmaydi. O'ng tomondagi 1-uyning nomeri 1 bo'lsa, 15-uyning nomerini toping.`, ["47", "41", "43", "45"], "A", `3 raqami yo'q toq sonlar: 1, 5, 7, 9, 11, 15, 17, 19, 21, 25, 27, 29, 41, 45, 47. 15-si — 47.`, "logic"),
  D(`Barcha bank mijozlari keksalar. Hamma keksalar boy. Quyidagilardan qaysi biri to'g'ri bo'lishi kerak?`, ["Barcha boylar keksa", "Barcha keksa odamlar bank mijozlari", "Barcha yoshlar kambag'aldir", "Barcha bank mijozlari boy"], "D", `Mijoz → keksa → boy. Demak, barcha bank mijozlari boy. Boshqa variantlar shartdan kelib chiqmaydi.`, "logic"),
  D(`Har doim to'g'ri bo'lgan mulohazani toping.`, ["14 yoshli qiz bolaning bo'yi 10 yoshli qiz bolaning bo'yidan uzunroq.", "14 yoshli qiz bola hayotida bir marta hozirgi bo'yining yarmiga teng bo'lgan.", "Butun sonning o'zini o'ziga ko'paytirganda natija juft son bo'ladi.", "Butun sonning o'zini o'ziga qo'shganda natija toq son bo'ladi."], "B", `Bola o'sib boradi, shuning uchun hozirgi bo'yining yarmiga teng bo'lgan payti albatta bo'lgan. Boshqalar noto'g'ri: 3 · 3 = 9 (toq), 4 + 4 = 8 (juft); bo'y har doim ham uzun emas.`, "logic"),
  D(`Dastlabki suv ostiga sho'ng'ish kostyumining og'irligi taxminan 380 kilogrammni tashkil qilgan. Har biri 80 kg vaznli, shunday kostyum kiygan 3 ta g'ovvosni tortib olish uchun yuk ko'tarish krani qancha og'irlikni ko'tarishiga to'g'ri kelgan?`, ["680 kg", "1220 kg", "620 kg", "1380 kg"], "D", `Bitta g'ovvos kostyumi bilan: 380 + 80 = 460 kg. Uchtasi: 3 · 460 = 1380 kg.`, "logic"),
  D(`This … my sister.`, ["is", "am", "are", "we"], "A", `'This' (bu) birlik son, shuning uchun 'is': This is my sister.`, "english", { en: true }),
  D(`Are … a doctor?`, ["he", "you", "I", "she"], "B", `'Are' faqat 'you' (sen/siz) bilan keladi: Are you a doctor?`, "english", { en: true }),
  D(`… name is Odina.`, ["I", "we", "they", "her"], "D", `Egalik olmoshi kerak: 'her name' — uning (qiz bolaning) ismi.`, "english", { en: true }),
  D(`There … a blanket on the bed.`, ["is", "are", "am", "his"], "A", `Birlik son (a blanket) bilan 'There is' ishlatiladi.`, "english", { en: true }),
  D(`There … books on the table.`, ["is", "are", "am", "his"], "B", `Ko'plik (books) bilan 'There are' ishlatiladi.`, "english", { en: true }),
  D(`School is closed on Sunday. I … go to school on Sunday.`, ["usually", "never", "sometimes", "always"], "B", `Yakshanba kuni maktab yopiq, shuning uchun 'never' (hech qachon): I never go to school on Sunday.`, "english", { en: true }),
  D(`It … cold.`, ["is", "am", "are", "have"], "A", `'It' bilan 'is' ishlatiladi: It is cold.`, "english", { en: true }),
  D(`I … football.`, ["eat", "do", "play", "swim"], "C", `Futbol 'play' fe'li bilan keladi: I play football.`, "english", { en: true }),
  D(`I … swim.`, ["can", "am", "do", "have"], "A", `'Can' (qila olaman) dan keyin fe'l keladi: I can swim.`, "english", { en: true }),
  D(`The ladybird can fly … walk, too.`, ["do", "but", "with", "and"], "D", `Ikki imkoniyatni qo'shish uchun 'and' ishlatiladi: can fly and walk.`, "english", { en: true }),
];

const NOTES = [
  `Savol 10 ("Ushbu shaklda nechta kvadrat mavjud?") shaklga bog'liq bo'lgani uchun tushirib qoldirildi; sayt hozircha rasmli savolni faqat rasm bilan ko'rsata oladi. 1-variantda 29 ta savol bor.`,
  `Savol 5 (B, I, U, T, B, O ...) hujjatda "matematika" bo'limida edi; u mantiqiy qator bo'lgani uchun "mantiq" bo'limiga o'tkazildi. Javob: Y, S (Bir, Ikki, Uch, To'rt, Besh, Olti, Yetti, Sakkiz sonlarining bosh harflari). Maktab shu mantiqni nazarda tutganini tasdiqlasin.`,
  `Savol 20 (g'ovvoslar va kran) noaniq edi: 380 kg faqat bitta kostyumning og'irligimi yoki har bir g'ovvosniki — aniq emas edi (620 va 1380 ikkalasi ham to'g'ri chiqishi mumkin edi). Savol matni "har biri 80 kg vaznli, shunday kostyum kiygan 3 ta g'ovvos" deb aniqlashtirildi; to'g'ri javob 3 · (380 + 80) = 1380 kg. Maktabning o'z javobi boshqacha bo'lsa, shu savolni tekshirib bering.`,
  `Savol 26 ("I ... go to school on Sunday") da to'rttala so'z ham grammatik jihatdan to'g'ri edi (usually, never, sometimes, always). Yagona javob qolishi uchun matn boshiga "School is closed on Sunday." jumlasi qo'shildi; to'g'ri javob "never".`,
  `Savol 30 ("The ladybird can fly ... walk") da "and" va "but" ikkalasi ham mumkin edi. Aniqlik uchun matn oxiriga "too" qo'shildi: "can fly ... walk, too"; to'g'ri javob "and".`,
  `Savol 24 va 25 dagi variantlarning bosh harfi ("Is") kichik harfga o'zgartirildi, savol matnidagi bosh harflar ("A blanket", "Books") ham kichik harfga to'g'rilandi; ma'nosi o'zgarmadi.`,
  `Boshqa o'zgarishlar faqat imlo: 17-savolda "yo'Ining" -> "yo'lning", "I-uy" -> "1-uy"; 19-savolda "bo'Igan" -> "bo'lgan"; 20-savolda "tahminan" -> "taxminan"; 4-savolga savol belgisi qo'shildi; 16-savolga vergul qo'yildi.`,
];

// ---- assemble ----
function plan(n, rot) {
  const base = Math.floor(n / 4), extra = n % 4;
  const arr = [];
  LET.forEach((L, i) => { const c = base + ((i - rot + 4) % 4 < extra ? 1 : 0); for (let k = 0; k < c; k++) arr.push(L); });
  return shuffle(arr);
}
function build(q, letter) {
  const dists = [...q.dists];
  const opts = [];
  for (const l of LET) opts.push(l === letter ? q.correctText : dists.shift());
  const t = (s) => (q.same ? { uz: s, ru: s, en: s } : { uz: s });
  return {
    section: q.section,
    stem: t(q.stem),
    options: opts.map((s, i) => ({ id: LET[i], text: t(s) })),
    correct: letter,
    explanation: { uz: q.expl },
    source: "new",
  };
}

const TITLES = (n) => ({
  uz: `3-sinf · Aralash test · ${n}-variant`,
  ru: `3 класс · Смешанный тест · Вариант ${n}`,
  en: `Grade 3 · Mixed test · Variant ${n}`,
});
const DESC = {
  uz: "Matematika, mantiq va ingliz tili bo'yicha aralash test (3-sinf, o'rta qiyinlik).",
  ru: "Смешанный тест по математике, логике и английскому языку (3 класс, средний уровень).",
  en: "Mixed test in maths, logic and English (Grade 3, medium level).",
};

const variants = [];
// variant 1
{
  const qs = V1.map((d) => {
    const t = (s) => (d.en ? { uz: s, ru: s, en: s } : { uz: s });
    return {
      section: d.section,
      stem: t(d.stem),
      options: d.texts.map((s, i) => ({ id: LET[i], text: t(s) })),
      correct: d.correct,
      explanation: { uz: d.expl },
      source: "doc",
    };
  });
  variants.push({ variant: 1, title: TITLES(1), description: DESC, durationMinutes: 40, passPercent: 60, difficulty: "medium", questions: qs });
}
for (let v = 2; v <= 4; v++) {
  R = mulberry32(7000 + v * 101);
  const raw = [];
  MATH.forEach((slot) => raw.push(slot[v - 2]()));
  LOGIC.forEach((slot) => raw.push(fixDays(slot[v - 2]())));
  EN[v - 2].forEach((q) => raw.push(q));
  const letters = plan(raw.length, v);
  variants.push({
    variant: v, title: TITLES(v), description: DESC, durationMinutes: 40, passPercent: 60, difficulty: "medium",
    questions: raw.map((q, i) => build(q, letters[i])),
  });
}

const out = { grade: 3, notes: NOTES, variants };
mkdirSync(join(root, "content", "quizzes"), { recursive: true });
writeFileSync(join(root, "content", "quizzes", "grade-3.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("grade-3.json yozildi:", variants.map((x) => `${x.variant}:${x.questions.length}`).join(" "));
