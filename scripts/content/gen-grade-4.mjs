// Generates content/quizzes/grade-4.json (4 variants). Variants 1-2 = school's Word test (solved), 3-4 = new questions.
// Usage: node scripts/content/gen-grade-4.mjs   then   node scripts/content/build-quizzes.mjs --grade=4
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const L = ["A", "B", "C", "D"];
const tri = (s) => ({ uz: s, ru: s, en: s });

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// q = {section, stem, options[], ci, expl, source}
const D = (section, stem, options, letter, expl) => ({ section, stem, options, ci: L.indexOf(letter), expl, source: "doc" });
const N = (section, stem, options, ci, expl) => ({ section, stem, options, ci, expl, source: "new" });

// ---------------------------------------------------------------- VARIANT 1 (doc)
const v1 = [
  D("math", `Do'konda 2 litrlik 3a ta idishlarda va 5 litrlik 2a ta idishlarda sut bor. Do'konda hammasi bo'lib necha litr sut bor?`,
    ["6a", "10a", "16a", "4a"], "C", `2 l × 3a = 6a, 5 l × 2a = 10a. Jami: 6a + 10a = 16a.`),
  D("math", `Agar 2-dekabr dushanba kuni bo'lsa, 25-dekabr haftaning qaysi kuni bo'lgan?`,
    ["Seshanba", "Chorshanba", "Payshanba", "Juma"], "B", `2-dekabrdan 25-dekabrgacha 23 kun. 23 = 3 · 7 + 2, ya'ni dushanbadan 2 kun keyin: chorshanba.`),
  D("math", `Tenglamani yeching: 14 + 21 - x = 18 - 6`,
    ["35", "17", "23", "18"], "C", `14 + 21 = 35, 18 - 6 = 12. 35 - x = 12, x = 35 - 12 = 23.`),
  D("math", `19 soni raqamlarining o'rnini almashtiramiz. Hosil bo'lgan son qanchaga ortdi?`,
    ["91", "77", "25", "72"], "D", `19 dan 91 hosil bo'ladi. 91 - 19 = 72.`),
  D("math", `Duradgorda 9 ta yog'och bor edi. U bir nechta yog'ochning har birini 5 bo'lakka bo'lib arraladi. Shunda taxtalar soni 29 taga yetdi. Duradgor nechta yog'ochni bo'laklarga bo'lgan?`,
    ["4", "5", "6", "7"], "B", `Bitta yog'och 5 bo'lakka bo'linsa, bo'laklar soni 4 taga ortadi. 29 - 9 = 20, 20 : 4 = 5 ta yog'och.`),
  D("math", `Uchta guldonda hammasi bo'lib 100 ta gul bor. Ikkinchi guldonda birinchi guldondagidan 2 marta ko'p, uchinchi guldondagidan 15 ta ko'p gul bor. Ikkinchi guldonda nechta gul bor?`,
    ["17", "46", "32", "25"], "B", `Birinchida a ta, ikkinchida 2a, uchinchida 2a - 15 ta. a + 2a + 2a - 15 = 100, 5a = 115, a = 23. Ikkinchida 2 · 23 = 46 ta.`),
  D("math", `3 ta tovuq 3 kunda 3 ta tuxum tug'sa, 12 ta tovuq 12 kunda nechta tuxum tug'adi?`,
    ["12", "48", "36", "3"], "B", `1 ta tovuq 3 kunda 1 ta tuxum tug'adi. 12 kunda u 12 : 3 = 4 ta tug'adi. 12 ta tovuq: 12 · 4 = 48 ta.`),
  D("math", `Ikki xonali sonning o'ng tomoniga 0 raqami yozilsa, berilgan sonning yarmi bilan 323 ning yig'indisiga teng bo'lgan son hosil bo'ladi. Berilgan sonni toping.`,
    ["54", "34", "24", "14"], "B", `Son n bo'lsin: 10n = n : 2 + 323, 9,5n = 323, n = 34. Tekshiruv: 340 = 17 + 323.`),
  D("math", `Doskadan eshikkacha borish uchun Botir 7 ta qadam bosdi, Qodir esa 6 qadam. Kimning qadami uzunroq?`,
    ["Botir", "Qodir", "teng", "aniqlab bo'lmaydi"], "B", `Masofa bir xil. Qodir kamroq qadam bosgan, demak uning qadami uzunroq.`),
  D("math", `8, 18, 28, … sonli qatorni qonuniyat bo'yicha davom ettirsak, 68 nechanchi had bo'ladi?`,
    ["7", "8", "6", "9"], "A", `Har bir had oldingisidan 10 ga katta: 8, 18, 28, 38, 48, 58, 68. 68 — 7-had.`),
  D("math", `O'ylangan uch xonali sondan 6 ni ayirsak, u 6 ga bo'linadi. 7 ni ayirsak, 7 ga bo'linadi. 8 ni ayirsak, u 8 ga bo'linadi. 9 ni ayirsak, 9 ga bo'linadi. O'ylangan sonni toping.`,
    ["3024", "504", "336", "252"], "B", `Son 6, 7, 8 va 9 ga bo'linadi, ya'ni ularning eng kichik umumiy karralisi 504 ga karrali. Uch xonali son faqat 504.`),
  D("math", `Palov tayyorlash uchun guruch va sabzi teng solinadi. Go'sht guruchdan 2 marta kam, yog' guruchdan 4 marta kam, piyoz esa guruchdan 8 marta kam solinadi. Agar 8 kg guruchdan palov tayyorlamoqchi bo'lsak, jami necha kilogramm mahsulot sotib olishimiz kerak?`,
    ["24", "23", "22", "15"], "B", `Guruch 8 kg, sabzi 8 kg, go'sht 4 kg, yog' 2 kg, piyoz 1 kg. Jami: 8 + 8 + 4 + 2 + 1 = 23 kg.`),
  D("math", `Har yili Ramazon hayitida Solihaning dadasi unga ayiqcha o'yinchog'ini olib kelib beradi. Dadasi unga 1 yoshligida bitta, 2 yoshligida ikkita va hokazo shu tartibda. Har yili olib bergan ayiqchalari soni oldingi yildagidan 1 taga ko'p edi. Soliha 6 yoshligida jami nechta ayiqchaga ega bo'ldi?`,
    ["19", "20", "21", "22"], "C", `1 + 2 + 3 + 4 + 5 + 6 = 21 ta.`),
  D("math", `Bir kishi bozorga tuxum olib keldi. Birinchi xaridorga jami tuxumning yarmini va yana 1 dona tuxum, ikkinchi xaridorga qolgan tuxumlarning yarmini va yana 1 ta tuxum, uchinchi xaridorga qolgan tuxumlarning yarmini va yana 1 ta tuxum sotdi. Shundan so'ng uning savatida 10 dona tuxum qoldi. Kishi bozorga jami nechta tuxum olib kelgan?`,
    ["63 ta", "40 ta", "88 ta", "94 ta"], "D", `Oxiridan hisoblaymiz: (10 + 1) · 2 = 22; (22 + 1) · 2 = 46; (46 + 1) · 2 = 94 ta.`),

  D("logic", `Farhodda dunyodagi xohlagan shaharni qidirib topish mumkin bo'lgan xarita bor. Farhod: “Agar menga bitta shaharning nomini aytsangiz, uning qaysi davlatda ekanligini aytishingiz shart emas. Men uni darhol xaritadan topib olaman.” Quyidagi qaysi biri Farhodning gapi xato ekanligini ko'rsatadi?`,
    ["Ba'zi shaharlarning nomlari o'zi joylashgan davlat nomlari bilan bir xil.", "Ba'zi shaharlarning nomlari bir xil.", "Ba'zi davlatlarda birorta ham shahar yo'q.", "Ba'zi shaharlarning nomlari o'zgargan."], "B",
    `Agar turli davlatlarda bir xil nomli shaharlar bo'lsa, davlatni bilmasdan to'g'ri shaharni topib bo'lmaydi.`),
  D("logic", `Muattar ustoz: “Mening sinfimda ko'rish qobiliyati pastroq 10 nafar o'quvchi bor. Bugun ertalab sinfimizda 7 nafar o'quvchi ko'zoynak taqib yurgandi. Demak, sinfimizda ba'zilar kontakt linza taqib yurgan bo'lishi kerak.” Muattar ustoz bunday fikrlash orqali qanday xatolikka yo'l qo'ygan bo'lishi mumkin?`,
    ["U boshqa sinfdagi o'quvchilarni hisobga olmadi.", "U qaysi o'quvchi kontakt linza taqib yurganini aytmadi.", "Ba'zi ko'rish qobiliyati past o'quvchilar ko'zoynak ham, kontakt linza ham taqib yurmagan bo'lishi mumkin.", "Hozirda ko'rish qobiliyati past o'quvchilar kelajakda ko'zoynak taqib yurishga ehtiyojmand bo'lishi mumkin."], "C",
    `10 nafardan 7 tasi ko'zoynak taqqan, qolgan 3 tasi esa hech narsa taqmagan bo'lishi mumkin. Shuning uchun linza taqqanlar bor degan xulosa shart emas.`),
  D("logic", `Avtomobil ijaraga beruvchi: “Biz mashinalarimizga yangi moslama o'rnatamiz. U yo'nalishni o'zbek tilida tushuntirib boradi. Bizning bu loyihamiz, ayniqsa, chet eldan kelgan va shahrimizni bilmaydigan sayyohlar uchun juda foydali bo'ladi.” Yuqoridagi rejada qanday xatolik mavjud?`,
    ["Bu moslamani ko'plab mashinalarga o'rnatish qimmatga tushadi.", "Shaharga keladigan sayyohlarning aksariyati o'zbek tilini bilmaydi.", "Shaharda qog'oz xaritalar juda arzon.", "Qurilmaning ovozi o'ta baland va bu haydovchilarni chalg'itadi."], "B",
    `Moslama o'zbek tilida gapiradi, chet ellik sayyohlar esa o'zbek tilini bilmasligi mumkin. Reja aynan ular uchun foydasiz bo'ladi.`),
  D("logic", `Agar shahar ichiga 8 tonnadan og'irroq yuk mashinalarining kirishi cheklansa, yuk mashinalari shaharga kira olmaydi va bu shahardagi transport qatnovini keskin kamaytiradi. Quyidagi qaysi ma'lumot yuqoridagi taklifning samarasiz ekanligini bildiradi?`,
    ["Shahar tashqarisidagi yo'llarning sifati juda yaxshi.", "Shahar tashqarisida mashina qatnovi juda kam.", "Shaharda harakatlanadigan yuk mashinalarining juda ozginasi 8 tonnadan og'irroq.", "Shaharda yengil mashinalar ko'pincha yuk mashinalar bilan to'qnashib ketadi."], "C",
    `Agar 8 tonnadan og'ir yuk mashinalari kam bo'lsa, ularni cheklash qatnovni deyarli kamaytirmaydi.`),
  D("logic", `Maktabda adabiyot fanidan olimpiada o'tkazildi. Olimpiada natijalariga ko'ra, 4-“A” sinfidagi Nodir ismli o'quvchi 1-o'rinni egallagan bo'lsa, Suhrob ismli o'quvchi eng oxirgi o'rinni egallaganligi ma'lum bo'ldi. Shundan keyin maktab direktori ushbu sinfda Nodir adabiyot fanini eng zo'r biladigan, Suhrob eng past bilimli o'quvchi ekan degan xulosaga keldi. Quyidagi gaplardan qaysi biri direktorning xulosasida mantiqiy xatolik bor ekanligini ko'rsatadi?`,
    ["Bu yil o'tkazilgan adabiyot fani olimpiadasidagi savollarning qiyinlik darajasi oldingi yillardagidan ancha yuqori edi.", "4-“A” sinfiga adabiyot va ona tili fanlaridan boshqa-boshqa o'qituvchilar dars beradi.", "1-o'rinni egallagan Nodir nafaqat shu sinfda, balki butun maktabda adabiyot fanini eng yaxshi biladigan o'quvchi.", "Olimpiada o'tkazilgan kuni 4-“A” sinf o'quvchilarining yarmi hasharda edi."], "D",
    `Sinf o'quvchilarining yarmi olimpiadada qatnashmagan. Shuning uchun Nodir eng yaxshi, Suhrob eng past bilimli degan xulosa noto'g'ri bo'lishi mumkin.`),

  D("english", `Find antonyms: My dad is not short. He is ___ . My brother is not weak. He is ____ .`,
    ["plump / strong", "thin / tall", "tall / curly", "tall / strong"], "D", `Short ning teskarisi — tall, weak ning teskarisi — strong.`),
  D("english", `Choose the appropriate questions: I am from Uzbekistan. / I'm fine, thank you.`,
    ["Where are you from? / How are you?", "When you were born? / Are OK?", "Who are you? / How are you?", "Where is? / How are you?"], "A", `"I am from Uzbekistan" — "Where are you from?" savoliga, "I'm fine" — "How are you?" savoliga javob.`),
  D("english", `A person, who helps the director with letters and telephone answers.`,
    ["a driver", "a secretary", "a teacher", "a pupil"], "B", `Direktorga xat va telefon qo'ng'iroqlarida yordam beruvchi — secretary (kotiba).`),
  D("english", `We _____ play with matches. We _____ get ready for the lessons. We _____ write words in our books.`,
    ["must, must, must", "mustn't, must, mustn't", "mustn't, mustn't, mustn't", "must, mustn't, must"], "B", `Gugurt bilan o'ynash va kitobga yozish mumkin emas (mustn't), darslarga tayyorlanish kerak (must).`),
  D("english", `Find the correct answer: hamshira (медсестра), o't o'chiruvchi (пожарник), bog'bon (садовник).`,
    ["pilot, chef, nurse.", "TV star, fireman, nurse.", "nurse, fireman, farmer.", "nurse, fireman, gardener."], "D", `Hamshira — nurse, o't o'chiruvchi — fireman, bog'bon — gardener.`),
  D("english", `Find words about profession.`,
    ["doctor, TV star, gardener, subject.", "driver, engineer, housewife, pilot.", "director, sick, worker.", "chef, club, pilot, doctor"], "B", `Faqat B qatordagi barcha so'zlar kasb nomi. Boshqa qatorlarda subject, sick, club kabi kasb bo'lmagan so'zlar bor.`),
  D("english", `Find countable nouns:`,
    ["bread, biscuit, chocolate", "oil, nut, egg", "nut, apple, melon", "oil, fat, peach"], "C", `Nut, apple, melon sanaladigan otlar. Bread, chocolate, oil, fat sanalmaydi.`),
  D("english", `…… works in a restaurant. He cooks different kinds of meals.`,
    ["a fireman", "a chef", "an architect", "a pilot"], "B", `Restoranda taom pishiruvchi — chef (oshpaz).`),
  D("english", `The United Kingdom is divided into … parts.`,
    ["6", "4", "3", "50"], "B", `Buyuk Britaniya va Shimoliy Irlandiya Birlashgan Qirolligi 4 qismdan iborat: England, Scotland, Wales, Northern Ireland.`),
];

