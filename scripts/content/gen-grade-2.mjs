// Generates content/quizzes/grade-2.json (variant 1 = school's doc solved by hand, variants 2-4 = generated).
// Each question carries a machine-checkable "check" field used by verify-grade-2.mjs (ignored by build-quizzes.mjs).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const L4 = ["A", "B", "C", "D"];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mk = (seed) => {
  const r = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const shuffle = (arr) => { const x = [...arr]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  return { r, ri, pick, shuffle };
};

const swapDigits = (n) => { const s = String(n); return s.length === 2 ? Number(s[1] + s[0]) : n; };
// numeric answer + distractors -> {ans, wrong}
function numQ(ans, cands, suf = "") {
  const seen = new Set([ans]);
  const w = [];
  for (const c of [...cands, ans + 1, ans - 1, ans + 10, ans - 10, ans + 2, ans - 2, swapDigits(ans), ans + 5, ans - 5]) {
    if (Number.isInteger(c) && c >= 0 && !seen.has(c)) { seen.add(c); w.push(c); }
    if (w.length === 3) break;
  }
  return { ans: `${ans}${suf}`, wrong: w.map((x) => `${x}${suf}`) };
}

// ---------------- Variant 1: the school's own questions ----------------
const o4 = (a, b, c, d) => [a, b, c, d];
const V1 = [
  ["logic", "Tushirib qoldirilgan sonlarni belgilang: 24, 23, 22, __, 20, 19, __, 17, 16, 15, __, __, 12, 11", o4("21, 18, 14, 13", "22, 23, 19, 17", "15, 14, 13, 12", "20, 18, 14, 13"), "A",
    "Sonlar 1 tadan kamayib boradi: 22 dan keyin 21, 19 dan keyin 18, 15 dan keyin 14 va 13.", { kind: "seq", start: 24, step: -1, len: 14, blanks: [3, 6, 10, 11] }],
  ["math", "Sonlar ichidan eng kichik bir xonali sonni belgilang.", o4("9", "1", "13", "17"), "B",
    "Bir xonali sonlar: 1, 2, ... 9. Ulardan eng kichigi 1.", { kind: "extreme", mode: "min", digits: 1 }],
  ["math", "Avtobusda 8 ta o'g'il bola va 5 ta qiz bola bor edi. Bekatda ulardan 4 tasi tushib qoldi. Avtobusda nechta bola qoldi?", o4("17 ta", "7 ta", "9 ta", "8 ta"), "C",
    "8 + 5 = 13 ta bola bor edi. 13 - 4 = 9 ta bola qoldi.", { kind: "expr", expr: "8+5-4" }],
  ["math", "Uchta sonning yig'indisi 76 ga teng. Birinchi son 22, ikkinchi son 34 bo'lsa, uchinchi sonni belgilang.", o4("54", "20", "22", "42"), "B",
    "22 + 34 = 56. 76 - 56 = 20.", { kind: "expr", expr: "76-22-34" }],
  ["math", "48 sonining qo'shni sonlarini ayting.", o4("45, 46", "49, 50", "49, 51", "47, 49"), "D",
    "48 dan oldin 47, keyin 49 turadi.", { kind: "neighbors", n: 48 }],
  ["math", "30 ni 17 ta orttirilgan javobni toping.", o4("37", "13", "47", "17"), "C",
    "30 + 17 = 47.", { kind: "expr", expr: "30+17" }],
  ["math", "Sardor 16 ta jo'yakni, Maxmud esa 4 ta ortiq jo'yakni chopdi. Maxmud necha jo'yakni chopgan?", o4("12 ta", "64 ta", "20 ta", "8 ta"), "C",
    "Maxmud 4 ta ortiq chopgan: 16 + 4 = 20.", { kind: "expr", expr: "16+4" }],
  ["math", "Kamola hozir 9 yoshda. 3 yildan keyin u necha yoshda bo'ladi?", o4("12 yoshda", "6 yoshda", "9 yoshda", "13 yoshda"), "A",
    "9 + 3 = 12.", { kind: "expr", expr: "9+3" }],
  ["math", "O'ylangan sondan 70 ni ayirishdi, 27 hosil bo'ldi. O'ylangan sonni belgilang.", o4("97", "37", "13", "47"), "A",
    "O'ylangan son - 70 = 27, demak son = 70 + 27 = 97.", { kind: "expr", expr: "70+27" }],
  ["math", "Taqsimchada 3 ta nok va 4 ta olma bor edi. 2 ta xurmo qo'yildi. Mevalar soni nechta bo'ldi?", o4("7 ta", "14 ta", "87 ta", "9 ta"), "D",
    "3 + 4 + 2 = 9.", { kind: "expr", expr: "3+4+2" }],
  ["math", "Bir to'pda 50 m, ikkinchi to'pda 28 m kam gazlama bor. Ikkala to'pda qancha gazlama bor?", o4("78 m", "28 m", "72 m", "22 m"), "C",
    "Ikkinchi to'pda 50 - 28 = 22 m. Ikkalasida 50 + 22 = 72 m.", { kind: "expr", expr: "50+(50-28)" }],
  ["math", "Qo'chqorning og'irligi 38 kg, buzoq undan 5 kg og'ir. Buzoqning og'irligini toping.", o4("42 kg", "43 kg", "38 kg", "44 kg"), "B",
    "38 + 5 = 43 kg.", { kind: "expr", expr: "38+5" }],
  ["math", "To'rtta quyonning har biriga 2 tadan sabzi berishdi. Quyonlarga hammasi bo'lib nechta sabzi berishgan?", o4("10 ta", "8 ta", "2 ta", "6 ta"), "B",
    "4 × 2 = 8 ta sabzi.", { kind: "expr", expr: "4*2", skipStem: true }],
  ["math", "39 kg olma va 21 kg anor olib kelishdi. 24 kg mevani sarflashdi. Necha kilogramm meva qolgan?", o4("84 kg", "60 kg", "21 kg", "36 kg"), "D",
    "39 + 21 = 60 kg. 60 - 24 = 36 kg.", { kind: "expr", expr: "39+21-24" }],
  ["math", "Chizg'ich 10 so'm turadi. Shunday 3 ta chizg'ich qancha turadi?", o4("13 so'm", "30 so'm", "10 so'm", "7 so'm"), "B",
    "10 × 3 = 30 so'm.", { kind: "expr", expr: "10*3" }],
  ["math", "Javobida 2 chiqadigan misolni belgilang.", o4("(70-22):6", "63:9+13", "18-14+15", "24+8-30"), "D",
    "(70-22):6 = 8; 63:9+13 = 20; 18-14+15 = 19; 24+8-30 = 2. Javob 2 bo'lgani D.", { kind: "exprs", target: 2 }],
  ["math", "Beshta shar 45 so'm turadi. 54 so'mga shunday sharlardan nechta sotib olish mumkin?", o4("8 ta", "6 ta", "5 ta", "9 ta"), "B",
    "Bitta shar 45 : 5 = 9 so'm. 54 : 9 = 6 ta shar.", { kind: "expr", expr: "54/(45/5)", skipStem: true }],
  ["math", "56 soni 8 dan necha marta katta?", o4("7 marta", "64 marta", "8 marta", "48 marta"), "A",
    "56 : 8 = 7 marta.", { kind: "expr", expr: "56/8" }],
  ["math", "Qaysi qatordagi sonlar 9 ga qoldiqsiz bo'linadi?", o4("27, 36, 40, 54", "9, 18, 24, 36", "18, 27, 36, 45", "18, 99, 56, 90"), "C",
    "18, 27, 36, 45 sonlarining hammasi 9 ga qoldiqsiz bo'linadi. Boshqa qatorlarda 9 ga bo'linmaydigan son bor (40, 24, 56).", { kind: "divlist", n: 9 }],
  ["logic", "Nima og'ir: yuz kilogramm paxtami yoki yuz kilogramm temirmi?", o4("paxta", "hech biri", "temir", "bir xil"), "D",
    "Ikkalasi ham 100 kg, demak og'irligi bir xil.", { kind: "compare", a: [100, "kg"], b: [100, "kg"], aText: "paxta", bText: "temir", eqText: "bir xil" }],
  ["math", "12 ta qiz bola, o'g'il bolalar esa qizlardan 3 marta kam sayohatga chiqqan. Hammasi bo'lib qancha bola sayohatga chiqishdi?", o4("16 ta", "9 ta", "10 ta", "12 ta"), "A",
    "O'g'il bolalar 12 : 3 = 4 ta. Hammasi 12 + 4 = 16 ta.", { kind: "expr", expr: "12+12/3" }],
  ["math", "To'rtta shoxda 7 tadan behi bor. 7 ta behini terib oldilar. Nechta behi qolgan?", o4("28 ta", "36 ta", "15 ta", "21 ta"), "D",
    "4 × 7 = 28 ta behi. 28 - 7 = 21 ta.", { kind: "expr", expr: "4*7-7", skipStem: true }],
  ["math", "56 metrli arqonning 7 dan bir qismini qirqib olishdi. Necha metr arqon qolgan?", o4("48", "21", "0", "14"), "A",
    "56 ning 7 dan biri: 56 : 7 = 8 m. 56 - 8 = 48 m.", { kind: "expr", expr: "56-56/7" }],
  ["math", "O'quvchi 20 ta qizil va 8 ta oq atirgul sotib oldi. Ulardan 13 tasini o'qituvchisiga sovg'a qildi. O'quvchida nechta atirgul qoldi?", o4("28", "15", "13", "18"), "B",
    "20 + 8 = 28 ta. 28 - 13 = 15 ta.", { kind: "expr", expr: "20+8-13" }],
  ["logic", "Misollarning javobini kamayish tartibida joylashtiring. Qaysi so'z hosil bo'ladi? U: 7 × 3; L: 13 × 5; M: 25 × 4; A: 26 × 3; I: 9 × 6; B: 24 × 2", o4("GENTRA", "UBILAM", "MALIBU", "NOPIHE"), "C",
    "M = 100, A = 78, L = 65, I = 54, B = 48, U = 21. Kamayish tartibida: MALIBU.",
    { kind: "wordsort", items: [["U", "7*3"], ["L", "13*5"], ["M", "25*4"], ["A", "26*3"], ["I", "9*6"], ["B", "24*2"]], order: "desc" }],
];

