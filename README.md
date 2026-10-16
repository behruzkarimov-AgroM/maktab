# Children's Academy - xususiy maktab platformasi

Xususiy maktab uchun 3 tilli (**UZ / RU / EN**) veb-sayt, interaktiv o'quvchi portali (fan testlari, olimpiadalar,
psixologik testlar, aqliy o'yinlar) va kod yozmasdan boshqariladigan **Admin panel (CMS)**.
Env o'zgaruvchilarisiz **DEMO mode**da to'liq ishlaydi; Supabase ulansa, avtomatik haqiqiy bazaga o'tadi.

## Imkoniyatlar

**Public sayt** (`/uz`, `/ru`, `/en`)
- Bosh sahifa (animatsion statistika), maktab haqida, ta'lim dasturlari, kampus hayoti, jamoa, yutuqlar, aloqa + xarita
- Qabul arizasi / ekskursiya / qayta qo'ng'iroq (`/contact`) -> bazaga + Telegram bildirishnoma
- **Olimpiadalar**: countdown, onlayn ro'yxatdan o'tish (telefon maskasi, zod validatsiya), QR-kodli **ruxsatnoma (PDF/PNG)**,
  ticket bo'yicha natija, reyting
- **Fan testlari**: taymer, belgilash/o'tkazish, server tomonida tekshirish, tushuntirishlar, sertifikat
- **Psixologik testlar** (`/psychology`, `/assessment`): ball shkalasi bo'yicha xulosa va ota-onalar uchun tavsiya
- **Aqliy o'yinlar**: Schulte jadvali, Xotira matritsasi, Tezkor arifmetika, Stroop, Mantiqiy ketma-ketlik + reyting
- Dark/Light rejim, til almashtirish (yo'l saqlanadi), SEO (sitemap, robots, OG), PWA manifest, mobil (375px) moslashuv

**Admin panel** (`/admin`)
- Rollar: `super_admin`, `methodist`, `psychologist`
- Har bir kontent uchun `[UZ] [RU] [EN]` tablar bilan CRUD: sayt sozlamalari, dasturlar, kampus, jamoa, yutuqlar,
  olimpiadalar (+ ro'yxat, qidiruv, CSV/XLSX eksport, natija kiritish), fan testlari (CSV import), psixologik test
  konstruktori (shkala bo'shliq/ustma-ust tekshiruvi), o'yin sozlamalari, reyting moderatsiyasi, arizalar (status/izoh), foydalanuvchilar, audit jurnali
- **Word/PDF dan avtomatik import**: fan testlari va psixologik testlar ro'yxatida «Word/PDF dan import» — `.docx`, `.pdf`, `.txt`, `.csv`
  deyarli har qanday hujjatdan (Word/.doc, PDF, Excel, PowerPoint, ODF, RTF, HTML, matn, rasm va skaner OCR, .zip) fan testi / psixologik test / so'rovnoma / o'yin kontenti qoralamasi avtomatik yaratiladi (oldindan ko'rish -> tahrirlash -> yaratish); ixtiyoriy AI rejimi (ANTHROPIC_API_KEY) va OCR flagi (IMPORT_OCR). Format: [`docs/IMPORT.md`](docs/IMPORT.md)
- Dashboard (recharts), **QR skaner** (kamera orqali kirish nazorati)

## Arxitektura

```
 Brauzer (React 19, next-intl, Tailwind v4, framer-motion)
        |
        |  /{uz|ru|en}/...   /admin/...           (proxy.ts: locale routing; /api, /admin chetda)
        v
 +-----------------------------  Next.js 16 (Vercel, fra1)  -----------------------------+
 |  app/[locale]/*  (public sahifalar)    app/admin/*  (CMS, server-side guard)           |
 |  app/api/*  (route handlers: zod validatsiya + rate limit)                             |
 |      |  applications  olympiad/*  quiz/*  psych/*  games/leaderboard  visit  health    |
 |      |  admin/[resource]  admin/auth  admin/upload  admin/scan  admin/dashboard        |
 +------|------------------------------------------------------------------------------+
        | DEMO mode (env yo'q):                       | Supabase mode:
        |  seed data, localStorage, in-memory          |  anon key  -> RLS + RPC (public)
        v                                             |  service_role -> faqat server (admin, audit, rate limit)
 components/**/demo.ts, lib/demo-data.ts              v
                                          Supabase: PostgreSQL (RLS, RPC) + Auth + Storage
                                                       |
                                          Telegram Bot API  (yangi arizalar)  /  SMS (rezerv)
```

## Papka tuzilmasi

```
app/
  [locale]/            public sahifalar (about, programs, campus, team, achievements, olympiads,
                       quizzes[/id], psychology[/id], assessment, games, contact, privacy)
  admin/               login, (panel)/ dashboard, [resource], [resource]/[id], scan
  api/                 admin/*, applications, games/leaderboard, olympiad/*, psych/submit,
                       quiz/*, visit, health
components/
  layout/ ui/          Header, Footer, ThemeToggle, LanguageSwitcher, Button, Reveal ...
  home/ public/        bosh sahifa va statik bo'limlar (+ i18n.ts, har biri o'z lug'ati)
  olympiad/ quiz/      ro'yxatdan o'tish, ticket, test runner, natija; demo.ts = demo ma'lumot
  psych/ assessment/   psixologik testlar, ball hisoblash (score.ts)
  games/               5 ta o'yin, GameShell, leaderboard, utils
  admin/               AdminShell, DataTable, ResourceForm, Builders, Scanner, Dashboard ...
lib/
  supabase/            client/server/public/admin klientlar, database.types.ts
  admin/               auth, resources (maydon sxemalari), validation (zod), scales, demo-store, export
  pdf/                 ticket va sertifikat (canvas -> PDF/PNG)
  env.ts rate-limit.ts notify.ts telegram.ts types.ts seo.ts sound.ts utils.ts
i18n/ messages/        next-intl routing va umumiy tarjimalar (uz/ru/en)
supabase/              schema.sql (yagona manba), migrations/, seed.sql, README.md
scripts/db/            check.mjs (PGlite bilan schema+RLS testi), split.mjs
tests/                 vitest unit testlar
e2e/                   Playwright smoke testlar
docs/                  CONTRACT.md, DB-OUTLINE.md, DEPLOY.md
.github/workflows/     ci.yml
proxy.ts vercel.json   locale routing; headerlar va region
```

## Tez boshlash

```bash
npm install
npm run dev            # http://localhost:3000  (DEMO mode, env kerak emas)
```

### Demo hisoblar (faqat DEMO mode: Supabase env yo'q)

| Email | Parol | Rol |
|---|---|---|
| `admin@demo.uz` | `demo1234` | Super admin |
| `metodist@demo.uz` | `demo1234` | Metodist |
| `psixolog@demo.uz` | `demo1234` | Psixolog |

`next start` (production build) da demo admin faqat `ALLOW_ADMIN_DEMO=true` bo'lsa ishlaydi. Haqiqiy deploy'da **bermang**.
Demo ticketlar: `GET /api/olympiad` javobidagi `demoTickets`.

## Scriptlar

| Buyruq | Vazifasi |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest (unit) |
| `npm run test:coverage` | vitest + coverage (v8) |
| `npm run test:e2e:install` | Playwright chromium'ni o'rnatish (bir marta) |
| `npm run test:e2e` | Playwright smoke (`next build` kerak; serverni o'zi ishga tushiradi, port 3100) |
| `npm run db:check` | PGlite'da `schema.sql` + RLS/RPC tekshiruvi (Supabase akkauntisiz) |
| `npm run db:refs` | koddagi barcha Supabase murojaatlari (jadval, ustun, enum, RPC argumentlari, tiplar) haqiqiy sxemaga mosligini statik tekshiradi |
| `npm run smoke` | haqiqiy Supabase + deploy'ga qarshi go-live smoke test (`docs/SUPABASE-GO-LIVE.md`) |
| `npm run db:split` | `schema.sql` dan `migrations/` va `seed.sql` ni qayta yaratish |

## Xavfsizlik modeli

**Public (anonim) nima qila oladi**: kontent o'qish (RLS orqali faqat faol/e'lon qilingan qatorlar), RPC chaqirish,
ariza yuborish (`/api/applications`, honeypot + rate limit), o'yin natijasini saqlash.

**Anon o'qiy OLMAYDI** (jadval grant'lari yo'q): olimpiada ro'yxatlari (PII), test javob kalitlari
(`academic_questions`), psixologik variantlar balli, urinishlar, arizalar, tashriflar, profillar, `audit_log`, `rate_limits`.

**RPC (security definer) himoyasi** - ommaviy amallar faqat shu funksiyalar orqali:
`register_olympiad`, `check_olympiad_result`, `olympiad_leaderboard`, `list_quizzes`, `get_quiz_questions` (to'g'ri javobsiz),
`submit_quiz_attempt` (javobni server tekshiradi), `list_psych_tests`, `get_psych_questions`, `submit_psych_test`,
`get_leaderboard`. Xato kodlari barqaror (`registration_closed`, `already_registered`, ...).

**Qo'shimcha**: zod bilan server validatsiya; rate limit (DB `rate_limit_hit` yoki xotirada); rollar + `is_active` tekshiruvi
har admin so'rovda; `protect_profile_privileged_cols` triggeri o'z-o'zini rolga ko'tarishni to'sadi;
`service_role` faqat serverda va faqat admin tekshirilgandan so'ng; security headerlar (`vercel.json`), CSP hozircha *Report-Only*;
demo test javoblari faqat server modullarida (`components/quiz/demo.ts`), brauzerga chiqmaydi.

## Testlash

- **Unit (vitest, `tests/`)**: `tr()` fallback, o'yin yordamchilari, psixologik ball hisoblash va demo shkalalar to'liqligi,
  olimpiada zod sxemasi + telefon maskasi, shkala bo'shliq/ustma-ust validatori, admin zod generatori + CSV, quiz demo
  baholash (javob sizib chiqmasligi), rate limiter, dashboard agregatsiyasi.
- **E2E (Playwright, `e2e/`)**: barcha public route'lar uz/ru/en da 200 va `<html lang>`, til/tema, 375px da gorizontal skroll yo'q,
  qabul arizasi, olimpiada ro'yxat -> ticket -> natija, quiz -> tushuntirishli natija, o'yin, psixologik test,
  admin login -> dastur yaratish (3 tilda), rol cheklovlari.
- **DB (`npm run db:check`)**: schema, RLS, RPC va rol matritsasi.
- **CI**: `.github/workflows/ci.yml` - lint, typecheck, vitest, db:check, build, Playwright (ixtiyoriy job).

## Deploy

Batafsil: [`docs/DEPLOY.md`](docs/DEPLOY.md) (Supabase, env jadvali, Vercel, domen, Telegram bot, birinchi admin, backup, monitoring)
va [`supabase/README.md`](supabase/README.md).

## Ma'lum cheklovlar

- `/admin` (dashboard) production build'da statik prerender qilingani uchun login'dan keyin `/admin/login` ga qaytaradi
  (boshqa `/admin/*` sahifalar ishlaydi). Tuzatish: panel layout'iga `export const dynamic = "force-dynamic"`.
  E2E'da `KNOWN BUG` sifatida belgilangan.
- Rate limit DEMO/xotira rejimida instansiya bo'yicha (cold start'da nollanadi); production'da `SUPABASE_SERVICE_ROLE_KEY` bilan DB limiti.
- `/api/olympiad`, demo leaderboard va demo admin ma'lumotlari persistent emas (xotira/localStorage).
- ESLint'da yangi React Compiler qoidalari (`set-state-in-effect`, `purity`, `refs`, `static-components`) vaqtincha *warn*; ~20 ta joy refaktoring kutadi.
- SMS bildirishnomalar ulanmagan (faqat Telegram). Brauzer QR skaneri `BarcodeDetector` (Chromium) talab qiladi.
- CSP hali *Report-Only*; `unsafe-inline` ishlatiladi (nonce'ga o'tish kerak).
- Hozirgi Playwright testlar faqat Chromium'da va demo rejimda.
- Hujjat importi: skanerlangan (rasmli) PDF'lar uchun OCR yo'q; eski `.doc` qo'llab-quvvatlanmaydi; yangi o'yin kodi fayldan yaratilmaydi,
  faqat o'yin kontenti (batafsil: [`docs/IMPORT.md`](docs/IMPORT.md)). Import `/admin/import` sahifasidan ham ishlaydi (test, psixologik test, so'rovnoma, o'yin kontenti).

## Roadmap

1. `/admin` bugini tuzatish va ESLint ogohlantirishlarini nolga tushirish
2. CSP'ni enforcing rejimga o'tkazish (nonce)
3. SMS (Eskiz.uz) orqali ruxsatnoma/natija yuborish; ota-onalar kabineti
4. Supabase rejimida E2E (test loyiha + seed) va vizual regressiya testlari
5. Real-time reyting, sertifikatlarni Storage'da saqlash va tekshirish sahifasi
6. Rate limit'ni edge (Vercel KV/Upstash) ga ko'chirish, Sentry ulash