// ---------------------------------------------------------------- VARIANT 2 (doc)
const v2 = [
  D("math", `Men yigirmadan kichik ikki xonali toq sonman. Mening raqamlarim yig'indisi 10 ga teng. Meni toping.`,
    ["28", "17", "15", "19"], "D", `Yigirmadan kichik toq ikki xonali sonlar: 11, 13, 15, 17, 19. Raqamlari yig'indisi 10 bo'lgani 19 (1 + 9 = 10).`),
  D("math", `Oshxonada kuniga 20 kg dan sabzi sarflanadi. Agar oshxonada 67 kg sabzi qolgan bo'lsa, 4 kunga yetishi uchun necha kg sabzi sotib olish kerak?`,
    ["80", "63", "26", "13"], "D", `4 kunga 20 · 4 = 80 kg kerak. 80 - 67 = 13 kg sotib olish kerak.`),
  D("math", `To'g'ri to'rtburchakning eni 9 cm, bo'yi esa enidan 3 marta uzunroq. Shu to'g'ri to'rtburchakning perimetrini toping.`,
    ["24 cm", "27 cm", "36 cm", "72 cm"], "D", `Bo'yi 9 · 3 = 27 cm. Perimetr P = 2 · (9 + 27) = 72 cm.`),
  D("math", `Ifodaning qiymatini toping: (30y - 25) - (20y + 10), bunda y = 5 ga teng.`,
    ["235", "175", "25", "15"], "D", `y = 5 da: 30 · 5 - 25 = 125, 20 · 5 + 10 = 110. 125 - 110 = 15.`),
  D("math", `Tenglamani yeching: 144 : (25 - x · x) = 9`,
    ["4", "3", "2", "1"], "B", `144 : 9 = 16, demak 25 - x · x = 16, x · x = 9, x = 3.`),
  D("math", `Do'konda 2 kg kartoshka va 3 kg piyozning umumiy narxi 19 dollar, 5 kg kartoshka va 6 kg piyozning umumiy narxi esa 43 dollar. Piyozning narxini toping.`,
    ["4 dollar", "2 dollar", "3 dollar", "5 dollar"], "C", `Birinchi shartni 2 ga ko'paytiramiz: 4 kg kartoshka + 6 kg piyoz = 38 dollar. 43 - 38 = 5, ya'ni 1 kg kartoshka 5 dollar. 2 · 5 + 3 · piyoz = 19, piyozning narxi (19 - 10) : 3 = 3 dollar.`),
  D("math", `Ketma-ket kelgan uchta butun sonning yig'indisi 90 ga teng. Uchta butun sonning eng kattasi qaysi?`,
    ["28", "29", "31", "32"], "C", `O'rtadagi son 90 : 3 = 30. Sonlar 29, 30, 31. Eng kattasi 31.`),
  D("math", `Ota va onaning yoshlari yig'indisi 84 ga teng. Agar 5 yil oldingi otaning yoshi 3 yil keyingi onaning yoshiga teng bo'lsa, hozir ota necha yoshda?`,
    ["46", "38", "42", "44"], "A", `Ota - 5 = ona + 3, demak ota onadan 8 yosh katta. 84 - 8 = 76, 76 : 2 = 38 (ona), ota 38 + 8 = 46 yoshda.`),
  D("math", `26 ta bola futbol va gandbol musobaqasiga qatnashishdi. 15 ta bola futbolga va 16 ta bola gandbol musobaqasiga qatnashdi. Nechta bola ikkala musobaqaga ham qatnashgan?`,
    ["25", "15", "30", "5"], "D", `15 + 16 = 31, bolalar esa 26 ta. Ikkalasida qatnashganlar bir marta ortiqcha sanalgan: 31 - 26 = 5 ta.`),
  D("math", `Qatorda yozilgan 5 ta sonning yig'indisi 27 ga teng. Dastlabki uchtasining yig'indisi 16 ga, oxirgi uchtasining yig'indisi 15 ga teng bo'lsa, qatorning o'rtasidagi sonning qiymatini toping.`,
    ["5", "4", "7", "9"], "B", `16 + 15 = 31, bunda o'rtadagi son ikki marta sanalgan. 31 - 27 = 4.`),
  D("math", `Dilnozada 21 ta 100 so'mlik, 33 ta 50 so'mlik va bir nechta 25 so'mlik bor. Agar uning jami puli 4775 so'm bo'lsa, Dilnozada nechta 25 so'mlik bo'lgan?`,
    ["39", "41", "42", "43"], "B", `21 · 100 = 2100, 33 · 50 = 1650, jami 3750 so'm. 4775 - 3750 = 1025, 1025 : 25 = 41 ta.`),
  D("math", `(5a401) soni 3 ga qoldiqsiz bo'linsa, a ning o'rnida bo'lishi mumkin bo'lgan juft raqamlar ko'paytmasini toping.`,
    ["80", "16", "32", "8"], "B", `Raqamlar yig'indisi 5 + a + 4 + 0 + 1 = 10 + a, 3 ga bo'linishi uchun a = 2, 5 yoki 8. Juftlari: 2 va 8, ko'paytmasi 16.`),
  D("math", `Qutida 50 tadan kam pecheniye bor. Pecheniyelar 2, 3 yoki 4 bola o'rtasida teng taqsimlanishi mumkin. Lekin ularni 7 nafar bolaga teng miqdorda bo'lib bo'lmaydi, sababi yana 6 ta pecheniye ortib qoladi. Qutida nechta pecheniye bor?`,
    ["12", "24", "30", "48"], "D", `Son 2, 3, 4 ga bo'linadi, demak 12 ga karrali: 12, 24, 36, 48. 7 ga bo'lganda qoldiq 6 bo'ladigani faqat 48 (48 = 6 · 7 + 6).`),
  D("math", `Alida 3 ta kulcha va 8 ta bir xil tanga, Valida 5 ta kulcha va 8 ta bir xil tanga bor. Solida bunday kulchalar yo'q, ammo unda 8 ta bir xil tanga bor. Uchala bola kulchalarni barobar bo'lib yeyishdi. Soli 8 ta tangani ularga “Shirin kulchalar uchun rahmat” deb berdi. Bu tangalarni Ali va Vali qanday bo'lib olishlari kerak?`,
    ["Ali 3 tanga, Vali 5 tanga", "Ali 2 tanga, Vali 6 tanga", "Ali 1 tanga, Vali 7 tanga", "Ali 5 tanga, Vali 3 tanga"], "C",
    `Jami 8 ta kulcha, har bola 8/3 kulcha yeydi. Ali Soliga 3 - 8/3 = 1/3, Vali 5 - 8/3 = 7/3 kulcha bergan. Tangalar 1 : 7 nisbatda bo'linadi: Ali 1, Vali 7 tanga.`),

  D("logic", `Diyora va Yunus maktab koridorida turibdi. Diyora: “Hilola menga kurtkasini olib kelishimni iltimos qildi. Lekin men uni topa olmadim. Kurtka moviy rangda va qalpoqli edi.” Yunus: “Mana bu yerda moviy rangli qalpoqli kurtka bor. Bu Hilolaniki bo'lsa kerak.” Yunus bunday fikrlashda qanday xatolikka yo'l qo'ygan bo'lishi mumkin?`,
    ["Hilola boshqacha kurtkani yoqtirishi mumkin.", "Diyora boshqa birovning kurtkasini qidirayotgan bo'lishi mumkin.", "Moviy rangdagi qalpoqli kurtkalar bir qancha bo'lishi mumkin.", "Kurtka moviy bo'lsa-da, unda qalpoq bo'lmasligi mumkin."], "C",
    `Bir xil rang va shakldagi kurtkalar ko'p bo'lishi mumkin, shuning uchun topilgan kurtka aynan Hilolaniki ekani shart emas.`),
  D("logic", `Farhod: “Pianino imtihonidan o'tish uchun kuniga 15 minutdan haftada to'rt kun shug'ullanish kerak.” Sanjar: “Men har kuni 20 minutdan ko'proq shug'ullandim, shuning uchun imtihondan o'tishimga to'liq aminman.” Sanjar bunday fikrlash orqali qanday xatolikka yo'l qo'ygan bo'lishi mumkin?`,
    ["Imtihon topshirish, odatda, asabiy bo'ladi.", "Cholg'u asbobini yaxshi chalishni o'rganish ko'p yil talab qiladi.", "Yolg'iz shug'ullanish o'qituvchi bilan shug'ullanishdek samarali emas.", "Minimum talab qilinadigan darajada shug'ullanish imtihondan o'tishni kafolatlay olmasligi mumkin."], "D",
    `Farhodning gapida minimal shart aytilgan, u imtihondan o'tishni kafolatlamaydi. Sanjar shartni yetarli deb xato o'ylagan.`),
  D("logic", `Guru mamlakati neft va gaz konlariga juda boy. Bu konlardan olinadigan energiya Guru aholisining ehtiyojidan ham ortiqcha. Lekin Guru fuqarolari gaz va benzin tanqisligidan aziyat chekadi. Yuqoridagi ziddiyatli holatning sababini tushuntirib beradigan gapni toping.`,
    ["Konlardan yil davomida bir xil miqdorda neft va gaz qazib olinmaydi.", "Guru mamlakatida odamlar elektr jihozlardan juda ko'p foydalanadilar.", "Guru mamlakati quyosh va shamol energiyasini rivojlantirmagan.", "Guruda ishlab chiqariladigan neft va gazning katta qismi boshqa mamlakatlarga sotiladi."], "D",
    `Agar mahsulotning katta qismi chet elga sotilsa, boy konlarga qaramay ichkarida tanqislik bo'lishi mumkin.`),
  D("logic", `Ilhom: “Oxirgi 10 yilda kofening zararlari haqida juda ko'p maqolalar yozildi. Buning natijasida shu davrda kofe iste'moli keskin kamaydi.” Quyidagi qaysi gap Ilhomning xulosasi xato ekanligini ko'rsatadi?`,
    ["Odamlar bugungi kunda 10 yil oldingiga qaraganda kofeni ikki barobar kam iste'mol qilishmoqda.", "Oddiy kofening bahosi pasayganligi tufayli maxsus sifatli kofening savdosi barqaror qoldi.", "So'nggi 10 yil ichida meva sharbatlari va choylarni iste'mol qilish oshdi.", "So'nggi 10 yil ichida qahva yetishtiradigan mamlakatlarda noodatiy qattiq sovuq tufayli kofe narxi doimiy oshdi."], "D",
    `Iste'molning kamayishiga boshqa sabab ham bor: narxning doimiy oshishi. Demak, sababi faqat maqolalar degan xulosa noto'g'ri bo'lishi mumkin.`),
  D("logic", `Husnora: “Nodir bu yil maktabni bitiradi va universitetga hujjat topshiradi. Lekin, afsuski, Nodir matematika va fizika fanlaridan umuman kitoblar o'qimadi va yetarlicha tayyorgarlik ko'rmadi. Shuning uchun men Nodir bu yil universitet imtihonlaridan o'ta oladi deb o'ylamayman.” Quyidagi gaplardan qaysi biri Husnoraning fikrlashidagi xatolikni ko'rsatadi?`,
    ["Universitet imtihonlarida matematika va fizika fanlaridan qo'shimcha tarzda ona tili va adabiyot fanidan ham imtihon topshiriladi.", "Nodir hujjat topshirgan universitetning kirish imtihonlarida matematika va fizika fanlari bo'yicha savollar bo'lmaydi.", "Nodirning oxirgi ikki chorakda matematika va fizika fanlari bo'yicha choraklik baholari 3 bo'lgan edi.", "Universitet kirish imtihonlarida tushadigan savollar yildan yilga qiyinlashib bormoqda."], "B",
    `Agar imtihonda matematika va fizika bo'lmasa, tayyorgarlikning yo'qligi Husnora o'ylagan natijaga olib kelmaydi.`),

  D("english", `Robot has ( kvadrat ) head. It has also ( yumaloq – круглый ) eyes. It is ( jigarrang – коричневого ) by colour.`,
    ["square / big / brown", "round / square / purple", "square / round / brown", "straight / short / brown"], "C", `Kvadrat — square, yumaloq — round, jigarrang — brown.`),
  D("english", `What do we call granny and grandad? Choose one appropriate word.`,
    ["parents", "relatives", "neighbours", "grandparents"], "D", `Granny va grandad — grandparents (buvi va bobo).`),
  D("english", `He goes to school ___ bus. My friend lives near the school. He goes to school ___ foot.`,
    ["by / on", "by / by", "in / with", "in / on"], "A", `By bus — avtobusda, on foot — piyoda.`),
  D("english", `What is “librarian” in the state language?`,
    ["kutubhona", "kitoblar", "kutubhonachi", "uchuvchi"], "C", `Librarian — kutubxonachi. Kutubxona — library, kitoblar — books, uchuvchi — pilot.`),
  D("english", `Which question is not correct?`,
    ["What time you did arrived?", "Where do your parents meet?", "Did you like the gift?", "Where did you go yesterday?"], "A", `A gap xato: to'g'risi "What time did you arrive?". Boshqa savollar to'g'ri tuzilgan.`),
  D("english", `Find the true translation: guruch (рис), sabzi (морковь), sharbat (сок).`,
    ["rise, carrot, milk.", "rice, carrot, juice.", "rice, carrot, honey.", "bread, carrot, juice."], "B", `Guruch — rice, sabzi — carrot, sharbat — juice.`),
  D("english", `Which nouns can be used after the article a / an?`,
    ["peach, table, sister", "oil, egg, desk", "nut, sand, sugar", "mud, iron, floor"], "A", `A / an faqat sanaladigan otlar oldidan qo'llanadi. Oil, sand, sugar, mud sanalmaydi.`),
  D("english", `Find the correct sentence with “many”.`,
    ["You have many money.", "We drink many water.", "They usually many swim.", "I am sociable, I have many friends."], "D", `Many sanaladigan ko'plik otlar bilan ishlatiladi: many friends. Money va water sanalmaydi.`),
  D("english", `- What are you doing now?`,
    ["- I was reading.", "- She was writing.", "- I am reading.", "- You are reading."], "C", `"Now" — hozir. Present Continuous: I am reading.`),
];