const NOTES = [
  "v1 #2: 'eng kichik bir xonali son' - variantlarda 1 yo'q edi (9, 10, 13, 17), B variant '10' ning o'rniga '1' yozildi (to'g'ri javob B).",
  "v1 #20: B variant 'buyurtma' ma'nosiz edi (to'g'ri javob 'bir xil' D da), 'hech biri' ga almashtirildi.",
  "v1 #7: 'jo'yak' va 'julyak' so'zlari aralash yozilgan edi, ikkalasi 'jo'yak' qilindi. So'zning ma'nosini (nima chopilgani) tekshirib ko'ring.",
  "v1 #25: rasm (shakl) o'rniga hujjatdagi matn (U 7∙3, L 13∙5, M 25∙4, A 26∙3, I 9∙6, B 24∙2) savol matniga kiritildi; to'g'ri javob MALIBU.",
  "v1: imlo/tinish belgilari tuzatildi (#3 'ularda'->'ulardan', #6 'ortirilgan'->'orttirilgan', #8, #9, #10, #22 vergul/nuqta, #5 va #19 variantlarda bo'shliqlar). Savol mazmuni o'zgarmadi.",
  "v1 #1, #20, #25 bo'limi 'mantiq' (logic) deb belgilandi, qolganlari 'matematika'. Hujjatda javob kaliti yo'q edi, barcha javoblar kod bilan qayta hisoblandi.",
];

