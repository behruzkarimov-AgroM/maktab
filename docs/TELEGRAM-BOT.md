# Telegram bot

Bot alohida loyiha: **`D:\maktab2.0-telegram-bot`** (Node + TypeScript + grammY). U ma'lumotni faqat shu saytning API'si orqali
oladi: ruxsatlar, tekshiruvlar va audit bitta joyda (saytda) qoladi. Bot hech qachon parol ko'rmaydi va maktab ma'lumotini saqlamaydi.

## Imkoniyatlar

| Kim | Bo'limlar |
|---|---|
| Hamma (ulanmagan) | Maktab haqida, ta'lim dasturlari, aloqa, qabulga ariza (`/api/applications`), olimpiadalar: ro'yxat, ro'yxatdan o'tish, natija |
| Ota-ona | Baholar, davomat (30 kun), dars jadvali, e'lonlar, kelmagan kun uchun sabab yuborish; darsga kelmaganda avtomatik xabar |
| O'quvchi | Baholar, davomat, dars jadvali, e'lonlar |
| O'qituvchi | Bugungi darslar, bugungi davomatni belgilash (tugmalar bilan) |
| Direktor / super admin | Kunlik hisobot (davomat belgilanmagan sinflar, 7 kunlik eng past davomat, chorak o'rtachasi), e'lonlar |

Tillar: o'zbek, rus, ingliz.

## Qanday ishlaydi

1. **Hisobni bog'lash.** Foydalanuvchi portalda (`/school/...` -> Profil / Hisob / Sozlamalar) **"Telegram'ni ulash"** ni bosadi.
   `POST /api/school/telegram` bir martalik kod (8 belgi, 10 daqiqa, faqat SHA-256 xeshi saqlanadi) va
   `https://t.me/<bot>?start=<kod>` havolasini beradi. Bot `POST /api/bot/link` bilan kodni chat id'ga almashtiradi.
   Bitta hisob = bitta chat. Ota-onada chat id `guardians.telegram_chat_id` ga ham yoziladi, shuning uchun mavjud
   "darsga kelmadi" xabarlari (`SCHOOL_NOTIFY_ABSENCE=on`) shu chatga boradi.
2. **Bot so'rovlari.** Har so'rovda `x-bot-secret: <BOT_API_SECRET>` va `x-telegram-chat-id`. `/api/school/*` endpointlari
   (`lib/school/api-helpers.ts`) bunday so'rovni chatga bog'langan foydalanuvchi sifatida bajaradi: rol, `is_active`, vaqtincha parol
   qulfi, scoping, audit - cookie bilan kirgandagidek. Bog'lanmagan chat -> `401 not_linked`.
3. **Cheklovlar** (rate limit) bot so'rovlarida IP bo'yicha emas, chat bo'yicha hisoblanadi (bot serverining IP'si bitta).
4. Bog'lashni bekor qilish: botda "Hisobdan chiqish" (`DELETE /api/bot/link`) yoki portalda "Uzish" (`DELETE /api/school/telegram`).

Yangi endpointlar: `GET|POST|DELETE /api/school/telegram` (faqat portal cookie'si), `POST|DELETE /api/bot/link` (faqat bot),
`GET /api/public/info` (ommaviy: maktab ma'lumoti va dasturlar).
Baza: `telegram_links`, `telegram_link_codes` (`supabase/migrations/0003_telegram_bot.sql`; faqat service role, RLS yoqilgan).

## Ishga tushirish

1. **@BotFather** -> `/newbot` -> token va username oling.
2. Sayt env (`.env.local` / Vercel):
   - `TELEGRAM_BOT_TOKEN` = shu bot tokeni (xabarlar shu botdan boradi)
   - `TELEGRAM_BOT_USERNAME` = bot username'i (`@` siz)
   - `BOT_API_SECRET` = 32+ belgili tasodifiy satr: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - ixtiyoriy: `SCHOOL_NOTIFY_ABSENCE=on` (darsga kelmaganlik haqida xabar)
3. Supabase'da `supabase/migrations/0003_telegram_bot.sql` ni bajaring (yoki yangilangan `schema.sql` ni qayta ishga tushiring).
4. Bot papkasida `.env` (`.env.example` dan): `BOT_TOKEN`, `SITE_URL`, `BOT_API_SECRET` (saytdagi bilan bir xil).
5. `npm install`, `npm run build`, `npm start` (yoki `npm run dev`). Batafsil: bot loyihasining `README.md`.

## Tekshiruv

- Sayt: `tests/telegram-bot-api.test.ts` (demo), `tests/accounts-sim.test.ts` (haqiqiy sxema, PGlite).
- Bot: `npm test` (soxta sayt bilan 21 test) va jonli kontrakt testi: sayt `ALLOW_ADMIN_DEMO=true`, `BOT_API_SECRET`,
  `TELEGRAM_BOT_USERNAME` bilan ishlab turganda `LIVE_SITE_URL=http://localhost:3000 LIVE_BOT_SECRET=... npx vitest run test/live.test.ts`.