// ---------------------------------------------------------------- generated math (variants 3, 4)
const W = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const hm = (h, m) => `${h}:${String(m).padStart(2, "0")}`;
function dist(c, offs) {
  const out = [];
  for (const o of offs) { const v = c + o; if (v > 0 && v !== c && !out.includes(v)) out.push(v); if (out.length === 3) break; }
  return out.map(String);
}
const G = (stem, correct, ds, expl) => N("math", stem, [String(correct), ...ds.map(String)], 0, expl);

const addQ = (a, b, offs) => G(`Hisoblang: ${a} + ${b} = ?`, a + b, dist(a + b, offs), `${a} + ${b} = ${a + b}.`);
const subQ = (a, b, offs) => G(`Hisoblang: ${a} - ${b} = ?`, a - b, dist(a - b, offs), `${a} - ${b} = ${a - b}.`);
const mulQ = (a, b, ds) => G(`Hisoblang: ${a} × ${b} = ?`, a * b, ds, `${a} × ${b} = ${a * b}.`);
const divQ = (a, b, offs) => G(`Hisoblang: ${a} : ${b} = ?`, a / b, dist(a / b, offs), `${a} : ${b} = ${a / b}.`);

const shopQ = (name, k, m, a, b) => {
  const c = k * a + m * b;
  return G(`${name} ${k} ta daftar va ${m} ta qalam sotib oldi. Bitta daftar ${a} so'm, bitta qalam ${b} so'm turadi. U hammasi bo'lib necha so'm to'ladi?`,
    `${c} so'm`, [`${k * a} so'm`, `${k * b + m * a} so'm`, `${(k + m) * a} so'm`],
    `Daftarlar: ${k} · ${a} = ${k * a} so'm, qalamlar: ${m} · ${b} = ${m * b} so'm. Jami: ${k * a} + ${m * b} = ${c} so'm.`);
};
const perimQ = (w, l, ds) => G(`To'g'ri to'rtburchakning eni ${w} cm, bo'yi ${l} cm. Uning perimetrini toping.`, `${2 * (w + l)} cm`, ds.map((d) => `${d} cm`),
  `P = 2 · (${w} + ${l}) = 2 · ${w + l} = ${2 * (w + l)} cm.`);