// ---------------- Variants 2-4: generated ----------------
const NAMES = {
  2: { s3: "Savatda", s7: ["Dilnoza", "Malika"], },
};

function slot(n, v, G) {
  const { ri, pick, shuffle } = G;
  const q = (section, stem, built, expl, check) => ({ section, stem, ...built, expl, check });
  switch (n) {
    case 1: { // sequence with 4 blanks
      const cfg = { 2: { start: 35, step: 1, len: 14 }, 3: { start: 62, step: -1, len: 13 }, 4: { start: 40, step: 2, len: 13 } }[v];
      cfg.blanks = [2, 5, 8, 9];
      const full = Array.from({ length: cfg.len }, (_, i) => cfg.start + i * cfg.step);
      const s = cfg.step;
      const shown = full.map((x, i) => (cfg.blanks.includes(i) ? "__" : x)).join(", ");
      const c = cfg.blanks.map((i) => full[i]);
      const wr = [c.map((x) => x + s), c.map((x) => x - s), [c[0], c[1], c[2] + s, c[3] + s]];
      const stem = { 2: `Qatordagi tushib qolgan sonlarni toping: ${shown}`, 3: `Sonlar qatorini davom ettirib, bo'sh joylarga mos sonlarni belgilang: ${shown}`, 4: `Bo'sh joylarga qaysi sonlar mos keladi? ${shown}` }[v];
      return q("logic", stem, { ans: c.join(", "), wrong: wr.map((a) => a.join(", ")) },
        `Qatorda sonlar har safar ${Math.abs(s)} ta ${s > 0 ? "ortadi" : "kamayadi"}. Tushib qolgan sonlar: ${c.join(", ")}.`, { kind: "seq", ...cfg });
    }
    case 2: {
      const d = { 2: { stem: "Sonlar ichidan eng katta bir xonali sonni belgilang.", ans: "9", w: ["10", "8", "99"], mode: "max", digits: 1, ex: "Bir xonali sonlarning eng kattasi 9." },
        3: { stem: "Quyidagi sonlardan eng kichik ikki xonali sonni toping.", ans: "10", w: ["1", "11", "100"], mode: "min", digits: 2, ex: "Ikki xonali sonlar 10 dan boshlanadi. Eng kichigi 10." },
        4: { stem: "Eng katta ikki xonali sonni belgilang.", ans: "99", w: ["100", "90", "9"], mode: "max", digits: 2, ex: "Ikki xonali sonlarning eng kattasi 99. 100 uch xonali son." } }[v];
      return q("math", d.stem, { ans: d.ans, wrong: d.w }, d.ex, { kind: "extreme", mode: d.mode, digits: d.digits });
    }
    case 3: {
      const a = ri(5, 9), b = ri(4, 9), c = ri(3, 8);
      const stem = { 2: `Savatda ${a} ta olma va ${b} ta nok bor edi. ${c} tasini yeb qo'yishdi. Savatda nechta meva qoldi?`,
        3: `Sinfda ${a} ta qiz va ${b} ta o'g'il bola bor. ${c} nafari uyga ketdi. Sinfda nechta bola qoldi?`,
        4: `Simda ${a} ta qaldirg'och va ${b} ta chumchuq o'tirgan edi. ${c} tasi uchib ketdi. Simda nechta qush qoldi?` }[v];
      const r = a + b - c;
      return q("math", stem, numQ(r, [a + b, a + b + c, Math.abs(a - b - c)], " ta"), `${a} + ${b} = ${a + b}. ${a + b} - ${c} = ${r}.`, { kind: "expr", expr: `${a}+${b}-${c}` });
    }
    case 4: {
      const x = ri(12, 35), y = ri(12, 35), z = ri(10, 30), T = x + y + z;
      const stem = { 2: `Uchta sonning yig'indisi ${T} ga teng. Birinchi son ${x}, ikkinchi son ${y} bo'lsa, uchinchi sonni toping.`,
        3: `Uchta qutida hammasi bo'lib ${T} ta qalam bor. Birinchi qutida ${x} ta, ikkinchisida ${y} ta qalam bor. Uchinchi qutida nechta qalam bor?`,
        4: `${x} + ${y} + ? = ${T}. Savol belgisi o'rniga qaysi sonni qo'yish kerak?` }[v];
      return q("math", stem, numQ(z, [T - x, T - y, x + y]), `${x} + ${y} = ${x + y}. ${T} - ${x + y} = ${z}.`, { kind: "expr", expr: `${T}-${x}-${y}`, skipStem: v === 4 && false });
    }
    case 5: {
      const n = ri(21, 89);
      const stem = { 2: `${n} sonidan oldingi va keyingi sonlarni toping.`, 3: `Qaysi qatorda ${n} sonining qo'shni sonlari yozilgan?`, 4: `${n} dan bir kam va bir ko'p sonlarni belgilang.` }[v];
      const wr = shuffle([`${n - 2}, ${n - 1}`, `${n + 1}, ${n + 2}`, `${n - 1}, ${n + 2}`, `${n - 2}, ${n + 1}`]).slice(0, 3);
      return q("math", stem, { ans: `${n - 1}, ${n + 1}`, wrong: wr }, `${n} dan oldin ${n - 1}, keyin ${n + 1} turadi.`, { kind: "neighbors", n });
    }
    case 6: {
      let stem, a, b, r, e, ex;
      if (v === 2) { a = ri(20, 55); b = ri(11, 39); r = a + b; stem = `${a} sonini ${b} ta orttirsak, qancha bo'ladi?`; e = `${a}+${b}`; ex = `${a} + ${b} = ${r}.`; }
      else if (v === 3) { a = ri(50, 95); b = ri(11, 39); r = a - b; stem = `${a} sonini ${b} ta kamaytirsak, qancha bo'ladi?`; e = `${a}-${b}`; ex = `${a} - ${b} = ${r}.`; }
      else { a = ri(20, 50); b = ri(11, 45); r = a + b; stem = `${a} va ${b} sonlarining yig'indisini toping.`; e = `${a}+${b}`; ex = `${a} + ${b} = ${r}.`; }
      return q("math", stem, numQ(r, [v === 3 ? a + b : a - b, swapDigits(r), r + 10]), ex, { kind: "expr", expr: e });
    }
    case 7: {
      let a = ri(15, 55), b = ri(4, 14), r, stem, e, ex;
      if (v === 2) { r = a + b; stem = `Dilnoza ${a} ta gul terdi. Malika undan ${b} ta ko'p gul terdi. Malika nechta gul terdi?`; e = `${a}+${b}`; ex = `Malika ko'p terdi: ${a} + ${b} = ${r}.`; }
      else if (v === 3) { r = a - b; stem = `Anvar ${a} ta kitob o'qidi. Bobur undan ${b} ta kam kitob o'qidi. Bobur nechta kitob o'qidi?`; e = `${a}-${b}`; ex = `Bobur kam o'qigan: ${a} - ${b} = ${r}.`; }
      else { r = a + b; stem = `Birinchi savatda ${a} ta tuxum bor. Ikkinchi savatda birinchisidan ${b} ta ortiq tuxum bor. Ikkinchi savatda nechta tuxum bor?`; e = `${a}+${b}`; ex = `${a} + ${b} = ${r}.`; }
      return q("math", stem, numQ(r, [v === 3 ? a + b : a - b, r + 10, r - 10]), ex, { kind: "expr", expr: e });
    }
    case 8: {
      let a, k, r, stem, e, ex;
      if (v === 2) { a = ri(6, 10); k = ri(3, 6); r = a + k; stem = `Ali hozir ${a} yoshda. ${k} yildan keyin u necha yoshda bo'ladi?`; e = `${a}+${k}`; ex = `${a} + ${k} = ${r}.`; }
      else if (v === 3) { a = ri(9, 13); k = ri(2, 5); r = a - k; stem = `Madina hozir ${a} yoshda. ${k} yil oldin u necha yoshda edi?`; e = `${a}-${k}`; ex = `${a} - ${k} = ${r}.`; }
      else { a = ri(12, 17); k = ri(3, 6); r = a - k; stem = `Opam hozir ${a} yoshda, men esa undan ${k} yosh kichikman. Men necha yoshdaman?`; e = `${a}-${k}`; ex = `${a} - ${k} = ${r}.`; }
      return q("math", stem, numQ(r, [v === 2 ? a - k : a + k, r + 1, r - 1], " yoshda"), ex, { kind: "expr", expr: e });
    }
    case 9: {
      let x, a, b, stem, e, ex;
      if (v === 2) { a = ri(12, 40); x = ri(20, 55); b = x + a; stem = `O'ylangan songa ${a} ni qo'shishdi, ${b} hosil bo'ldi. O'ylangan sonni toping.`; e = `${b}-${a}`; ex = `O'ylangan son + ${a} = ${b}, demak son = ${b} - ${a} = ${x}.`; }
      else if (v === 3) { a = ri(12, 40); x = ri(40, 99); b = x - a; stem = `O'ylangan sondan ${a} ni ayirishdi, ${b} qoldi. O'ylangan son nechta?`; e = `${b}+${a}`; ex = `O'ylangan son - ${a} = ${b}, demak son = ${b} + ${a} = ${x}.`; }
      else { a = ri(60, 95); b = ri(12, 45); x = a - b; stem = `${a} dan o'ylangan sonni ayirishdi, ${b} hosil bo'ldi. O'ylangan sonni toping.`; e = `${a}-${b}`; ex = `${a} - son = ${b}, demak son = ${a} - ${b} = ${x}.`; }
      return q("math", stem, numQ(x, v === 2 ? [a + b, a, b] : v === 3 ? [Math.abs(b - a), a, b] : [a + b, a, b]), ex, { kind: "expr", expr: e });
    }
    case 10: {
      const a = ri(3, 9), b = ri(3, 9), c = ri(2, 8), r = a + b + c;
      const stem = { 2: `Idishda ${a} ta shaftoli va ${b} ta behi bor edi. Yana ${c} ta anor qo'yishdi. Idishda nechta meva bo'ldi?`,
        3: `Vazada ${a} ta qizil, ${b} ta sariq va ${c} ta oq lola bor. Vazada hammasi bo'lib nechta lola bor?`,
        4: `Qutiga ${a} ta qalam, ${b} ta ruchka va ${c} ta marker solishdi. Qutida nechta buyum bo'ldi?` }[v];
      return q("math", stem, numQ(r, [a + b, b + c, r + 1], " ta"), `${a} + ${b} + ${c} = ${r}.`, { kind: "expr", expr: `${a}+${b}+${c}` });
    }
    case 11: {
      const a = ri(30, 45), b = ri(5, 20), r = a + a - b;
      const [u, stem] = { 2: ["m", `Birinchi ipning uzunligi ${a} m, ikkinchisi undan ${b} m qisqa. Ikkala ip uzunligi qancha?`],
        3: ["l", `Birinchi idishda ${a} l sut bor, ikkinchisida undan ${b} l kam. Ikkala idishda necha litr sut bor?`],
        4: ["kg", `Birinchi qopda ${a} kg un bor. Ikkinchi qopda undan ${b} kg kam. Ikkala qopda necha kilogramm un bor?`] }[v];
      return q("math", stem, numQ(r, [a + b, a - b, 2 * a], ` ${u}`), `Ikkinchisida ${a} - ${b} = ${a - b}. Ikkalasida ${a} + ${a - b} = ${r}.`, { kind: "expr", expr: `${a}+(${a}-${b})` });
    }
    case 12: {
      let a, b, r, stem, e, ex;
      if (v === 2) { a = ri(25, 40); b = ri(3, 9); r = a + b; stem = `Qo'zichoqning og'irligi ${a} kg. Echki undan ${b} kg og'ir. Echkining og'irligini toping.`; e = `${a}+${b}`; ex = `${a} + ${b} = ${r} kg.`; }
      else if (v === 3) { a = ri(10, 15); b = ri(2, 6); r = a - b; stem = `Qovunning massasi ${a} kg. Tarvuz undan ${b} kg yengil. Tarvuzning massasi qancha?`; e = `${a}-${b}`; ex = `${a} - ${b} = ${r} kg.`; }
      else { a = ri(26, 36); b = ri(3, 9); r = a + b; stem = `Karimning vazni ${a} kg. Salimning vazni Karimnikidan ${b} kg ortiq. Salimning vazni necha kilogramm?`; e = `${a}+${b}`; ex = `${a} + ${b} = ${r} kg.`; }
      return q("math", stem, numQ(r, [v === 3 ? a + b : a - b, r + 1, r - 1], " kg"), ex, { kind: "expr", expr: e });
    }
    case 13: {
      const k = ri(3, 9), m = ri(3, 9), r = k * m;
      const stem = { 2: `${k} ta qutining har birida ${m} tadan qalam bor. Hammasi bo'lib nechta qalam bor?`,
        3: `Har bir stolda ${m} tadan bola o'tiribdi. ${k} ta stolda nechta bola o'tiribdi?`,
        4: `${k} ta mushukning har biriga ${m} tadan baliq berishdi. Hammasi bo'lib nechta baliq berilgan?` }[v];
      return q("math", stem, numQ(r, [k + m, r + k, r - m], " ta"), `${k} × ${m} = ${r}.`, { kind: "expr", expr: `${k}*${m}` });
    }
    case 14: {
      const a = ri(20, 45), b = ri(15, 35), c = ri(10, 30), r = a + b - c;
      const [stem, u] = { 2: [`${a} kg kartoshka va ${b} kg sabzi olib kelishdi. ${c} kg sabzavotni sarflashdi. Necha kilogramm sabzavot qolgan?`, " kg"],
        3: [`Do'konda ${a} ta daftar va ${b} ta kitob bor edi. ${c} tasi sotildi. Do'konda nechta narsa qoldi?`, " ta"],
        4: [`Sinf kutubxonasida ${a} ta ertak va ${b} ta she'r kitobi bor edi. O'quvchilar ${c} ta kitobni olib ketishdi. Kutubxonada nechta kitob qoldi?`, " ta"] }[v];
      return q("math", stem, numQ(r, [a + b, a + b + c, a - c], u), `${a} + ${b} = ${a + b}. ${a + b} - ${c} = ${r}.`, { kind: "expr", expr: `${a}+${b}-${c}` });
    }
    case 15: {
      const p = pick([15, 20, 25]), k = ri(2, 4), r = p * k;
      const stem = { 2: `Bitta qalam ${p} so'm turadi. Shunday ${k} ta qalam qancha turadi?`, 3: `Bir dona non ${p} so'm. ${k} dona non necha so'm turadi?`, 4: `Bitta daftar ${p} so'm turadi. ${k} ta daftar uchun necha so'm to'lash kerak?` }[v];
      return q("math", stem, numQ(r, [p + k, r + p, r - p], " so'm"), `${p} × ${k} = ${r} so'm.`, { kind: "expr", expr: `${p}*${k}` });
    }
    case 16: {
      const t = { 2: 5, 3: 7, 4: 4 }[v];
      const forms = [
        (val) => { const c = ri(2, 9), y = ri(5, 25); return `(${y + val * c}-${y}):${c}`; },
        (val) => { const s = ri(2, val - 1), q2 = ri(2, 9); return `${s * q2}:${q2}+${val - s}`; },
        (val) => { const c = ri(2, val - 1), b = ri(8, 25); return `${val + b - c}-${b}+${c}`; },
        (val) => { const a = ri(8, 25), b = ri(8, 25); return `${a}+${b}-${a + b - val}`; },
      ];
      const order = shuffle([0, 1, 2, 3]);
      const offs = shuffle([-3, -2, -1, 1, 2, 3, 4].filter((o) => t + o >= 3)).slice(0, 3);
      const correct = forms[order[0]](t);
      const wrong = offs.map((o, i) => forms[order[i + 1]](t + o));
      const stem = { 2: `Javobi ${t} ga teng bo'lgan misolni toping.`, 3: `Qaysi misolning natijasi ${t} bo'ladi?`, 4: `Quyidagi misollardan qaysi birining javobi ${t} ga teng?` }[v];
      return q("math", stem, { ans: correct, wrong }, `${correct} = ${t}. Boshqa misollarning javobi ${t} emas.`, { kind: "exprs", target: t });
    }
    case 17: {
      const k = { 2: 4, 3: 3, 4: 6 }[v], e = ri(5, 9);
      let m = ri(3, 9); if (m === k) m = k === 9 ? 8 : k + 1;
      const P = k * e, B = e * m;
      const stem = { 2: `${k} ta qalam ${P} so'm turadi. ${B} so'mga shunday qalamlardan nechta sotib olish mumkin?`,
        3: `${k} ta bulka ${P} so'm turadi. ${B} so'mga shunday bulkalardan nechta olish mumkin?`,
        4: `${k} ta ruchka ${P} so'm turadi. ${B} so'mga shunday ruchkalardan nechta sotib olsa bo'ladi?` }[v];
      return q("math", stem, numQ(m, [m + 1, m - 1, k], " ta"), `Bittasi ${P} : ${k} = ${e} so'm. ${B} : ${e} = ${m} ta.`, { kind: "expr", expr: `${B}/(${P}/${k})` });
    }
    case 18: {
      const b = ri(2, 9), m = ri(3, 9), a = b * m;
      const stem = { 2: `${a} soni ${b} dan necha marta katta?`, 3: `${a} ta olma ${b} ta nokdan necha marta ko'p?`, 4: `${a} ning ichida ${b} ni necha marta olish mumkin?` }[v];
      return q("math", stem, numQ(m, [m + 1, m - 1, a - b], " marta"), `${a} : ${b} = ${m} marta.`, { kind: "expr", expr: `${a}/${b}` });
    }
    case 19: {
      const n = { 2: 6, 3: 8, 4: 7 }[v];
      const mults = (cnt) => shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((x) => x * n).filter((x) => x <= 99)).slice(0, cnt).sort((a, b) => a - b);
      const good = mults(4);
      const bad = (list) => {
        const l = [...list]; const cnt = ri(1, 2);
        for (const i of shuffle([0, 1, 2, 3]).slice(0, cnt)) l[i] = list[i] + pick([-2, -1, 1, 2, 3]);
        return l.map((x) => (x % n === 0 ? x + 1 : x)).sort((a, b) => a - b);
      };
      const wrongs = new Set();
      while (wrongs.size < 3) wrongs.add(bad(mults(4)).join(", "));
      const stem = { 2: `Qaysi qatordagi sonlar ${n} ga qoldiqsiz bo'linadi?`, 3: `${n} ga bo'lganda qoldiq chiqmaydigan sonlar qatorini belgilang.`, 4: `${n} ning ko'paytirish jadvalidagi sonlardan iborat qatorni toping.` }[v];
      return q("math", stem, { ans: good.join(", "), wrong: [...wrongs].filter((w) => w !== good.join(", ")) },
        `${good.map((x) => `${x} : ${n} = ${x / n}`).join("; ")}. Bu qatorda barcha sonlar ${n} ga bo'linadi.`, { kind: "divlist", n });
    }
    case 20: {
      const d = {
        2: { stem: "Qaysi biri og'irroq: 1 kg guruchmi yoki 1000 g unmi?", a: [1, "kg"], b: [1000, "g"], aText: "1 kg guruch", bText: "1000 g un", ex: "1 kg = 1000 g, ikkalasi baravar og'ir." },
        3: { stem: "Qaysi biri uzunroq: 3 m li arqonmi yoki 250 sm li lentami?", a: [3, "m"], b: [250, "sm"], aText: "3 m li arqon", bText: "250 sm li lenta", ex: "3 m = 300 sm. 300 sm > 250 sm, arqon uzunroq." },
        4: { stem: "Qaysi biri uzoqroq davom etadi: 2 soatmi yoki 90 daqiqami?", a: [2, "soat"], b: [90, "daqiqa"], aText: "2 soat", bText: "90 daqiqa", ex: "2 soat = 120 daqiqa. 120 > 90, 2 soat uzoqroq." },
      }[v];
      return q("logic", d.stem, { ans: v === 2 ? "bir xil" : d.aText, wrong: v === 2 ? [d.aText, d.bText, "aniqlab bo'lmaydi"] : [d.bText, "bir xil", "aniqlab bo'lmaydi"] }, d.ex,
        { kind: "compare", a: d.a, b: d.b, aText: d.aText, bText: d.bText, eqText: "bir xil" });
    }
    case 21: {
      const k = ri(2, 5), b = ri(2, 8), g = k * b, r = g + b;
      const [stem, u] = { 2: [`Bog'da ${g} ta qizil gul bor. Sariq gullar qizil gullardan ${k} marta kam. Bog'da hammasi bo'lib nechta gul bor?`, " ta"],
        3: [`Sinfda ${g} ta o'g'il bola bor. Qizlar o'g'il bolalardan ${k} marta kam. Sinfda hammasi bo'lib nechta bola bor?`, " ta"],
        4: [`Hovlida ${g} ta tovuq bor. O'rdaklar tovuqlardan ${k} marta kam. Hovlida jami nechta parranda bor?`, " ta"] }[v];
      return q("math", stem, numQ(r, [g, b, g - b], u), `Kam turi: ${g} : ${k} = ${b}. Jami ${g} + ${b} = ${r}.`, { kind: "expr", expr: `${g}+${g}/${k}` });
    }
    case 22: {
      const k = ri(3, 6), m = ri(3, 9), t = k * m, r0 = ri(5, 12), r = t - r0;
      const stem = { 2: `${k} ta qutida ${m} tadan qalam bor. ${r0} ta qalamni ishlatib bo'lishdi. Nechta qalam qoldi?`,
        3: `${k} ta idishning har birida ${m} tadan olma bor edi. ${r0} ta olmani yeb qo'yishdi. Nechta olma qoldi?`,
        4: `${k} ta qatorda ${m} tadan stul bor. ${r0} ta stulni olib chiqib ketishdi. Nechta stul qoldi?` }[v];
      return q("math", stem, numQ(r, [t + r0, t, m * k - r0 + 1], " ta"), `${k} × ${m} = ${t}. ${t} - ${r0} = ${r}.`, { kind: "expr", expr: `${k}*${m}-${r0}` });
    }
    case 23: {
      const k = { 2: 6, 3: 4, 4: 3 }[v], q2 = ri(3, 9) + (v === 4 ? 3 : 0), t = k * q2, r = t - q2;
      const [stem, u] = { 2: [`${t} metrli ipning ${k} dan bir qismini kesib olishdi. Necha metr ip qolgan?`, " m"],
        3: [`${t} ta olmaning ${k} dan bir qismini sotishdi. Nechta olma qoldi?`, " ta"],
        4: [`${t} kg unning ${k} dan bir qismini ishlatishdi. Necha kilogramm un qoldi?`, " kg"] }[v];
      return q("math", stem, numQ(r, [q2, t, t + q2], u), `${t} ning ${k} dan biri: ${t} : ${k} = ${q2}. ${t} - ${q2} = ${r}.`, { kind: "expr", expr: `${t}-${t}/${k}` });
    }
    case 24: {
      const a = ri(15, 30), b = ri(6, 15), c = ri(10, 20), r = a + b - c;
      const stem = { 2: `Qizcha ${a} ta qizil va ${b} ta ko'k munchoq terdi. Ulardan ${c} tasini singlisiga berdi. Qizchada nechta munchoq qoldi?`,
        3: `Ali ${a} ta qizil va ${b} ta yashil qalam sotib oldi. Ulardan ${c} tasini do'stiga berdi. Alida nechta qalam qoldi?`,
        4: `Oyim ${a} ta non va ${b} ta somsa yopdi. Mehmonlar ${c} tasini yeyishdi. Nechta non va somsa qoldi?` }[v];
      return q("math", stem, numQ(r, [a + b, a + b + c, a - c], " ta"), `${a} + ${b} = ${a + b}. ${a + b} - ${c} = ${r}.`, { kind: "expr", expr: `${a}+${b}-${c}` });
    }
    case 25: {
      const word = { 2: "KITOB", 3: "QALAM", 4: "DAFTAR" }[v];
      const order = v === 3 ? "asc" : "desc";
      const pool = new Set();
      const prods = [];
      while (prods.length < word.length) {
        const x = ri(3, 14), y = ri(2, 6);
        if (x * y <= 99 && x * y >= 6 && !pool.has(x * y)) { pool.add(x * y); prods.push([x, y]); }
      }
      prods.sort((p, q2) => (order === "desc" ? q2[0] * q2[1] - p[0] * p[1] : p[0] * p[1] - q2[0] * q2[1]));
      const items = [...word].map((ch, i) => [ch, `${prods[i][0]}*${prods[i][1]}`]);
      const shown = shuffle(items).map(([ch, e]) => `${ch}: ${e.replace("*", " × ")}`).join("; ");
      const w = new Set([word]);
      const cand = [word.slice(1) + word[0], [...word].reverse().join(""), word[1] + word[0] + word.slice(2), word.slice(0, -2) + word[word.length - 1] + word[word.length - 2], word[0] + word.slice(1).split("").reverse().join("")];
      const wrong = []; for (const c of cand) if (!w.has(c) && wrong.length < 3) { w.add(c); wrong.push(c); }
      const stem = `Misollarning javobini ${order === "desc" ? "kamayish" : "o'sish"} tartibida joylashtiring. Qaysi so'z hosil bo'ladi? ${shown}`;
      return q("logic", stem, { ans: word, wrong }, `${items.map(([ch, e]) => `${ch} = ${eval(e)}`).join(", ")}. ${order === "desc" ? "Kamayish" : "O'sish"} tartibida: ${word}.`, { kind: "wordsort", items, order });
    }
  }
}

