// Independent verification of grade-4 answers: recomputes every math/logic-calculation answer from the stem text
// (brute force / direct formulas) and compares with the text of the option marked `correct`.
// Also checks a table of known answers for logic/english items. Exit code 1 on any mismatch or unchecked item.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const data = JSON.parse(readFileSync(join(root, "content", "quizzes", "grade-4.json"), "utf8"));
const WD = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const hm = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const num = (x) => String(x);
const one = (arr, what) => { if (arr.length !== 1) throw new Error(`${what}: ${arr.length} yechim`); return arr[0]; };

// [regex on uz stem, (match) => expected correct option text]
const checks = [
  // ---- school (doc) questions, recomputed by brute force ----
  [/^Do'konda 2 litrlik 3a ta/, () => `${2 * 3 + 5 * 2}a`],
  [/^Men yigirmadan kichik/, () => num(one(range(10, 19).filter((n) => n % 2 === 1 && Math.floor(n / 10) + (n % 10) === 10), "2"))],
  [/^Agar 2-dekabr dushanba kuni bo'lsa, 25-dekabr/, () => cap(WD[(0 + 25 - 2) % 7])],
  [/^Oshxonada kuniga 20 kg dan/, () => num(4 * 20 - 67)],
  [/^Tenglamani yeching: 14 \+ 21 - x = 18 - 6/, () => num(one(range(0, 100).filter((x) => 14 + 21 - x === 18 - 6), "5"))],
  [/^To'g'ri to'rtburchakning eni 9 cm, bo'yi esa enidan 3 marta/, () => `${2 * (9 + 9 * 3)} cm`],
  [/^19 soni raqamlarining/, () => num(Number(String(19).split("").reverse().join("")) - 19)],
  [/^Ifodaning qiymatini toping: \(30y - 25\)/, () => num((30 * 5 - 25) - (20 * 5 + 10))],
  [/^Duradgorda 9 ta yog'och/, () => num(one(range(0, 9).filter((k) => 9 - k + 5 * k === 29), "11"))],
  [/^Tenglamani yeching: 144 : \(25 - x · x\) = 9/, () => num(one(range(1, 4).filter((x) => 144 / (25 - x * x) === 9), "12"))],
  [/^Uchta guldonda hammasi bo'lib 100/, () => num(one(range(1, 100).filter((a) => a + 2 * a + (2 * a - 15) === 100), "13") * 2)],
  [/^Do'konda 2 kg kartoshka va 3 kg piyoz/, () => {
    const s = [];
    for (const p of range(1, 30)) for (const o of range(1, 30)) if (2 * p + 3 * o === 19 && 5 * p + 6 * o === 43) s.push(o);
    return `${one(s, "14")} dollar`;
  }],
  [/^3 ta tovuq 3 kunda 3 ta tuxum/, () => num((3 / (3 * 3)) * 12 * 12)],
  [/^Ketma-ket kelgan uchta butun/, () => num(one(range(1, 90).filter((x) => x - 1 + x + x + 1 === 90), "16") + 1)],
  [/^Ikki xonali sonning o'ng tomoniga 0/, () => num(one(range(10, 99).filter((n) => 10 * n === n / 2 + 323), "17"))],
  [/^Ota va onaning yoshlari/, () => {
    const s = [];
    for (const f of range(20, 80)) for (const m of range(20, 80)) if (f + m === 84 && f - 5 === m + 3) s.push(f);
    return num(one(s, "18"));
  }],
  [/^Doskadan eshikkacha borish uchun Botir 7 ta qadam bosdi, Qodir esa 6/, () => (7 > 6 ? "Qodir" : "Botir")], // more steps => shorter step
  [/^26 ta bola futbol va gandbol/, () => num(15 + 16 - 26)],
  [/^8, 18, 28, … sonli qator/, () => num(one(range(1, 50).filter((k) => 8 + 10 * (k - 1) === 68), "21"))],
  [/^Qatorda yozilgan 5 ta sonning/, () => num(16 + 15 - 27)],
  [/^O'ylangan uch xonali son/, () => num(one(range(100, 999).filter((n) => [6, 7, 8, 9].every((k) => (n - k) % k === 0)), "23"))],
  [/^Dilnozada 21 ta 100 so'mlik/, () => num((4775 - 21 * 100 - 33 * 50) / 25)],
  [/^Palov tayyorlash uchun/, () => num(8 + 8 + 8 / 2 + 8 / 4 + 8 / 8)],
  [/^\(5a401\) soni 3 ga/, () => num(range(0, 9).filter((a) => (5 + a + 4 + 0 + 1) % 3 === 0 && a % 2 === 0).reduce((p, a) => p * a, 1))],
  [/^Har yili Ramazon hayitida Solihaning/, () => num(range(1, 6).reduce((s, x) => s + x, 0))],
  [/^Qutida 50 tadan kam pecheniye/, () => num(one(range(1, 49).filter((n) => n % 2 === 0 && n % 3 === 0 && n % 4 === 0 && n % 7 === 6), "28"))],
  [/^Bir kishi bozorga tuxum/, () => {
    const s = [];
    for (let N = 1; N <= 300; N++) {
      let e = N, ok = true;
      for (let i = 0; i < 3; i++) { if (e % 2 !== 0) { ok = false; break; } e = e - e / 2 - 1; if (e < 0) { ok = false; break; } }
      if (ok && e === 10) s.push(N);
    }
    return `${one(s, "29")} ta`;
  }],
  [/^Alida 3 ta kulcha va 8 ta/, () => {
    // each of 3 children eats 8/3 loaves; in thirds: Ali gave 9-8, Vali 15-8
    const a = 3 * 3 - 8, v = 5 * 3 - 8, total = 8;
    return `Ali ${(total * a) / (a + v)} tanga, Vali ${(total * v) / (a + v)} tanga`;
  }],

  // ---- generated (new) questions: parsed from the stem ----
  [/^Hisoblang: (\d+) \+ (\d+) = \?$/, (m) => num(+m[1] + +m[2])],
  [/^Hisoblang: (\d+) - (\d+) = \?$/, (m) => num(+m[1] - +m[2])],
  [/^Hisoblang: (\d+) × (\d+) = \?$/, (m) => num(+m[1] * +m[2])],
  [/^Hisoblang: (\d+) : (\d+) = \?$/, (m) => { if (+m[1] % +m[2]) throw new Error("bo'linmaydi"); return num(+m[1] / +m[2]); }],
  [/^(\w+) (\d+) ta daftar va (\d+) ta qalam sotib oldi\. Bitta daftar (\d+) so'm, bitta qalam (\d+) so'm/, (m) => `${m[2] * m[4] + m[3] * m[5]} so'm`],
  [/^To'g'ri to'rtburchakning eni (\d+) cm, bo'yi (\d+) cm\. Uning perimetrini/, (m) => `${2 * (+m[1] + +m[2])} cm`],
  [/^Kvadratning tomoni (\d+) cm\. Uning yuzini/, (m) => `${m[1] * m[1]} cm²`],
  [/^Tenglamani yeching: x \+ (\d+) = (\d+)$/, (m) => num(+m[2] - +m[1])],
  [/^Tenglamani yeching: (\d+) - x = (\d+)$/, (m) => num(+m[1] - +m[2])],
  [/^Ifodaning qiymatini toping: (\d+)n ([+-]) (\d+), bunda n = (\d+)\.$/, (m) => num(m[2] === "+" ? m[1] * m[4] + +m[3] : m[1] * m[4] - m[3])],
  [/^(\w+) soat (\d+):(\d+) da boshlandi va (\d+) minut davom etdi\./, (m) => hm(+m[2] * 60 + +m[3] + +m[4])],
  [/^Agar (\d+)-(\w+) (\w+) kuni bo'lsa, (\d+)-\2 haftaning qaysi kuni bo'ladi\?$/, (m) => cap(WD[(WD.indexOf(m[3]) + (+m[4] - +m[1])) % 7])],
  [/^(\d+) kg (\d+) g necha gramm/, (m) => `${m[1] * 1000 + +m[2]} g`],
  [/^(\d+) soat (\d+) minut necha minut/, (m) => `${m[1] * 60 + +m[2]} minut`],
  [/^(\d+) ning 1\/(\d+) qismini toping/, (m) => { if (m[1] % m[2]) throw new Error("bo'linmaydi"); return num(m[1] / m[2]); }],
  [/^(\d+)\/(\d+) \+ (\d+)\/\2 = \?$/, (m) => `${+m[1] + +m[3]}/${m[2]}`],
  [/^Maktab avtobusi bir qatnovda (\d+) o'quvchini olib boradi\. (\d+) o'quvchini/, (m) => num(Math.ceil(m[2] / m[1]))],
  [/^(\d+) ta olma (\d+) ta savatga/, (m) => { if (m[1] % m[2]) throw new Error("bo'linmaydi"); return num(m[1] / m[2]); }],
  [/^Kitobning (\d+) betini birinchi kuni, ikkinchi kuni esa birinchi kundagidan (\d+) bet ko'p o'qidi\. Kitobda (\d+) bet/, (m) => num(+m[3] - (+m[1] + +m[1] + +m[2]))],
  [/^(\w+) (\d+) ta daftarni (\d+) so'mdan sotib oldi va sotuvchiga (\d+) so'm berdi/, (m) => `${m[4] - m[2] * m[3]} so'm`],
  [/^Alining yoshi (\d+) da\. Otasi undan (\d+) marta katta/, (m) => `${m[1] * m[2] - m[1]} yosh`],
  [/^Ikki sonning yig'indisi (\d+), ayirmasi (\d+)\. Katta sonni/, (m) => num((+m[1] + +m[2]) / 2)],

  // ---- logic (new) ----
  [/^Qonuniyatni toping: 5, 10, 20, 40, …/, () => num(40 * 2)],
  [/^Qonuniyatni toping: 1, 4, 9, 16, …/, () => num(5 * 5)],
  [/^Qonuniyatni toping: 30, 27, 24, 21, …/, () => num(21 - 3)],
  [/^Dilnozaning 2 ta akasi va 1 ta ukasi/, () => num(2 + 1 + 1)],
  [/^Bugun chorshanba\. 10 kundan keyin/, () => cap(WD[(WD.indexOf("chorshanba") + 10) % 7])],
  [/^Agar bundan ikki kun oldin dushanba bo'lgan bo'lsa, ertaga/, () => cap(WD[(WD.indexOf("dushanba") + 2 + 1) % 7])],
  [/^Qaysi son 3 ga qoldiqsiz bo'linmaydi\?/, () => num(one([31, 18, 24, 45].filter((n) => n % 3 !== 0), "3ga"))],
];

// Known answers for non-computational items (logic reasoning + english): stem prefix -> correct option text
const known = [
  ["Farhodda dunyodagi", "Ba'zi shaharlarning nomlari bir xil."],
  ["Muattar ustoz", "Ba'zi ko'rish qobiliyati past o'quvchilar ko'zoynak ham, kontakt linza ham taqib yurmagan bo'lishi mumkin."],
  ["Avtomobil ijaraga", "Shaharga keladigan sayyohlarning aksariyati o'zbek tilini bilmaydi."],
  ["Agar shahar ichiga 8 tonnadan", "Shaharda harakatlanadigan yuk mashinalarining juda ozginasi 8 tonnadan og'irroq."],
  ["Maktabda adabiyot fanidan", "Olimpiada o'tkazilgan kuni 4-“A” sinf o'quvchilarining yarmi hasharda edi."],
  ["Diyora va Yunus", "Moviy rangdagi qalpoqli kurtkalar bir qancha bo'lishi mumkin."],
  ["Farhod: “Pianino", "Minimum talab qilinadigan darajada shug'ullanish imtihondan o'tishni kafolatlay olmasligi mumkin."],
  ["Guru mamlakati", "Guruda ishlab chiqariladigan neft va gazning katta qismi boshqa mamlakatlarga sotiladi."],
  ["Ilhom:", "So'nggi 10 yil ichida qahva yetishtiradigan mamlakatlarda noodatiy qattiq sovuq tufayli kofe narxi doimiy oshdi."],
  ["Husnora:", "Nodir hujjat topshirgan universitetning kirish imtihonlarida matematika va fizika fanlari bo'yicha savollar bo'lmaydi."],
  ["Anvar Bobirdan baland", "Karim"],
  ["Qaysi so'z ortiqcha", "sabzi"],
  ["Poygada Jasur", "Nodir"],
  ["Find antonyms", "tall / strong"],
  ["Choose the appropriate questions", "Where are you from? / How are you?"],
  ["A person, who helps", "a secretary"],
  ["We _____ play with matches", "mustn't, must, mustn't"],
  ["Find the correct answer: hamshira", "nurse, fireman, gardener."],
  ["Find words about profession", "driver, engineer, housewife, pilot."],
  ["Find countable nouns", "nut, apple, melon"],
  ["…… works in a restaurant", "a chef"],
  ["The United Kingdom is divided", "4"],
  ["Robot has", "square / round / brown"],
  ["What do we call granny", "grandparents"],
  ["He goes to school ___ bus", "by / on"],
  ["What is “librarian”", "kutubhonachi"],
  ["Which question is not correct", "What time you did arrived?"],
  ["Find the true translation", "rice, carrot, juice."],
  ["Which nouns can be used after the article", "peach, table, sister"],
  ["Find the correct sentence with “many”", "I am sociable, I have many friends."],
  ["- What are you doing now?", "- I am reading."],
  ["I have ___ umbrella.", "an"],
  ["There isn't ___ milk", "any"],
  ["How ___ eggs", "many"],
  ["Look! The children", "are playing"],
  ["My father ___ to work", "goes"],
  ["We have English lessons", "on"],
  ["A person who treats sick", "doctor"],
  ["The capital of England", "London"],
  ["Which word is uncountable", "water"],
  ["My sister eats ___ orange", "an"],
  ["Can I have ___ water", "some"],
  ["There isn't ___ sugar", "much"],
  ["Listen! Anna", "is playing"],
  ["They ___ breakfast at 7", "have"],
  ["I get up ___ 7 o'clock", "at"],
  ["A person who flies a plane", "pilot"],
  ["There are ___ months in a year", "twelve"],
  ["Which word is countable", "banana"],
];

let fail = 0, okCount = 0;
const bad = (msg) => { fail++; console.error("XATO:", msg); };
const seen = new Map();
for (const v of data.variants) {
  for (const [i, q] of v.questions.entries()) {
    const tag = `V${v.variant} #${i + 1}`;
    const stem = q.stem.uz;
    const corr = q.options.find((o) => o.id === q.correct)?.text.uz;
    if (corr === undefined) { bad(`${tag}: correct topilmadi`); continue; }
    const key = stem.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) bad(`${tag}: matn ${seen.get(key)} bilan takrorlanadi`); else seen.set(key, tag);
    const dup = q.options.filter((o) => o.text.uz === corr).length;
    if (dup !== 1) bad(`${tag}: to'g'ri javob matni variantlarda ${dup} marta`);
    if (q.section === "english") {
      for (const o of q.options) if (o.text.uz !== o.text.ru || o.text.uz !== o.text.en) bad(`${tag}: inglizcha matn uz/ru/en bir xil emas`);
      if (q.stem.uz !== q.stem.ru || q.stem.uz !== q.stem.en) bad(`${tag}: stem uz/ru/en bir xil emas`);
    }
    let expected, matched = false;
    for (const [re, fn] of checks) {
      const m = stem.match(re);
      if (m) { try { expected = fn(m); matched = true; } catch (e) { bad(`${tag}: hisoblashda xato: ${e.message}`); matched = null; } break; }
    }
    if (matched === null) continue;
    if (!matched) {
      const k = known.find(([p]) => stem.startsWith(p) || stem.includes(p));
      if (!k) { bad(`${tag}: tekshiruv qoidasi yo'q: ${stem.slice(0, 60)}`); continue; }
      expected = k[1];
    }
    if (expected !== corr) bad(`${tag}: kutilgan "${expected}", faylda "${corr}" — ${stem.slice(0, 60)}`);
    else okCount++;
  }
}
console.log(`Tekshirildi: ${okCount} ta savol to'g'ri, ${fail} ta xato.`);
process.exit(fail ? 1 : 0);