const areaQ = (s, ds) => G(`Kvadratning tomoni ${s} cm. Uning yuzini toping.`, `${s * s} cm²`, ds.map((d) => `${d} cm²`), `S = ${s} · ${s} = ${s * s} cm².`);
const eqAdd = (a, b, ds) => G(`Tenglamani yeching: x + ${a} = ${b}`, b - a, ds, `x = ${b} - ${a} = ${b - a}.`);
const eqSub = (a, b, ds) => G(`Tenglamani yeching: ${a} - x = ${b}`, a - b, ds, `x = ${a} - ${b} = ${a - b}.`);
const exprQ = (p, op, q, n, ds) => {
  const c = op === "+" ? p * n + q : p * n - q;
  return G(`Ifodaning qiymatini toping: ${p}n ${op} ${q}, bunda n = ${n}.`, c, ds, `${p} · ${n} ${op} ${q} = ${p * n} ${op} ${q} = ${c}.`);
};
const timeQ = (word, h, m, d, ds) => {
  const t = h * 60 + m + d;
  const c = hm(Math.floor(t / 60), t % 60);
  return G(`${word} soat ${hm(h, m)} da boshlandi va ${d} minut davom etdi. ${word} soat nechada tugaydi?`, c, ds,
    `${hm(h, m)} ga ${d} minut qo'shamiz: ${h * 60 + m} + ${d} = ${t} minut, ya'ni ${c}.`);
};
const calQ = (d1, month, wd, d2, ds) => {
  const c = cap(W[(W.indexOf(wd) + (d2 - d1)) % 7]);
  return G(`Agar ${d1}-${month} ${wd} kuni bo'lsa, ${d2}-${month} haftaning qaysi kuni bo'ladi?`, c, ds,
    `${d2} - ${d1} = ${d2 - d1} kun. ${d2 - d1} = ${Math.floor((d2 - d1) / 7)} · 7 + ${(d2 - d1) % 7}, ya'ni ${wd}dan ${(d2 - d1) % 7} kun keyin: ${c.toLowerCase()}.`);
};

