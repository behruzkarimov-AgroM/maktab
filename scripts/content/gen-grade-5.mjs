// Generates content/quizzes/grade-5.json (4 variants). Run: node scripts/content/gen-grade-5.mjs
// Variants 1-2: the school's Word test (solved by us, source "doc"); variants 3-4 + a few extras: new questions (source "new").
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const fstr = (n, d) => { const g = gcd(n, d); n /= g; d /= g; return d === 1 ? String(n) : `${n}/${d}`; };

const M = (stem, correct, wrongs, expl, source = "new") => ({ section: "math", stem, correct, wrongs, expl, source });
const E = (stem, correct, wrongs, expl, source = "new") => ({ section: "english", stem, correct, wrongs, expl, source });

// ======================= DOC QUESTIONS (solved) =======================
const doc = {
  1: M("Ifodaning qiymatini toping: 11160 : 6 + 576 : 12 - 199 + 1", "1710", ["1800", "1709", "1740"], "11160 : 6 = 1860; 576 : 12 = 48. 1860 + 48 = 1908; 1908 - 199 = 1709; 1709 + 1 = 1710.", "doc"),
  2: M("Yuzi 289 dm^2 ga teng bo'lgan kvadratning perimetrini toping.", "68 dm", ["68 sm", "17 dm", "34 dm"], "Kvadrat tomoni 17 dm (17 × 17 = 289). Perimetr = 4 × 17 = 68 dm.", "doc"),
  3: M("To'g'ri bajarilgan ifodani toping:", "3267 : 33 = 99", ["87 · 99 = 8623", "109 · 107 = 11563", "1892 : 172 = 21"], "33 × 99 = 3267, demak 3267 : 33 = 99 to'g'ri. Qolganlari: 87 · 99 = 8613; 109 · 107 = 11663; 1892 : 172 = 11.", "doc"),
  4: M("Tenglamani yeching: 3 · (2 · (6x - 2)) = 24", "1", ["9", "7", "17"], "Ikkala tomonni 3 ga bo'lamiz: 2 · (6x - 2) = 8, so'ng 2 ga: 6x - 2 = 4, 6x = 6, x = 1.", "doc"),
  5: M("Ko'paytma necha xonali son? 12345 · 987", "8", ["7", "11", "9"], "12345 · 987 = 12 184 515 — 8 xonali son.", "doc"),
  6: M("Yig'indini hisoblang: (6/13) + (12/26) + (2/26)", "1", ["13", "1/13", "1/26"], "6/13 = 12/26. 12/26 + 12/26 + 2/26 = 26/26 = 1.", "doc"),
  7: M("Hisoblang: 7^2 - 6^2 + 5^2 - 4^2", "22", ["23", "27", "21"], "49 - 36 + 25 - 16 = 13 + 9 = 22.", "doc"),
  8: M("25 · x + 1 = 51 va 8 · y + 45 = 53 bo'lsa, (x + y) : 3 ni toping.", "1", ["0", "2", "3"], "25x = 50, x = 2; 8y = 8, y = 1. (2 + 1) : 3 = 1.", "doc"),
  9: M("Natural sonlar ketma-ketligi to'g'ri berilgan qatorni toping.", "1,2,3,4,5,6,7,8,9…", ["1,2,3,4,5,6,7,8,9", "0,1,2,3,4,5,6,7,8,9,…", "10,11,12,13,…"], "Natural sonlar 1 dan boshlanadi (0 natural son emas) va cheksiz davom etadi.", "doc"),
  10: M("15 ar necha sotixga teng?", "15", ["1500", "15000", "150"], "1 ar = 1 sotix (100 m^2). Demak 15 ar = 15 sotix.", "doc"),
  11: M("Jasur kitobning beshdan bir qismini o'qiganidan so'ng, kitobning yana 48 beti qoldi. Kitob necha betli?", "60", ["96", "108", "52"], "Qolgan qism 4/5. 4/5 = 48 bet, 1/5 = 12 bet, butun kitob 12 × 5 = 60 bet.", "doc"),
  12: M("Tenglamani yeching: 2025 + (3x/2) = 4048 + (x/2)", "2023", ["2024", "2025", "1/2024"], "3x/2 - x/2 = 4048 - 2025, ya'ni x = 2023.", "doc"),
  13: M("Qaysi tenglik to'g'ri?", "17 km = 17000 m", ["17 ar = 17 ha", "17 m^2 = 170 dm^2", "17 ar = 170 m^2"], "1 km = 1000 m, demak 17 km = 17000 m. Boshqalari: 17 ar = 1700 m^2; 17 m^2 = 1700 dm^2; 17 ar = 0,17 ha.", "doc"),
  14: M("Uchta nevara buvisidan uning yoshi haqida so'radi. Buvi esa “O'zlaring topib ko'ringlar-chi?!” – deb javob berdi. Shundan keyin nevaralar quyidagicha o'z fikrlarini aytishdi: “Sizning yoshingiz 75 da”, “Sizning yoshingiz 78 da”, “Sizning yoshingiz 81 da”. Nevaralarning aytganlaridan bittasi 1 yilga, boshqasi 2 yilga, yana boshqasi 4 yilga adashdi. Buvining yoshi nechada bo'lishi mumkin?", "77 yoki 79", ["77 yoki 80", "79 yoki 80", "79 yoki 82"], "77 bo'lsa xatolar 2, 1, 4 — mos. 79 bo'lsa xatolar 4, 1, 2 — mos. Boshqa yosh mos kelmaydi.", "doc"),
  15: M("84 ta kitob sotib olindi. Hamma kitobning (3/7) qismi rus tilida, qolgani o'zbek tilida. Nechta o'zbekcha kitob sotib olingan?", "48", ["42", "49", "63"], "O'zbekcha kitoblar 4/7 qism: 84 : 7 × 4 = 12 × 4 = 48.", "doc"),
  16: M("O'lchamlari 5 sm, 6 sm, 7 sm bo'lgan to'g'ri burchakli parallelepiped hajmini toping.", "210 sm^3", ["120 sm^3", "210 sm^2", "240 sm^3"], "Hajm = 5 × 6 × 7 = 210 sm^3.", "doc"),
  17: M("(1/8) + (1/8) + (1/8) + … + (1/8) (n ta qo'shiluvchi) = 95 bo'lsa, n ning qiymatini toping.", "760", ["660", "560", "780"], "n × (1/8) = 95, n = 95 × 8 = 760.", "doc"),
  18: M("Hisoblang: ((202)^2 - 54^2 + 256 · 352) : (4^4 · 10^2)", "5", ["4", "1", "10"], "202^2 = 40804; 54^2 = 2916; 256 · 352 = 90112. Surat: 40804 - 2916 + 90112 = 128000. Maxraj: 256 · 100 = 25600. 128000 : 25600 = 5.", "doc"),
  19: M("Hisoblang: 11 sm^2 - 1000 mm^2", "100 mm^2", ["200 mm^2", "20 mm^2", "11 mm^2"], "1 sm^2 = 100 mm^2, demak 11 sm^2 = 1100 mm^2. 1100 - 1000 = 100 mm^2.", "doc"),
  20: M("Yig'indini hisoblang: (1/(1 - (1/2))) + (1/(1 - (1/2)))", "4", ["2", "3", "1"], "1 - 1/2 = 1/2, 1 : (1/2) = 2. 2 + 2 = 4.", "doc"),
  21: M("Oralaridagi masofa 108 km bo'lgan ikki velosipedchi bir vaqtda bir-biriga qarab yo'lga chiqdi va 3 soatdan keyin uchrashishdi. Birinchi velosipedchining tezligi ikkinchisidan 4 km/h ortiq bo'lsa, har bir velosipedchining tezligini toping.", "20 km/h, 16 km/h", ["18 km/h, 14 km/h", "22 km/h, 18 km/h", "16 km/h, 12 km/h"], "Yaqinlashish tezligi 108 : 3 = 36 km/h. Ikkinchisi (36 - 4) : 2 = 16 km/h, birinchisi 20 km/h.", "doc"),
  22: M("Agar 4a + 5d - 2c = 2024 bo'lsa, (a + 4d - 2c + 1) + (d + 3a) = ?", "2025", ["2023", "2024", "2027"], "Qavslarni ochib o'xshashlarini jamlaymiz: 4a + 5d - 2c + 1 = 2024 + 1 = 2025.", "doc"),
  23: M("(27/11) va (3 · x/121) kasrlar x ning qanday qiymatida teng bo'ladi?", "99", ["88", "108", "81"], "27/11 = 3x/121 bo'lsa, 3x = 27 · 11 = 297, x = 99.", "doc"),
  24: M("Ifodaning qiymatini toping: ((12/17) + (1/19) + (32/43)) + ((18/19) + (5/17) + (11/43))", "3", ["973/323", "897/323", "1236/817"], "Bir xil maxrajlilarni juftlaymiz: 12/17 + 5/17 = 1; 1/19 + 18/19 = 1; 32/43 + 11/43 = 1. Jami 3.", "doc"),
  25: M("Hisoblang: (1 - (1/2024)) : (2023/2024) + 2023", "2024", ["2023", "2025", "2026"], "1 - 1/2024 = 2023/2024. (2023/2024) : (2023/2024) = 1. 1 + 2023 = 2024.", "doc"),
  26: M("Agar x = 7 bo'lsa, ifodaning qiymatini toping: 3 · (47 - x) + 29 - 38 + x - 80 + x", "45", ["57", "83", "59"], "3 · 40 = 120. 120 + 29 - 38 + 7 - 80 + 7 = 45.", "doc"),
  27: M("A mulohaza: “Har qanday juft son 6 ga qoldiqsiz bo'linadi”, B mulohaza: “Har qanday 6 ga qoldiqsiz bo'linadigan son juft son bo'ladi”. Ushbu mulohazalar asosida to'g'ri javobni toping.", "A yolg'on va B rost", ["A rost va B yolg'on", "A yolg'on va B yolg'on", "A rost va B rost"], "A yolg'on: 4 juft, lekin 6 ga bo'linmaydi. B rost: 6 ga bo'linadigan har bir son 2 ga ham bo'linadi.", "doc"),
  28: M("Anora, Salim, Javlon va Aziz yaqin do'st. Anora Salimdan 3 yosh va Javlondan esa 6 yosh katta. Aziz esa 36 yosh va u Javlondan 3 yosh katta bo'lsa, to'rtta do'stning yoshlari yig'indisini toping.", "144", ["124", "152", "156"], "Javlon 36 - 3 = 33; Anora 33 + 6 = 39; Salim 39 - 3 = 36; Aziz 36. Yig'indi: 33 + 39 + 36 + 36 = 144.", "doc"),
  30: M("Agar a = (666/222) + (444/111) - (55/11) va b = (999/333) + (333/111) - (44/11) bo'lsa, a : b = ?", "(1/5)^0", ["22/23", "10", "To'g'ri javob yo'q"], "a = 3 + 4 - 5 = 2; b = 3 + 3 - 4 = 2. a : b = 1. (1/5)^0 = 1 (har qanday noldan farqli sonning 0-darajasi 1 ga teng).", "doc"),
  31: E("“Are you Canadian?” “No, but I have ___ good friends in Canada.”", "some", ["any", "a", "an"], "Darak gapda ko'plikdagi sanaladigan otlar oldidan “some” ishlatiladi.", "doc"),
  32: E("___ rice is there?", "How much", ["How many", "How long", "How"], "Rice sanalmaydigan ot, shuning uchun “How much” ishlatiladi.", "doc"),
  33: E("There are ___ sandwiches, but there ___ any chips.", "some / aren't", ["some / are", "any / aren't", "any / are"], "Darak gapda “some sandwiches”, inkor gapda “aren't any chips”.", "doc"),
  34: E("They ___ oranges, they are pineapples.", "aren't", ["haven't", "don't", "are"], "“They are pineapples” — ular apelsin emas: “They aren't oranges”.", "doc"),
  35: E("___ your father ___ at the Medical College? – Yes, he does.", "Does / work", ["Do / work", "Does / works", "Do / works"], "He/she/it bilan savolda “Does” ishlatiladi, fe'l esa asosiy shaklda: Does your father work...?", "doc"),
  36: E("I ___ know this person.", "don't", ["doesn't", "didn't", "am not"], "“I” bilan Present Simple inkori: I don't know.", "doc"),
  37: E("Nick ___ yesterday.", "did not come", ["will not come", "did not came", "comes"], "“Yesterday” — o'tgan zamon; did not dan keyin fe'l asosiy shaklda: did not come.", "doc"),
  38: E("There are a few ___ in the forest.", "deer", ["deers", "deeres", "a deer"], "“Deer” ko'plikda ham o'zgarmaydi; “a few” ko'plik ot bilan keladi.", "doc"),
  39: E("John ___ play the guitar. He can play the piano.", "can't", ["can", "does", "don't"], "Ikkinchi gap “U pianino chala oladi” deydi, demak gitara chala olmaydi: John can't play.", "doc"),
  40: E("She ___ dishes every day.", "washes", ["wash", "washs", "washing"], "She bilan Present Simple: fe'lga -es qo'shiladi (wash -> washes).", "doc"),
  41: E("Are you a worker? No, ___.", "I'm not", ["I am", "you aren't", "I amn't"], "Inkor javob: No, I'm not. “Amn't” shakli ishlatilmaydi.", "doc"),
  42: E("– Do you like swimming? – Yes, I ___.", "do", ["likes", "am", "does"], "Do bilan berilgan savolga qisqa javob: Yes, I do.", "doc"),
  43: E("It often rains ___ spring.", "in", ["on", "at", "-"], "Fasllar bilan “in” ishlatiladi: in spring.", "doc"),
  44: E("___ old is your mother?", "How", ["What", "Where", "Why"], "Yoshni so'rash: How old...?", "doc"),
  45: E("Is ___ his bag on the table? Yes, it is.", "that", ["these", "the", "those"], "Birlikdagi uzoqdagi narsaga “that” ishlatiladi: Is that his bag...?", "doc"),
  46: E("Do you have any ___? No, I don't.", "dictionaries", ["a dictionary", "dictionarys", "dictionary"], "“Any” dan keyin ko'plik ot keladi; dictionary -> dictionaries (y -> ies).", "doc"),
  47: E("The mixture looks rather dry. Maybe you should add ___ water.", "a little", ["a", "a lot", "many"], "Water sanalmaydi: “a little water” (ozgina suv). “Many” va “a” mos kelmaydi.", "doc"),
  48: E("My plane ___ at 5:30 every morning.", "leaves", ["leaving", "leave", "leaved"], "“Plane” birlik (it) va takrorlanuvchi ish: Present Simple -s bilan — leaves.", "doc"),
  49: E("We do not go to school ___ Sunday.", "on", ["in", "at", "to"], "Hafta kunlari bilan “on” ishlatiladi: on Sunday.", "doc"),
  50: E("These shoes are ___.", "mine", ["my", "I", "me"], "Egalik olmoshi (mustaqil shakl): These shoes are mine.", "doc"),
};

