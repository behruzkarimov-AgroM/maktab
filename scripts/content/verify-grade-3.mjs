// Independent verification of content/quizzes/grade-3.json: recomputes every answer from the question text
// (own solvers, not the generator's data) and compares with the option marked `correct`.
// Usage: node scripts/content/verify-grade-3.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const data = JSON.parse(readFileSync(join(root, "content", "quizzes", "grade-3.json"), "utf8"));
const fails = [];
let checked = 0;
const num = (s) => { const m = String(s).match(/-?\d+/); return m ? Number(m[0]) : NaN; };
const T = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const DAYS = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ---------- math solvers: [regex, (match) => expected (number | string)] ----------
const M = (re, f) => [re, f];
const mathSolvers = [
  M(/^Hisoblang: (\d+) \+ (\d+) = \?$/, (m) => +m[1] + +m[2]),
  M(/^Hisoblang: (\d+) - (\d+) = \?$/, (m) => m[1] - m[2]),
  M(/^Kutubxonada (\d+) ta kitob bor edi\. Ulardan (\d+) tasini/, (m) => m[1] - m[2]),
  M(/^(\d+) × (\d+) = \?$/, (m) => m[1] * m[2]),
  M(/^Do'konda (\d+) ta qutida (\d+) tadan/, (m) => m[1] * m[2]),
  M(/^\? × (\d+) = (\d+)\./, (m) => m[2] / m[1]),
  M(/^(\d+) ÷ (\d+) = \?$/, (m) => m[1] / m[2]),
  M(/^(\d+) ta olma (\d+) ta savatga teng/, (m) => m[1] / m[2]),
  M(/^(\d+) sm uzunlikdagi arqonni (\d+) sm dan/, (m) => m[1] / m[2]),
  M(/^Hisoblang: ([\d\s+\-×·:()]+)$/, (m) => Function(`return (${m[1].replace(/[×·]/g, "*").replace(/:/g, "/")})`)()),
  M(/^Tenglamani yeching: (.+)$/, (m) => {
    const [l, r] = m[1].replace(/×/g, "*").replace(/[xa]/g, "v").replace(/(\d)v/g, "$1*v").split("=");
    const f = Function("v", `return (${l}) - (${r})`);
    const sols = []; for (let v = 0; v <= 5000; v++) if (f(v) === 0) sols.push(v);
    if (sols.length !== 1) throw new Error("tenglama yechimi yagona emas");
    return sols[0];
  }),
  M(/^Sherzodda (\d+) ta marka.*?(\d+) marta ko'p/, (m) => m[1] * m[2]),
  M(/^Bog'da (\d+) ta olma daraxti.*?(\d+) marta kam/, (m) => m[1] / m[2]),
  M(/^Nigoraning (\d+) ta qo'g'irchog'i bor\..*?Nigoranikidan (\d+) ta kam/, (m) => +m[1] + (m[1] - m[2])),
  M(/^Eng katta uch xonali son va eng kichik ikki xonali son yig'indisi/, () => 999 + 10),
  M(/^Eng kichik uch xonali son bilan eng katta bir xonali sonning yig'indisini/, () => 100 + 9),
  M(/^Eng katta uch xonali son eng kichik uch xonali sondan qancha ortiq/, () => 999 - 100),
  M(/^Eng kichik to'rt xonali son va eng katta ikki xonali sonlar yig'indisi 900 dan qancha ortiq/, () => 1000 + 99 - 900),
  M(/^Ona (\d+) yoshda, qizi (\d+) yoshda\. (\d+) yildan keyin/, (m) => m[1] - m[2]),
  M(/^Hozir (\d+)-yil\. \S+ (\d+) yil avval (\d+) yoshda edi/, (m) => m[1] - m[2] - m[3]),
  M(/^Dilnoza (\d+) yoshda\. Akasi undan (\d+) yosh katta.*?akasidan (\d+) yosh kichik/, (m) => +m[1] + +m[2] - m[3]),
  M(/^To'g'ri to'rtburchakning uzunligi (\d+) sm, eni (\d+) sm\. Uning perimetrini/, (m) => 2 * (+m[1] + +m[2])),
  M(/^Uzunligi (\d+) sm va eni (\d+) sm bo'lgan to'g'ri to'rtburchakning yuzini/, (m) => m[1] * m[2]),
  M(/^To'g'ri to'rtburchakning perimetri (\d+) sm, uzunligi (\d+) sm\. Uning eni/, (m) => m[1] / 2 - m[2]),
  M(/^To'g'ri to'rtburchakning yuzi S = (\d+) sm\^2 va bo'yi b = (\d+) sm.*perimetrini/, (m) => 2 * (m[1] / m[2] + +m[2])),
  M(/^(\d+) soat (\d+) minut necha minut/, (m) => m[1] * 60 + +m[2]),
  M(/^(\d+) hafta (\d+) kun jami necha kun/, (m) => m[1] * 7 + +m[2]),
  M(/^Film soat (\d\d):(\d\d) da boshlandi va (\d+) minut davom etdi/, (m) => T(m[1] * 60 + +m[2] + +m[3])),
  M(/^Bitta daftar (\d+) so'm turadi\. (\d+) ta daftar/, (m) => m[1] * m[2]),
  M(/^Ali (\d+) so'm bilan.*?(\d+) so'mlik non va (\d+) so'mlik sut/, (m) => m[1] - m[2] - m[3]),
  M(/^Sotuvchi (\d+) kg uzumni (\d+) so'mga/, (m) => m[2] / m[1]),
  M(/^(\d+) m (\d+) sm necha santimetr/, (m) => m[1] * 100 + +m[2]),
  M(/^(\d+) kg (\d+) g necha gramm/, (m) => m[1] * 1000 + +m[2]),
  M(/^Idishda (\d+) l (\d+) ml sharbat bor edi\. Undan (\d+) ml/, (m) => m[1] * 1000 + +m[2] - m[3]),
  M(/^Qutida (\d+) ta qizil va (\d+) ta ko'k shar.*?(\d+) ta shar tarqatildi/, (m) => +m[1] + +m[2] - m[3]),
  M(/^Avtobusda (\d+) yo'lovchi.*?(\d+) kishi tushdi, (\d+) kishi chiqdi/, (m) => m[1] - m[2] + +m[3]),
  M(/^Hovlida (\d+) ta quyon va (\d+) ta tovuq/, (m) => 4 * m[1] + 2 * m[2]),
  // school doc (variant 1)
  M(/^10 kg yog'ochdan 3 ta o'yinchoq.*40 kg/, () => (40 / 10) * 3),
  M(/^Alining kitoblari soni Valining kitoblaridan 2 marta ko'p\. Agar Valining (\d+) ta/, (m) => 2 * m[1]),
  M(/^4 raqami bilan tugaydigan ikki xonali/, () => { let c = 0; for (let i = 10; i <= 99; i++) if (i % 10 === 4) c++; return c; }),
  M(/^2 hafta 72 soat 4320 minut necha sutka/, () => 2 * 7 + 72 / 24 + 4320 / (60 * 24)),
  M(/^Nozima Charosdan 8 yoshga, Shoiradan 5 yoshga katta\. Muslima 14 yoshda.*Charosdan 3 yoshga kichik/, () => { const charos = 14 + 3, nozima = charos + 8; return nozima - 5; }),
  M(/^Bahorda polizga 20 kg kartoshka urug'i ekilsa.*140 kg hosil.*770 kg/, () => 770 / (140 / 20)),
  M(/^Fermada (\d+) ta qo'y va (\d+) ta tovuq/, (m) => 4 * m[1] + 2 * m[2]),
  M(/^Bir g'aroyib shaharda.*15-uyning nomerini/, () => { const o = []; for (let i = 1; o.length < 15; i += 2) if (!String(i).includes("3")) o.push(i); return o[14]; }),
  M(/^Dastlabki suv ostiga sho'ng'ish kostyumining og'irligi taxminan 380 .*Har biri 80 kg vaznli, shunday kostyum kiygan 3 ta/, () => 3 * (380 + 80)),
];

// ---------- logic solvers ----------
const words1to8 = ["Bir", "Ikki", "Uch", "To'rt", "Besh", "Olti", "Yetti", "Sakkiz"];
const cat = { olma: "meva", nok: "meva", uzum: "meva", sabzi: "sabzavot", stol: "mebel", stul: "mebel", shkaf: "mebel", non: "ovqat" };
const rank = (rels, who) => {
  const people = [...new Set(rels.flat())];
  return people.map((p) => ({ p, above: people.filter((q) => q !== p && greater(rels, q, p)).length })).sort((a, b) => b.above - a.above)[0] && people;
};
function greater(rels, a, b, seen = new Set()) { // is a > b by transitive closure
  if (rels.some(([h, l]) => h === a && l === b)) return true;
  seen.add(a);
  return rels.some(([h, l]) => h === a && !seen.has(l) && greater(rels, l, b, seen));
}
function order(rels) { // names sorted greatest -> smallest
  const people = [...new Set(rels.flat())];
  return people.sort((a, b) => (greater(rels, a, b) ? -1 : greater(rels, b, a) ? 1 : 0));
}
const logicSolvers = [
  M(/^Qatorni davom ettiring: ([\d, ]+), \?$/, (m) => {
    const t = m[1].split(",").map(Number), d1 = t.slice(1).map((x, i) => x - t[i]);
    if (d1.every((x) => x === d1[0])) return t[t.length - 1] + d1[0];
    const d2 = d1.slice(1).map((x, i) => x - d1[i]);
    if (d2.every((x) => x === d2[0])) return t[t.length - 1] + d1[d1.length - 1] + d2[0];
    throw new Error("qonuniyat topilmadi");
  }),
  M(/^Harflar qatorini davom ettiring \(ingliz alifbosi\): ([A-Z, ]+), \?$/, (m) => {
    const t = m[1].split(",").map((s) => ALPHA.indexOf(s.trim())), d = t[1] - t[0];
    if (!t.every((x, i) => i === 0 || x - t[i - 1] === d)) throw new Error("harf qadami teng emas");
    return ALPHA[t[t.length - 1] + d];
  }),
  M(/^Quyidagi harflarni davom ettiring: B, I, U, T, B, O/, () => `${words1to8[6][0]}, ${words1to8[7][0]}`),
  M(/^Qaysi son ortiqcha: ([\d, ]+)\?$/, (m) => {
    const t = m[1].split(",").map(Number);
    for (let k = 2; k <= 12; k++) { const bad = t.filter((x) => x % k !== 0); if (bad.length === 1) return bad[0]; }
    throw new Error("ortiqcha son topilmadi");
  }),
  M(/^Qaysi so'z ortiqcha: ([^?]+)\?$/, (m) => {
    const w = m[1].split(",").map((s) => s.trim()), cnt = {};
    w.forEach((x) => (cnt[cat[x]] = (cnt[cat[x]] ?? 0) + 1));
    return w.find((x) => cnt[cat[x]] === 1);
  }),
  M(/^Ali Validan baland, Vali Samidan baland, Soli esa Samidan past\./, () => order([["Ali", "Vali"], ["Vali", "Sami"], ["Sami", "Soli"]])[0]),
  M(/^Bobur Karimdan oldin, Karim Doniyordan oldin, Doniyor esa Farhoddan oldin/, () => order([["Bobur", "Karim"], ["Karim", "Doniyor"], ["Doniyor", "Farhod"]]).at(-1)),
  M(/^Lola Malikadan katta, Malika Nargizadan katta, Nargiza esa Dilfuzadan katta\./, () => order([["Lola", "Malika"], ["Malika", "Nargiza"], ["Nargiza", "Dilfuza"]])[1]),
  M(/^Agar Akmal Sobirdan baland bo'lsa, Karim esa Zokirdan pastroq, lekin Akmaldan balandroq/, () => order([["Akmal", "Sobir"], ["Zokir", "Karim"], ["Karim", "Akmal"]]).at(-1)),
  M(/^Men bir son o'yladim\. Uni (\d+) ga ko'paytirib, (\d+) ni qo'shsam, (\d+) chiqdi/, (m) => brute((n) => n * m[1] + +m[2] === +m[3])),
  M(/^Men o'ylagan sonni (\d+) ga ko'paytirib, natijadan (\d+) ni ayirsam, (\d+) chiqdi/, (m) => brute((n) => n * m[1] - m[2] === +m[3])),
  M(/^Men o'ylagan sonni (\d+) ga bo'lib, (\d+) ni qo'shsam, (\d+) chiqdi/, (m) => brute((n) => n % m[1] === 0 && n / m[1] + +m[2] === +m[3])),
  M(/^Bugun (\S+)\. (\d+) kundan keyin qaysi kun/, (m) => DAYS[(DAYS.indexOf(m[1]) + +m[2]) % 7]),
  M(/^Kecha (\S+) edi\. Ertaga qaysi kun/, (m) => DAYS[(DAYS.indexOf(m[1]) + 2) % 7]),
  M(/^Bugun (\S+)\. (\d+) kun oldin qaysi kun/, (m) => DAYS[(((DAYS.indexOf(m[1]) - m[2]) % 7) + 7) % 7]),
];
function brute(f) { const s = []; for (let n = 1; n <= 1000; n++) if (f(n)) s.push(n); if (s.length !== 1) throw new Error("yechim yagona emas"); return s[0]; }

// fixed-answer items (grammar / verbal logic): stem -> expected correct option text
const fixed = {
  // school doc, variant 1
  "Barcha bank mijozlari keksalar. Hamma keksalar boy. Quyidagilardan qaysi biri to'g'ri bo'lishi kerak?": "Barcha bank mijozlari boy",
  "Har doim to'g'ri bo'lgan mulohazani toping.": "14 yoshli qiz bola hayotida bir marta hozirgi bo'yining yarmiga teng bo'lgan.",
  "This … my sister.": "is", "Are … a doctor?": "you", "… name is Odina.": "her",
  "There … a blanket on the bed.": "is", "There … books on the table.": "are",
  "School is closed on Sunday. I … go to school on Sunday.": "never",
  "It … cold.": "is", "I … football.": "play", "I … swim.": "can", "The ladybird can fly … walk, too.": "and",
  // variant 2
  "That … my brother.": "is", "We … students.": "are", "… name is Anvar.": "His",
  "There … two cats under the chair.": "are", "She … a red bag.": "has", "I … milk every morning.": "drink",
  "One book, two …": "books", "We go … school by bus.": "to", "Which word is a fruit?": "apple", "Can you swim? Yes, I …": "can",
  // variant 3
  "My mother … a teacher.": "is", "They … my friends.": "are", "… is my pencil case.": "This",
  "There … a lamp on the desk.": "is", "He … two brothers.": "has", "My sister … TV in the evening.": "watches",
  "One child, two …": "children", "We have lunch … one o'clock.": "at", "Which word is an animal?": "rabbit", "Can a fish fly? No, it …": "can't",
  // variant 4
  "I … ten years old.": "am", "You … my best friend.": "are", "… are my shoes.": "These",
  "There … some milk in the glass.": "is", "We … a big garden.": "have", "Dilnoza … to school every day.": "goes",
  "One box, two …": "boxes", "Put the books … your bag.": "in", "Which word is a colour?": "green", "Is she your sister? Yes, she …": "is",
};

const norm = (s) => String(s).trim().toLowerCase();
const seenStems = new Map();

for (const v of data.variants) {
  const tag = `V${v.variant}`;
  const cnt = { A: 0, B: 0, C: 0, D: 0 }, sec = { math: 0, logic: 0, english: 0 }, src = { doc: 0, new: 0 };
  v.questions.forEach((q, i) => {
    const id = `${tag}#${i + 1}`;
    checked++;
    cnt[q.correct]++; sec[q.section]++; src[q.source]++;
    const stem = q.stem.uz;
    const texts = q.options.map((o) => o.text.uz);
    const correctText = q.options.find((o) => o.id === q.correct)?.text.uz;
    if (new Set(texts.map(norm)).size !== 4) fails.push(`${id}: variantlar takrorlangan`);
    if (seenStems.has(norm(stem))) fails.push(`${id}: savol matni ${seenStems.get(norm(stem))} bilan bir xil`);
    seenStems.set(norm(stem), id);
    if (q.section === "english") {
      if (JSON.stringify(q.stem.uz) !== JSON.stringify(q.stem.ru) || q.stem.uz !== q.stem.en) fails.push(`${id}: ingliz stem uz/ru/en farq qiladi`);
      if (q.options.some((o) => o.text.uz !== o.text.ru || o.text.uz !== o.text.en)) fails.push(`${id}: ingliz variantlar uz/ru/en farq qiladi`);
    }
    if (fixed[stem] !== undefined) {
      if (correctText !== fixed[stem]) fails.push(`${id}: kutilgan "${fixed[stem]}", faylda "${correctText}"`);
      return;
    }
    if (q.section === "english") { fails.push(`${id}: ingliz savoli jadvalda yo'q: ${stem}`); return; }
    // school doc Q1: the option whose two numbers sum to 103
    if (stem.startsWith("Ikki sonning yig'indisi 103")) {
      const hits = q.options.filter((o) => o.text.uz.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0) === 103);
      if (hits.length !== 1 || hits[0].id !== q.correct) fails.push(`${id}: 103 yig'indi bo'yicha noto'g'ri`);
      return;
    }
    const solvers = q.section === "math" ? mathSolvers : [...logicSolvers, ...mathSolvers];
    let exp, matched = 0;
    for (const [re, f] of solvers) {
      const m = stem.match(re);
      if (m) { matched++; try { exp = f(m); } catch (e) { fails.push(`${id}: ${e.message}`); exp = undefined; } break; }
    }
    if (!matched) { fails.push(`${id}: yechuvchi topilmadi: ${stem}`); return; }
    if (exp === undefined) return;
    const isStr = typeof exp === "string";
    const eq = (t) => (isStr ? norm(t) === norm(exp) : num(t) === exp && Number.isFinite(exp));
    const hits = q.options.filter((o) => eq(o.text.uz));
    if (!isStr && !Number.isInteger(exp)) fails.push(`${id}: natija butun emas (${exp})`);
    if (hits.length !== 1) fails.push(`${id}: kutilgan javob "${exp}" variantlar ichida ${hits.length} marta uchraydi`);
    else if (hits[0].id !== q.correct) fails.push(`${id}: kutilgan "${exp}" (${hits[0].id}), faylda correct=${q.correct} ("${correctText}")`);
  });
  const n = v.questions.length;
  const dist = Object.entries(cnt).map(([k, c]) => `${k}:${c}(${Math.round((c / n) * 100)}%)`).join(" ");
  for (const [k, c] of Object.entries(cnt)) if (c / n < 0.15 || c / n > 0.35) fails.push(`${tag}: '${k}' ulushi ${Math.round((c / n) * 100)}%`);
  console.log(`${tag}: ${n} savol; math ${sec.math}, logic ${sec.logic}, english ${sec.english}; doc ${src.doc}, new ${src.new}; ${dist}`);
}

console.log(`Tekshirildi: ${checked} savol`);
if (fails.length) { console.error(`\n${fails.length} ta XATO:`); fails.forEach((f) => console.error("  -", f)); process.exit(1); }
console.log("VERIFY OK: barcha javoblar mustaqil hisoblash bilan mos.");