const v3gen = [
  addQ(3456, 2789, [-1000, 100, -10]),
  subQ(7000, 2358, [100, -100, 1000]),
  mulQ(346, 7, [2322, 2522, 2440]),
  divQ(4728, 6, [10, -10, 100]),
  shopQ("Sardor", 4, 3, 1500, 800),
  perimQ(12, 25, [300, 37, 50]),
  eqAdd(148, 392, [540, 234, 254]),
  exprQ(6, "+", 15, 7, [42, 52, 67]),
  timeQ("Film", 17, 35, 95, ["19:00", "19:20", "18:50"]),
  calQ(5, "mart", "juma", 20, ["Juma", "Yakshanba", "Dushanba"]),
  G(`3 kg 450 g necha gramm bo'ladi?`, `${3 * 1000 + 450} g`, ["3045 g", "345 g", "34500 g"], `1 kg = 1000 g. 3 · 1000 + 450 = 3450 g.`),
  G(`84 ning 1/4 qismini toping.`, 84 / 4, [42, 336, 24], `84 : 4 = 21.`),
  G(`Maktab avtobusi bir qatnovda 18 o'quvchini olib boradi. 100 o'quvchini olib borish uchun kamida necha qatnov kerak?`, Math.ceil(100 / 18), [5, 7, 8],
    `100 : 18 = 5 (qoldiq 10). Qolgan 10 o'quvchi uchun yana bir qatnov kerak: 5 + 1 = 6.`),
  G(`Kitobning 34 betini birinchi kuni, ikkinchi kuni esa birinchi kundagidan 12 bet ko'p o'qidi. Kitobda 150 bet bo'lsa, necha bet o'qilmay qoldi?`, 150 - (34 + 46), [80, 116, 104],
    `Ikkinchi kuni 34 + 12 = 46 bet. Jami o'qildi 34 + 46 = 80 bet. 150 - 80 = 70 bet qoldi.`),
  G(`Malika 5 ta daftarni 1800 so'mdan sotib oldi va sotuvchiga 10000 so'm berdi. Qaytim necha so'm?`, `${10000 - 5 * 1800} so'm`, ["9000 so'm", "100 so'm", "2000 so'm"],
    `5 · 1800 = 9000 so'm. 10000 - 9000 = 1000 so'm.`),
];
const v4gen = [
  addQ(5678, 3945, [-1000, 100, -100]),
  subQ(9100, 4286, [100, -100, 1000]),
  mulQ(128, 15, [1408, 1820, 2020]),
  divQ(5256, 8, [-10, 10, 100]),
  shopQ("Dilshod", 3, 5, 2300, 900),
  areaQ(14, [56, 28, 186]),
  eqSub(500, 187, [687, 323, 213]),
  exprQ(9, "-", 14, 6, [68, 29, 30]),
  timeQ("Dars", 8, 50, 45, ["9:25", "9:45", "9:15"]),
  calQ(12, "aprel", "seshanba", 30, ["Chorshanba", "Payshanba", "Juma"]),
  G(`2 soat 35 minut necha minut bo'ladi?`, `${2 * 60 + 35} minut`, ["235 minut", "95 minut", "255 minut"], `1 soat = 60 minut. 2 · 60 + 35 = 155 minut.`),
  G(`3/8 + 2/8 = ?`, "5/8", ["5/16", "6/8", "1/8"], `Maxrajlari bir xil: suratlari qo'shiladi, 3 + 2 = 5. Javob: 5/8.`),
  G(`156 ta olma 12 ta savatga teng bo'lib solindi. Har bir savatda nechta olma bor?`, 156 / 12, [12, 14, 15], `156 : 12 = 13 ta.`),
  G(`Alining yoshi 9 da. Otasi undan 4 marta katta. Ota Alidan necha yosh katta?`, `${9 * 4 - 9} yosh`, ["36 yosh", "13 yosh", "45 yosh"],
    `Otasi 9 · 4 = 36 yoshda. 36 - 9 = 27 yosh.`),
  G(`Ikki sonning yig'indisi 90, ayirmasi 14. Katta sonni toping.`, (90 + 14) / 2, [38, 104, 76], `Katta son = (yig'indi + ayirma) : 2 = (90 + 14) : 2 = 52. Kichik son 38.`),
];