// ======================= NEW QUESTIONS =======================
// ---- extras in variants 1-2
const v1MathExtra = M("Hisoblang: 2^5 + sqrt(49) - 3 × 4", String(2 ** 5 + 7 - 12), ["39", "23", "5"], "2^5 = 32; sqrt(49) = 7; 3 × 4 = 12. 32 + 7 - 12 = 27.");
const v2MathExtra1 = M("Hisoblang: 3 2/7 + 1 4/7", "4 6/7", ["4 4/7", "5 6/7", "4 6/14"], "Butun qismlar: 3 + 1 = 4. Kasr qismlar: 2/7 + 4/7 = 6/7. Javob: 4 6/7.");
const v2MathExtra2 = M("Eni 8 sm, bo'yi 15 sm bo'lgan to'g'ri to'rtburchakning yuzini toping.", `${8 * 15} sm^2`, ["46 sm^2", "120 sm", "60 sm^2"], "Yuz = eni × bo'yi = 8 × 15 = 120 sm^2.");
const v1EnExtra = E("___ is your teacher from? – From Tashkent.", "Where", ["When", "Who", "Why"], "Qayerdan ekanligini so'rash uchun “Where” ishlatiladi.");
const v2EnExtra = E("He ___ got a computer.", "hasn't", ["haven't", "doesn't", "don't"], "He bilan have got inkori: hasn't got.");