function build(v) {
  const G = mk(1000 + v * 7919);
  const base = shuffle25(G, v);
  const out = [];
  for (let i = 1; i <= 25; i++) {
    const s = slot(i, v, G);
    const target = base[i - 1];
    if (s.wrong.length !== 3) throw new Error(`v${v} #${i}: wrong=${s.wrong.length}`);
    const opts = [];
    let wi = 0;
    for (const L of L4) opts.push(L === target ? s.ans : s.wrong[wi++]);
    out.push(item(s.section, s.stem, opts, target, s.expl, "new", s.check));
  }
  return out;
}
function shuffle25(G, v) {
  const counts = [6, 6, 6, 7]; const rot = v % 4;
  const arr = [];
  counts.forEach((c, i) => { for (let j = 0; j < c; j++) arr.push(L4[(i + rot) % 4]); });
  // keep 25 slots: counts sum = 25
  return G.shuffle(arr);
}
const item = (section, stem, opts, correct, expl, source, check) => ({
  section, stem: { uz: stem },
  options: opts.map((t, i) => ({ id: L4[i], text: { uz: t } })),
  correct, explanation: { uz: expl }, source, check,
});

const title = (n) => ({ uz: `2-sinf · Aralash test · ${n}-variant`, ru: `2 класс · Смешанный тест · Вариант ${n}`, en: `Grade 2 · Mixed test · Variant ${n}` });
const desc = () => ({
  uz: "2-sinf o'quvchilari uchun matematika va mantiq testi: sonlar, qo'shish va ayirish, masalalar, ko'paytirish va bo'lish.",
  ru: "Тест по математике и логике для 2 класса: числа, сложение и вычитание, задачи, умножение и деление.",
  en: "Maths and logic test for Grade 2: numbers, addition and subtraction, word problems, multiplication and division.",
});

const variants = [];
variants.push({
  variant: 1, title: title(1), description: desc(), durationMinutes: 40, passPercent: 60, difficulty: "easy",
  questions: V1.map(([sec, stem, opts, correct, expl, check]) => item(sec, stem, opts, correct, expl, "doc", check)),
});
for (const v of [2, 3, 4]) variants.push({ variant: v, title: title(v), description: desc(), durationMinutes: 40, passPercent: 60, difficulty: "easy", questions: build(v) });

// uniqueness across variants
const seen = new Map();
for (const v of variants) v.questions.forEach((q, i) => {
  const k = q.stem.uz.toLowerCase();
  if (seen.has(k)) throw new Error(`takror savol: v${v.variant} #${i + 1} = ${seen.get(k)}`);
  seen.set(k, `v${v.variant} #${i + 1}`);
});

const file = join(root, "content", "quizzes", "grade-2.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ grade: 2, notes: NOTES, variants }, null, 2) + "\n", "utf8");
console.log("Yozildi:", file);