// ---------------------------------------------------------------- logic + english (variants 3, 4)
const lg = (stem, opts, expl) => N("logic", stem, opts, 0, expl);
const en = (stem, opts, expl) => N("english", stem, opts, 0, expl);

const v3logic = [
  lg(`Qonuniyatni toping: 5, 10, 20, 40, … Navbatdagi son qaysi?`, ["80", "60", "70", "100"], `Har bir son oldingisidan 2 marta katta: 40 · 2 = 80.`),
  lg(`Dilnozaning 2 ta akasi va 1 ta ukasi bor. Dilnozaning oilasida hammasi bo'lib nechta bola bor?`, ["4", "3", "5", "6"], `2 ta aka + 1 ta uka + Dilnozaning o'zi = 4 ta bola.`),
  lg(`Anvar Bobirdan baland, Bobir esa Karimdan baland. Eng past bo'yli bola kim?`, ["Karim", "Anvar", "Bobir", "aniqlab bo'lmaydi"], `Anvar > Bobir > Karim. Eng pasti Karim.`),
  lg(`Bugun chorshanba. 10 kundan keyin haftaning qaysi kuni bo'ladi?`, ["Shanba", "Payshanba", "Juma", "Yakshanba"], `10 = 7 + 3. Chorshanbadan 3 kun keyin: payshanba, juma, shanba. Javob: shanba.`),
  lg(`Qaysi so'z ortiqcha: olma, nok, sabzi, o'rik?`, ["sabzi", "olma", "nok", "o'rik"], `Olma, nok, o'rik — mevalar, sabzi esa sabzavot.`),
];
const v4logic = [
  lg(`Qonuniyatni toping: 1, 4, 9, 16, … Navbatdagi son qaysi?`, ["25", "24", "26", "20"], `Sonlar 1·1, 2·2, 3·3, 4·4 — kvadratlar. Navbatdagisi 5 · 5 = 25.`),
  lg(`Qonuniyatni toping: 30, 27, 24, 21, … Navbatdagi son qaysi?`, ["18", "17", "19", "15"], `Har bir son oldingisidan 3 ga kichik: 21 - 3 = 18.`),
  lg(`Agar bundan ikki kun oldin dushanba bo'lgan bo'lsa, ertaga haftaning qaysi kuni bo'ladi?`, ["Payshanba", "Chorshanba", "Juma", "Seshanba"], `Ikki kun oldin dushanba bo'lsa, bugun chorshanba, ertaga payshanba.`),
  lg(`Poygada Jasur Azizdan oldin, Aziz esa Nodirdan oldin marraga keldi. Kim oxirgi bo'lib keldi?`, ["Nodir", "Jasur", "Aziz", "aniqlab bo'lmaydi"], `Tartib: Jasur, Aziz, Nodir. Oxirgisi Nodir.`),
  lg(`Qaysi son 3 ga qoldiqsiz bo'linmaydi?`, ["31", "18", "24", "45"], `Raqamlar yig'indisi 3 ga bo'linsa, son ham bo'linadi: 18, 24, 45 bo'linadi. 31 (3 + 1 = 4) bo'linmaydi.`),
];
const v3en = [
  en(`I have ___ umbrella.`, ["an", "a", "some", "many"], `Umbrella unli tovush bilan boshlanadi va sanaladigan ot, shuning uchun "an umbrella".`),
  en(`There isn't ___ milk in the fridge.`, ["any", "some", "many", "a"], `Inkor gapda sanalmaydigan ot bilan "any" ishlatiladi.`),
  en(`How ___ eggs do we need for the cake?`, ["many", "much", "any", "a"], `Egg sanaladigan ot, shuning uchun "How many".`),
  en(`Look! The children ___ in the park.`, ["are playing", "play", "plays", "is playing"], `"Look!" — hozir bo'layotgan ish: Present Continuous. Children ko'plik, shuning uchun "are playing".`),
  en(`My father ___ to work every morning.`, ["goes", "is going", "go", "going"], `"Every morning" — odatiy ish: Present Simple. He/she/it bilan "goes".`),
  en(`We have English lessons ___ Monday.`, ["on", "in", "at", "by"], `Hafta kunlari oldida "on" ishlatiladi: on Monday.`),
  en(`A person who treats sick people in hospital is a ___ .`, ["doctor", "driver", "baker", "farmer"], `Kasallarni davolaydigan kasb egasi — doctor (shifokor).`),
  en(`The capital of England is ___ .`, ["London", "Paris", "Berlin", "Tashkent"], `Angliyaning poytaxti — London.`),
  en(`Which word is uncountable?`, ["water", "apple", "pencil", "chair"], `Water (suv) sanalmaydi. Apple, pencil, chair sanaladi.`),
];
const v4en = [
  en(`My sister eats ___ orange every day.`, ["an", "a", "many", "few"], `Orange unli tovush bilan boshlanadi, shuning uchun "an orange".`),
  en(`Can I have ___ water, please?`, ["some", "a", "many", "an"], `Taklif/iltimos gapida "some" ishlatiladi. Water sanalmaydi, shuning uchun a/an va many mumkin emas.`),
  en(`There isn't ___ sugar in my cup.`, ["much", "many", "a", "few"], `Sugar sanalmaydigan ot, inkor gapda "much" ishlatiladi.`),
  en(`Listen! Anna ___ the piano now.`, ["is playing", "plays", "play", "are playing"], `"Listen!" va "now" — hozir bo'layotgan ish: Present Continuous. Anna uchun "is playing".`),
  en(`They ___ breakfast at 7 o'clock every day.`, ["have", "are having", "has", "having"], `"Every day" — odatiy ish: Present Simple. They bilan "have".`),
  en(`I get up ___ 7 o'clock.`, ["at", "on", "in", "by"], `Aniq soat oldida "at" ishlatiladi: at 7 o'clock.`),
  en(`A person who flies a plane is a ___ .`, ["pilot", "chef", "driver", "teacher"], `Samolyot boshqaradigan kasb egasi — pilot (uchuvchi).`),
  en(`There are ___ months in a year.`, ["twelve", "ten", "eleven", "thirteen"], `Bir yilda 12 oy bor: twelve.`),
  en(`Which word is countable?`, ["banana", "sugar", "rice", "milk"], `Banana sanaladi (one banana, two bananas). Sugar, rice, milk sanalmaydi.`),
];

