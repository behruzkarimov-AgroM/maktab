# Test kontenti formati (2–6-sinflar, 4 variant)

Manba fayllar: `content/quizzes/grade-<N>.json` (N = 2..6). Quruvchi: `npm run content:build` -> tekshiradi va
`supabase/content/quizzes-grades-2-6.sql` hamda `content/quizzes/bundle.json` (demo rejim uchun) ni yaratadi.

```jsonc
{
  "grade": 3,
  "variants": [
    {
      "variant": 1,                       // 1..4
      "title":       { "uz": "3-sinf · Aralash test · 1-variant", "ru": "3 класс · Смешанный тест · Вариант 1", "en": "Grade 3 · Mixed test · Variant 1" },
      "description": { "uz": "...", "ru": "...", "en": "..." },
      "durationMinutes": 40,              // 20..60
      "passPercent": 60,
      "difficulty": "medium",             // easy | medium | hard
      "questions": [
        {
          "section": "math",              // math | logic | english
          "stem":    { "uz": "Hisoblang: 24 + 17 = ?" },   // ru/en ixtiyoriy; yo'q bo'lsa uz ko'rsatiladi
          "options": [ { "id": "A", "text": { "uz": "41" } }, { "id": "B", "text": { "uz": "31" } },
                       { "id": "C", "text": { "uz": "39" } }, { "id": "D", "text": { "uz": "43" } } ],
          "correct": "A",
          "explanation": { "uz": "24 + 17 = 41." },
          "source": "doc"                 // "doc" = yuklangan Word fayldan, "new" = qo'shilgan savol
        }
      ]
    }
  ]
}
```

Qoidalar (quruvchi shularni majburiy tekshiradi, buzilsa xato beradi):
- har variantda 25–35 savol; 4 variant; har variant mavzu bo'yicha aralash (matematika, mantiq, ingliz tili) va qiyinligi teng;
- har savolda aynan 4 variant (A, B, C, D), bo'sh emas, o'zaro takrorlanmaydi; `correct` ulardan biri;
- to'g'ri javob harflari tekis taqsimlangan (har harf 15–35%);
- izoh (explanation) majburiy; matematika uchun yechim qadamlari qisqa yozilsin;
- bir sinfdagi 4 variantda bir xil savol matni takrorlanmasin (sonlarni o'zgartirib yangi savol yozing);
- rasm yoki shaklga bog'liq savollar kiritilmaydi (sayt hozircha rasmli savolni faqat yuklangan rasm bilan ko'rsata oladi).
- matematik ifodalar oddiy matn: `3/4`, `2^3`, `sqrt(49)`, `×`, `÷`, `:`.
- ingliz tili savollarida matn (stem, options) uz/ru/en uchun bir xil yoziladi (ingliz matn tarjima qilinmaydi).