// ---- variant 3 / 4 math (16 each)
const meet = (d, t, diff) => { const s = d / t; const v2 = (s - diff) / 2; return [v2 + diff, v2, s]; };
const m3 = [];
{
  const v = 7200 / 8 + 432 / 12 - 150 + 3;
  m3.push(M("Ifodaning qiymatini toping: 7200 : 8 + 432 : 12 - 150 + 3", String(v), [String(v - 3), String(v + 300), String(v + 10)], "7200 : 8 = 900; 432 : 12 = 36. 900 + 36 = 936; 936 - 150 = 786; 786 + 3 = 789."));
  m3.push(M("Yuzi 196 dm^2 ga teng bo'lgan kvadratning perimetrini toping.", `${4 * 14} dm`, ["14 dm", "28 dm", "56 sm"], "Kvadrat tomoni 14 dm (14 × 14 = 196). Perimetr = 4 × 14 = 56 dm."));
  m3.push(M("Quyidagi tengliklardan qaysi biri to'g'ri bajarilgan?", "46 · 98 = 4508", [`64 · 25 = ${64 * 25 + 50}`, `2415 : 15 = ${2415 / 15 + 10}`, `123 · 101 = ${123 * 101 - 90}`], "46 × 98 = 46 × 100 - 46 × 2 = 4600 - 92 = 4508. Qolganlari: 64 · 25 = 1600; 2415 : 15 = 161; 123 · 101 = 12423."));
  m3.push(M("Tenglamani yeching: 4 · (3x - 2) = 40", "4", ["3", "5", "12"], "Ikkala tomonni 4 ga bo'lamiz: 3x - 2 = 10, 3x = 12, x = 4."));
  m3.push(M("Ko'paytma necha xonali son? 4321 · 765", String(String(4321n * 765n).length), ["5", "6", "8"], `4321 · 765 = ${4321n * 765n} — ${String(4321n * 765n).length} xonali son.`));
  m3.push(M("Yig'indini hisoblang: (5/14) + (3/7) + (1/14)", fstr(12, 14), [fstr(9, 35), "5/7", "9/14"], "3/7 = 6/14. 5/14 + 6/14 + 1/14 = 12/14 = 6/7."));
  m3.push(M("Hisoblang: 9^2 - 8^2 + 7^2 - 6^2", String(81 - 64 + 49 - 36), ["28", "32", "36"], "81 - 64 + 49 - 36 = 17 + 13 = 30."));
  m3.push(M("12 · x + 3 = 51 va 7 · y + 20 = 48 bo'lsa, (x + y) : 2 ni toping.", "4", ["3", "5", "8"], "12x = 48, x = 4; 7y = 28, y = 4. (4 + 4) : 2 = 4."));
  m3.push(M("30 ar necha m^2 ga teng?", `${30 * 100} m^2`, ["300 m^2", "30000 m^2", "30 m^2"], "1 ar = 100 m^2. 30 ar = 30 × 100 = 3000 m^2."));
  m3.push(M("Madina kitobning (1/4) qismini o'qiganidan so'ng, kitobning yana 36 beti qoldi. Kitob necha betli?", String(36 / 3 * 4), ["45", "144", "40"], "Qolgan qism 3/4. 3/4 = 36 bet, 1/4 = 12 bet, butun kitob 12 × 4 = 48 bet."));
  m3.push(M("Tenglamani yeching: 100 + (5x/3) = 130 + (2x/3)", "30", ["10", "90", "130"], "5x/3 - 2x/3 = 130 - 100, ya'ni 3x/3 = x = 30."));
  m3.push(M("O'lchamlari 4 sm, 5 sm, 9 sm bo'lgan to'g'ri burchakli parallelepiped hajmini toping.", `${4 * 5 * 9} sm^3`, ["180 sm^2", "90 sm^3", "36 sm^3"], "Hajm = 4 × 5 × 9 = 180 sm^3."));
  m3.push(M("(18/24) kasrni qisqartiring.", fstr(18, 24), ["2/3", "1/3", "6/7"], "Surat va maxrajni 6 ga bo'lamiz: 18/24 = 3/4."));
  m3.push(M("Do'konda 63 ta daftar bor edi. Ularning (4/9) qismi sotildi. Nechta daftar qoldi?", String(63 - 63 * 4 / 9), ["28", "45", "7"], "Qolgan qism 5/9. 63 : 9 × 5 = 7 × 5 = 35."));
  const [a, b, s] = meet(120, 2, 10);
  m3.push(M("Oralaridagi masofa 120 km bo'lgan ikki mototsiklchi bir vaqtda bir-biriga qarab yo'lga chiqdi va 2 soatdan keyin uchrashishdi. Birinchisining tezligi ikkinchisidan 10 km/h ortiq bo'lsa, ularning tezliklarini toping.", `${a} km/h, ${b} km/h`, ["40 km/h, 30 km/h", "30 km/h, 20 km/h", "45 km/h, 15 km/h"], `Yaqinlashish tezligi 120 : 2 = ${s} km/h. Ikkinchisi (${s} - 10) : 2 = ${b} km/h, birinchisi ${a} km/h.`));
  m3.push(M("Ketma-ket uchta natural sonning yig'indisi 48 ga teng. Shu sonlarning eng kichigini toping.", String((48 - 3) / 3), ["14", "16", "17"], "Sonlar n, n + 1, n + 2: 3n + 3 = 48, n = 15 (15 + 16 + 17 = 48)."));
}
const m4 = [];
{
  const v = 4800 / 6 + 392 / 14 - 125 + 5;
  m4.push(M("Ifodaning qiymatini toping: 4800 : 6 + 392 : 14 - 125 + 5", String(v), [String(v - 5), String(v + 250), String(v + 10)], "4800 : 6 = 800; 392 : 14 = 28. 800 + 28 = 828; 828 - 125 = 703; 703 + 5 = 708."));
  m4.push(M("Perimetri 52 sm bo'lgan kvadratning yuzini toping.", `${13 * 13} sm^2`, ["52 sm^2", "26 sm^2", "169 sm"], "Kvadrat tomoni 52 : 4 = 13 sm. Yuz = 13 × 13 = 169 sm^2."));
  m4.push(M("Qaysi amal natijasi to'g'ri yozilgan?", "38 · 99 = 3762", [`75 · 12 = ${75 * 12 + 50}`, `2924 : 34 = ${2924 / 34 - 2}`, `205 · 31 = ${205 * 31 + 100}`], "38 × 99 = 3800 - 38 = 3762. Qolganlari: 75 · 12 = 900; 2924 : 34 = 86; 205 · 31 = 6355."));
  m4.push(M("Tenglamani yeching: 5 · (2x + 3) = 65", "5", ["4", "6", "10"], "Ikkala tomonni 5 ga bo'lamiz: 2x + 3 = 13, 2x = 10, x = 5."));
  m4.push(M("Ko'paytma necha xonali son? 98765 · 4321", String(String(98765n * 4321n).length), ["7", "8", "10"], `98765 · 4321 = ${98765n * 4321n} — ${String(98765n * 4321n).length} xonali son.`));
  m4.push(M("Yig'indini hisoblang: (7/18) + (5/9) + (1/18)", "1", [fstr(13, 45), "17/18", "1/18"], "5/9 = 10/18. 7/18 + 10/18 + 1/18 = 18/18 = 1."));
  m4.push(M("Hisoblang: 10^2 - 9^2 + 8^2 - 7^2", String(100 - 81 + 64 - 49), ["32", "36", "38"], "100 - 81 + 64 - 49 = 19 + 15 = 34."));
  m4.push(M("15 · x + 5 = 65 va 9 · y + 18 = 72 bo'lsa, (x + y) : 5 ni toping.", "2", ["1", "3", "10"], "15x = 60, x = 4; 9y = 54, y = 6. (4 + 6) : 5 = 2."));
  m4.push(M("6 gektar necha ar ga teng?", `${6 * 100} ar`, ["60 ar", "6000 ar", "6 ar"], "1 gektar = 100 ar. 6 gektar = 6 × 100 = 600 ar."));
  m4.push(M("Sardor pulining (2/5) qismini sarfladi, yana 45000 so'm qoldi. Dastlab necha so'm pul bor edi?", String(45000 / 3 * 5), ["18000", "112500", "60000"], "Qolgan qism 3/5. 3/5 = 45000 so'm, 1/5 = 15000, hammasi 15000 × 5 = 75000 so'm."));
  m4.push(M("Tenglamani yeching: (7x/4) + 12 = (3x/4) + 40", "28", ["24", "40", "112"], "7x/4 - 3x/4 = 40 - 12, ya'ni 4x/4 = x = 28."));
  m4.push(M("Uzunligi 12 m, eni 7 m bo'lgan to'g'ri to'rtburchakning perimetrini toping.", `${2 * (12 + 7)} m`, ["84 m", "19 m", "38 m^2"], "Perimetr = 2 × (12 + 7) = 2 × 19 = 38 m."));
  m4.push(M("Aralash sonni noto'g'ri kasrga aylantiring: 2 3/5", fstr(2 * 5 + 3, 5), ["6/5", "11/5", "17/5"], "2 3/5 = (2 × 5 + 3)/5 = 13/5."));
  m4.push(M("72 ta olma bor. Ularning (5/8) qismi qizil, qolgani yashil. Nechta yashil olma bor?", String(72 - 72 * 5 / 8), ["45", "40", "9"], "Yashil olmalar 3/8 qism: 72 : 8 × 3 = 9 × 3 = 27."));
  const [a, b, s] = meet(90, 3, 6);
  m4.push(M("Oralaridagi masofa 90 km bo'lgan ikki skuterchi bir vaqtda bir-biriga qarab yo'lga chiqdi va 3 soatdan keyin uchrashishdi. Birinchisining tezligi ikkinchisidan 6 km/h ortiq bo'lsa, ularning tezliklarini toping.", `${a} km/h, ${b} km/h`, ["20 km/h, 14 km/h", "21 km/h, 9 km/h", "16 km/h, 10 km/h"], `Yaqinlashish tezligi 90 : 3 = ${s} km/h. Ikkinchisi (${s} - 6) : 2 = ${b} km/h, birinchisi ${a} km/h.`));
  m4.push(M("Ketma-ket uchta natural sonning yig'indisi 63 ga teng. Shu sonlarning eng kichigini toping.", String((63 - 3) / 3), ["19", "21", "22"], "Sonlar n, n + 1, n + 2: 3n + 3 = 63, n = 20 (20 + 21 + 22 = 63)."));
}