const v3 = [...v3gen, ...v3logic, ...v3en];
const v4 = [...v4gen, ...v4logic, ...v4en];

// ---------------------------------------------------------------- assemble
function build(vnum, qs) {
  const rnd = mulberry32(4000 + vnum * 7919);
  const targets = [];
  while (targets.length < qs.length) {
    const blk = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [blk[i], blk[j]] = [blk[j], blk[i]]; }
    targets.push(...blk);
  }
  return qs.map((q, i) => {
    const correct = q.options[q.ci];
    const others = q.options.filter((_, k) => k !== q.ci);
    others.splice(targets[i], 0, correct);
    const T = q.section === "english" ? tri : (s) => ({ uz: s });
    return {
      section: q.section,
      stem: T(q.stem),
      options: others.map((t, k) => ({ id: L[k], text: T(t) })),
      correct: L[targets[i]],
      explanation: { uz: q.expl },
      source: q.source,
    };
  });
}

const TITLE = (v) => ({ uz: `4-sinf · Aralash test · ${v}-variant`, ru: `4 класс · Смешанный тест · Вариант ${v}`, en: `Grade 4 · Mixed test · Variant ${v}` });
const DESC = (n) => ({
  uz: `Matematika, mantiq va ingliz tili bo'yicha aralash test (${n} ta savol). O'tish bali — 60%.`,
  ru: `Смешанный тест по математике, логике и английскому языку (${n} вопросов). Проходной балл — 60%.`,
  en: `A mixed test in maths, logic and English (${n} questions). Pass mark: 60%.`,
});
const variants = [v1, v2, v3, v4].map((qs, i) => ({
  variant: i + 1, title: TITLE(i + 1), description: DESC(qs.length),
  durationMinutes: 45, passPercent: 60, difficulty: "medium", questions: build(i + 1, qs),
}));

const notes = [
  `Maktab Word faylidagi 7-, 8- va 49-savollar rasm/shaklga bog'liq bo'lgani uchun kiritilmadi.`,
  `48-savol (“I like in winter.”) olib tashlandi: to'rtala variant ham mantiqan to'g'ri bo'la oladi (rasm esa bezak), yagona to'g'ri javob yo'q.`,
  `47-savol: C va D variantlari bir xil edi (“mustn't, mustn't, mustn't”). D variant “must, mustn't, must” ga almashtirildi; to'g'ri javob — “mustn't, must, mustn't”.`,
  `59-savol: “Great Britain is divided into … parts” ikki xil javob berishi mumkin (3 yoki 4). Matn “The United Kingdom is divided into … parts” deb aniqlashtirildi, to'g'ri javob — 4.`,
  `33-savol: “qobiliyati pastroq o'quvchi” “ko'rish qobiliyati pastroq o'quvchi” deb aniqlashtirildi (ko'zoynak/linza haqidagi mantiqqa mos).`,
  `35-savol: ustoz gapining yopilmagan tirnog'i tuzatildi; 38-savol matni oldingi savol bilan yopishib qolgani ajratildi.`,
  `57-savoldagi “anarchitect” yozuvi “an architect” ga, 52-savoldagi “Did you like the gift.” va “Where did you go yesterday” savol belgisi bilan tuzatildi.`,
  `Matematika javoblari: 23-savolda 504 yagona uch xonali son; 28-savolda 48; 30-savolda 1 va 7 tanga (kulchalar 8/3 dan bo'lingan). 19-savolda masofa ikkala bola uchun bir xil deb olindi.`,
  `Boshqa savollar matnidagi imlo xatolari (masalan, “aholising”, “moshina”, “xoxlagan”) jimgina tuzatildi; ma'nosi o'zgarmagan.`,
  `Savollar 1- va 2-variantga ketma-ketlik tartibi saqlangan holda navbat bilan taqsimlandi (mavzu va qiyinlik bo'yicha teng). 3- va 4-variantlar yangi savollardan iborat.`,
];

const out = { grade: 4, notes, variants };
mkdirSync(join(root, "content", "quizzes"), { recursive: true });
writeFileSync(join(root, "content", "quizzes", "grade-4.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("grade-4.json yozildi:", variants.map((v) => v.questions.length).join(" / "));