const e3 = [
  E("My sister ___ a doctor.", "is", ["are", "am", "be"], "She (my sister) bilan “to be” ning shakli — is."),
  E("We ___ football on Saturdays.", "play", ["plays", "playing", "to play"], "We bilan Present Simple: fe'l asosiy shaklda — play."),
  E("Look! The children ___ in the garden.", "are playing", ["play", "plays", "is playing"], "“Look!” — hozir bo'layotgan ish (Present Continuous). Children ko'plik: are playing."),
  E("I have ___ umbrella in my bag.", "an", ["a", "two", "these"], "“Umbrella” unli tovush bilan boshlanadi, shuning uchun “an umbrella”."),
  E("There ___ some milk in the fridge.", "is", ["are", "am", "be"], "Milk sanalmaydigan ot, “there is” ishlatiladi."),
  E("The book is ___ the table.", "on", ["in", "at", "of"], "Stol ustida: on the table."),
  E("Tom has a blue bike. The blue bike is ___.", "his", ["he", "him", "he's"], "Tom (erkak) — egalik olmoshi “his” (uniki)."),
  E("___ do you go to school? – By bus.", "How", ["What", "Who", "Where"], "Qanday qatnashni so'rash: How do you go...? (By bus — avtobusda)."),
  E("I haven't got ___ money.", "any", ["some", "a", "many"], "Inkor gapda sanalmaydigan ot bilan “any” ishlatiladi."),
  E("There are two ___ in the box.", "knives", ["knifes", "knife", "knive"], "Knife -> knives (-fe -> -ves)."),
  E("How ___ students are there in your class?", "many", ["much", "a lot", "little"], "Students sanaladigan ot, shuning uchun “How many”."),
];
const e4 = [
  E("My brothers ___ at school now.", "are", ["is", "am", "be"], "Brothers ko'plik: are."),
  E("Tom ___ breakfast at 7 o'clock.", "has", ["have", "having", "haves"], "Tom (he) bilan Present Simple: have -> has."),
  E("Listen! She ___ to music.", "is listening", ["listen", "listening", "are listening"], "“Listen!” — hozir bo'layotgan ish: she is listening."),
  E("He is ___ honest boy.", "an", ["a", "many", "these"], "“Honest” dagi h o'qilmaydi, so'z unli tovush bilan boshlanadi: an honest boy."),
  E("There ___ three cats under the tree.", "are", ["is", "am", "be"], "Three cats — ko'plik: there are."),
  E("We have lunch ___ 1 o'clock.", "at", ["in", "on", "to"], "Aniq soat bilan “at” ishlatiladi."),
  E("This pen is mine and that pen is Ann's. That pen is ___.", "hers", ["she", "her", "she's"], "Ann (ayol) — egalik olmoshi “hers” (uniki)."),
  E("___ is your birthday? – In May.", "When", ["Who", "Where", "Whose"], "Vaqtni so'rash: When?"),
  E("We don't have ___ bread today.", "any", ["some", "a", "many"], "Inkor gapda sanalmaydigan ot bilan “any”."),
  E("I see five ___ in the picture.", "women", ["womans", "womens", "woman"], "Woman -> women (tartibsiz ko'plik)."),
  E("She drinks ___ of water every day.", "a lot", ["many", "much", "few"], "“A lot of” sanaladigan va sanalmaydigan otlar bilan ishlatiladi."),
];

// ======================= ASSEMBLY =======================
const mathV1 = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 30];
const mathV2 = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
const enV1 = [31, 33, 35, 37, 39, 41, 43, 45, 47, 49];
const enV2 = [32, 34, 36, 38, 40, 42, 44, 46, 48, 50];
const lists = {
  1: [...mathV1.map((n) => doc[n]), v1MathExtra, ...enV1.map((n) => doc[n]), v1EnExtra],
  2: [...mathV2.map((n) => doc[n]), v2MathExtra1, v2MathExtra2, ...enV2.map((n) => doc[n]), v2EnExtra],
  3: [...m3, ...e3],
  4: [...m4, ...e4],
};

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const LET = ["A", "B", "C", "D"];

function finalize(vn, qs) {
  const rand = rng(1000 + vn * 7919);
  const targets = qs.map((_, i) => LET[i % 4]);
  for (let i = targets.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [targets[i], targets[j]] = [targets[j], targets[i]]; }
  return qs.map((q, i) => {
    if (q.wrongs.length !== 3) throw new Error(`variant ${vn} q${i + 1}: need 3 wrongs (${q.stem})`);
    const all = [q.correct, ...q.wrongs].map((x) => x.toLowerCase().replace(/\s+/g, ""));
    if (new Set(all).size !== 4) throw new Error(`variant ${vn} q${i + 1}: duplicate options (${q.stem})`);
    const t = LET.indexOf(targets[i]);
    const texts = [];
    let wi = 0;
    for (let k = 0; k < 4; k++) texts.push(k === t ? q.correct : q.wrongs[wi++]);
    const en = q.section === "english";
    const T = (s) => (en ? { uz: s, ru: s, en: s } : { uz: s });
    return { section: q.section, stem: T(q.stem), options: texts.map((x, k) => ({ id: LET[k], text: T(x) })), correct: targets[i], explanation: { uz: q.expl }, source: q.source };
  });
}

const mk = (vn, qs) => {
  const n = qs.length;
  return {
    variant: vn,
    title: { uz: `5-sinf · Aralash test · ${vn}-variant`, ru: `5 класс · Смешанный тест · Вариант ${vn}`, en: `Grade 5 · Mixed test · Variant ${vn}` },
    description: {
      uz: `5-sinf uchun matematika va ingliz tili bo'yicha aralash test (${n} ta savol).`,
      ru: `Смешанный тест для 5 класса по математике и английскому языку (${n} вопросов).`,
      en: `A mixed maths and English test for Grade 5 (${n} questions).`,
    },
    durationMinutes: 45, passPercent: 60, difficulty: "medium",
    questions: finalize(vn, qs),
  };
};

const notes = [
  "Word faylda javoblar kaliti yo'q edi: barcha 49 ta savolni biz yechdik. Iltimos, 1- va 2-variantdagi to'g'ri javoblarni maktab o'qituvchisi tekshirib chiqsin.",
  "Manba faylning 50 ta savolidan № 29 (shakl bo'yicha yuz topish) rasmga bog'liq bo'lgani uchun kiritilmadi. Qolgan 49 tasi ikkiga bo'lindi: 1-variantga № 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 30 (matematika) va № 31, 33, ..., 49 (ingliz tili); 2-variantga № 2, 4, 6, ..., 28 (matematika) va № 32, 34, ..., 50 (ingliz tili). Har variantga 2-3 ta yangi savol qo'shildi (source: new) — jami 27 tadan.",
  "Javob variantlari harflar tekis taqsimlansin deb aralashtirildi (to'g'ri javob doim bir xil harfda bo'lmasligi uchun); savol matnlari o'zgarmadi.",
  "№ 4: manbada qavslar muvozanatsiz edi: “3 · (2 · (6x - 2) = 24”. Mo'ljallangan ifoda “3 · (2 · (6x - 2)) = 24” deb olindi, javob x = 1 (variantlarda bor).",
  "№ 8: ʘ va E belgilari x va y harflariga almashtirildi (25 · x + 1 = 51 va 8 · y + 45 = 53, javob (x + y) : 3 = 1).",
  "№ 13 (moslashtirish turi, ichki ro'yxatli) oddiy 4 variantli savolga aylantirildi: “Qaysi tenglik to'g'ri?” (17 km = 17000 m to'g'ri; boshqalari: 17 ar = 17 ha, 17 m^2 = 170 dm^2, 17 ar = 170 m^2 noto'g'ri). Manbada “17 00 dm^2” deb yozilgan xato ham bor edi.",
  "№ 9: natural sonlar 1 dan boshlanadi va cheksiz — to'g'ri javob “1,2,3,...,9…” qatori (0 natural son emas deb olindi).",
  "№ 10: 1 ar = 1 sotix deb olindi, demak 15 ar = 15 sotix.",
  "№ 14: ikkita yosh (77 va 79) ham shartga mos keladi, “77 yoki 79” varianti to'g'ri.",
  "№ 30: variantlar tozalandi: “T.J.Y” -> “To'g'ri javob yo'q”, “(((1/5)))^0” -> “(1/5)^0”. a : b = 1 va (1/5)^0 = 1, demak to'g'ri javob (1/5)^0.",
  "№ 39: “doesn't” va “can't” ikkalasi ham grammatik jihatdan to'g'ri edi (ikki to'g'ri javob). “doesn't” varianti “don't” ga almashtirildi, to'g'ri javob — “can't”.",
  "№ 46: C va D variantlari bir xil edi (“dictionaries”). D varianti “dictionary” ga almashtirildi, to'g'ri javob — “dictionaries”.",
  "№ 48: “leaves” va “is leaving” ikkalasi ham to'g'ri bo'la oladi, “left” ham mumkin edi. Gapga “every morning” qo'shildi, “is leaving” -> “leaving”, “left” -> “leaved” deb o'zgartirildi; to'g'ri javob — “leaves”.",
  "Kichik tuzatishlar: № 31 “Any” -> “any”; № 41 “I 'm not” -> “I'm not”; № 33 va 35 dagi “\\” belgisi “/” ga almashtirildi; bo'sh joylar “___” bilan belgilandi; kasrlar (1/13) o'rniga 1/13 ko'rinishida; № 26 da “harfiy ifoda” iborasi va ko'paytirish belgisi aniqlashtirildi; № 17 va 30 matnlari o'qiladigan qilib qayta yozildi.",
];

const out = { grade: 5, notes, variants: [1, 2, 3, 4].map((v) => mk(v, lists[v])) };
writeFileSync(join(root, "content", "quizzes", "grade-5.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
const cnt = (v) => { const q = out.variants[v - 1].questions; const c = {}; q.forEach((x) => { const k = `${x.source}/${x.section}`; c[k] = (c[k] ?? 0) + 1; }); const L = {}; q.forEach((x) => (L[x.correct] = (L[x.correct] ?? 0) + 1)); return `v${v}: ${q.length} ${JSON.stringify(c)} letters ${JSON.stringify(L)}`; };
[1, 2, 3, 4].forEach((v) => console.log(cnt(v)));
