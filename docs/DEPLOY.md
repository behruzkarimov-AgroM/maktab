# Deploy qo'llanmasi (Supabase + Vercel)

Bu hujjat saytni demo rejimdan **production**ga o'tkazish bosqichlarini tushuntiradi. Env o'zgaruvchilari bo'lmasa sayt
*DEMO mode*da ishlaydi (seed data + localStorage); Supabase o'zgaruvchilari berilgach avtomatik haqiqiy DB'ga o'tadi.

Tezkor yo'l: **1) Supabase -> 2) env -> 3) Vercel -> 4) domen -> 5) birinchi admin -> 6) Telegram -> 7) monitoring**.

---

## 1. Supabase sozlash

1. https://supabase.com -> **New project**. Region: O'zbekistonga yaqin (masalan *Frankfurt / eu-central*). DB parolini saqlang.
2. **SQL Editor** ga `supabase/schema.sql` ni to'liq joylab **Run** qiling. U schema, RLS, RPC funksiyalar, Storage
   bucket'lar (`school-media`, `test-assets`, `certificates`) va demo seed'ni o'z ichiga oladi va **idempotent**
   (qayta ishga tushirsa bo'ladi). Variant: `supabase link` + `supabase db push` (migrations/) va `seed.sql`.
3. Production'da toza baza kerak bo'lsa, `seed.sql` qismini o'tkazib yuboring.
4. **Authentication -> Providers -> Email** yoqilgan bo'lsin. **Enable sign ups** ni o'chiring (faqat xodimlar kiradi,
   foydalanuvchilar ro'yxatdan o'tmaydi).
5. **Authentication -> URL Configuration**: *Site URL* = `https://sizning-domen.uz`, *Redirect URLs* ga ham qo'shing.
6. Lokal tekshiruv (Supabase akkauntisiz): `npm run db:check` (PGlite orqali schema + RLS testlari, ~5 s).

## 2. Environment o'zgaruvchilari

| O'zgaruvchi | Majburiy | Qayerda | Izoh |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ha (prod) | Supabase -> Settings -> API | Project URL. **Anon key bilan birga** bering. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ha (prod) | Supabase -> Settings -> API | `anon` `public` kalit; brauzerga chiqishi xavfsiz (RLS himoyalaydi). |
| `SUPABASE_SERVICE_ROLE_KEY` | ha (prod) | Supabase -> Settings -> API | **Maxfiy**, faqat server. Admin CMS yozuvlari, upload, audit log, rate limit. Hech qachon `NEXT_PUBLIC_` bilan bermang. |
| `NEXT_PUBLIC_SITE_URL` | tavsiya | - | `https://maktab2.uz` (oxirida `/`siz). Sitemap, OG, QR uchun. |
| `TELEGRAM_BOT_TOKEN` | ixtiyoriy | @BotFather | Qabul arizalari haqida xabar. `CHAT_ID` bilan birga. |
| `TELEGRAM_CHAT_ID` | ixtiyoriy | 6-bo'lim | Guruh/shaxsiy chat ID (guruh uchun `-100...`). |
| `ALLOW_ADMIN_DEMO` | **yo'q** | - | **Bermang**. Demo hisoblar sukut bo'yicha yopiq (dev'da ham); faqat `true` bo'lsa va Supabase yo'q bo'lsa ochiladi (testlar uchun). |
| `SMS_PROVIDER`, `SMS_API_URL`, `SMS_API_TOKEN`, `SMS_SENDER` | ixtiyoriy | - | Rezerv (hozircha ulanmagan). Eskiz.uz uchun `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`. |

Namuna: `.env.example` -> `.env.local`. Tekshirish: `GET /api/health` -> `{"ok":true}` (503 `{"ok":false}` when config/DB is broken)
(maxfiy ma'lumot chiqarmaydi).

## 3. Vercel'ga deploy

1. Kodni GitHub'ga push qiling. Vercel -> **Add New -> Project** -> repo'ni tanlang. Framework: *Next.js* (avtomatik).
2. **Settings -> Environment Variables**: yuqoridagi jadvalni *Production* (va kerak bo'lsa *Preview*) uchun kiriting.
3. **Deploy**. Build buyrug'i: `npm run build`, Node 22 tavsiya.
4. `vercel.json` allaqachon bor: region `fra1`, xavfsizlik headerlari (*X-Frame-Options*, *Referrer-Policy*,
   *Permissions-Policy* `camera=(self)` - admin QR skaneri uchun, HSTS) va **CSP faqat Report-Only** rejimida.
   CSP'ni bosqichma-bosqich qattiqlashtiring: brauzer konsolidagi buzilishlarni ko'rib chiqing, so'ng
   `Content-Security-Policy-Report-Only` kalitini `Content-Security-Policy` ga almashtiring (inline script'lar
   uchun nonce kerak bo'lishi mumkin).
5. CI (`.github/workflows/ci.yml`) har PR'da lint, tsc, vitest, `db:check`, build va (ixtiyoriy) Playwright smoke
   testlarini ishga tushiradi. Vercel Git integratsiyasi uchun CI "green" bo'lishini *Branch protection*da talab qiling.

## 4. Custom domen

1. Vercel -> Project -> **Settings -> Domains -> Add** `maktab2.uz` va `www.maktab2.uz`.
2. Registrator DNS'ida: apex uchun `A 76.76.21.21`, `www` uchun `CNAME cname.vercel-dns.com` (Vercel ko'rsatgan qiymatlarni
   ishlating). SSL avtomatik (Let's Encrypt).
3. `NEXT_PUBLIC_SITE_URL` va Supabase *Site URL* ni yangi domenga o'zgartiring, qayta deploy qiling.
4. `.uz` domenlar uchun NS/DNS yangilanishi bir necha soat olishi mumkin.

## 5. Birinchi super admin

1. Supabase -> **Authentication -> Users -> Add user** (email + parol, *Auto confirm user*). Trigger `profiles` qatorini
   (`role = student`) avtomatik yaratadi.
2. **SQL Editor**:
   ```sql
   update public.profiles set role = 'super_admin'
   where id = (select id from auth.users where email = 'siz@maktab.uz');
   ```
3. `https://domen/admin/login` orqali kiring. Boshqa xodimlar: xuddi shunday yarating va rolni `methodist` yoki
   `psychologist` qiling. `is_active = false` kirishni darhol bekor qiladi.
4. Faqat `super_admin` rollarni o'zgartira oladi (self-promotion trigger bilan bloklangan).

## 6. Telegram bot (qabul arizalari)

1. Telegram'da **@BotFather** -> `/newbot` -> nom va username -> **token**ni oling (`123456:ABC...`).
2. Botni yangi guruhga qo'shing (yoki shaxsiy chatda `/start` bosing).
3. Chat ID: guruhga biror xabar yozing, so'ng brauzerda
   `https://api.telegram.org/bot<TOKEN>/getUpdates` ni oching va `chat.id` ni oling (guruhlar uchun manfiy, `-100...`).
4. Vercel env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` -> redeploy.
5. Sinov: saytda `/contact` orqali ariza yuboring - guruhda "Yangi ariza" xabari chiqishi kerak. Token yo'q bo'lsa xabar
   jimgina o'tkazib yuboriladi (ariza baribir bazaga yoziladi). Botga faqat shu chatga yozish ruxsati yetarli.

## 7. Backup va tiklash

- Supabase **Pro** rejada kunlik avtomatik backup va PITR; **Free** rejada backup yo'q - kamida haftalik qo'lda oling:
  `supabase db dump --db-url "$DB_URL" -f backup-$(date +%F).sql` (yoki Dashboard -> Database -> Backups).
- Storage fayllari (`school-media`, `certificates`) DB backupga kirmaydi: Dashboard orqali yoki `rclone`/S3 API bilan nusxalang.
- Eski ma'lumotlarni tozalash: `select public.purge_old_data();` (visits 400 kun, audit 730 kun). `pg_cron` bilan:
  `select cron.schedule('purge-old-data','17 3 * * *','select public.purge_old_data()');`
- Tiklash mashqini yiliga kamida 1 marta alohida test loyihada bajaring.
- Registratsiya/ariza ma'lumotlari shaxsiy ma'lumot: backup'larni shifrlangan joyda saqlang.

## 8. Monitoring

- **Health check**: UptimeRobot / Better Stack -> `GET https://domen/api/health` (har 5 daqiqa; `ok:false` yoki 5xx bo'lsa alert).
- **Vercel**: Deployments -> *Logs* va *Observability*; *Speed Insights/Analytics* ni xohlasangiz yoqing.
- **Supabase**: Reports (DB hajmi, CPU, auth), *Logs Explorer* (RLS/RPC xatolari). Free reja 500 MB DB limitiga yaqinlashsa
  `purge_old_data` va eski `visits`ni tozalang.
- **CSP hisobotlari**: Report-Only davrida brauzer DevTools -> Console'da "Content Security Policy" ogohlantirishlarini kuzating.
- **Admin audit log**: `/admin` -> Audit jurnali (faqat super admin).
- Muhim hodisalar: ariza Telegram guruhiga tushadi; 429 (rate limit) ko'payishi - hujum/bot belgisi.

## 9. Production oldidan checklist

- [ ] `npm run lint && npm run typecheck && npm test && npm run db:check && npm run build` hammasi yashil
- [ ] `schema.sql` production loyihada bajarilgan, `anon` maxfiy jadvallarni o'qiy olmasligi tekshirilgan (`db:check`)
- [ ] `ALLOW_ADMIN_DEMO` o'rnatilmagan; demo hisoblar (`admin@demo.uz`) mavjud emas (Supabase rejimida ular ishlamaydi)
- [ ] Super admin yaratilgan, parol kuchli; Supabase'da sign-up o'chirilgan
- [ ] `/api/health` -> `{"ok":true}`
- [ ] Domen + HTTPS + `NEXT_PUBLIC_SITE_URL`
- [ ] Telegram ariza sinovi o'tgan
- [ ] Backup rejasi va monitoring ulangan


## CSP

The Content-Security-Policy is ENFORCED (next.config.ts `headers()`; vercel.json no longer sets headers). script-src keeps 'unsafe-inline' because Next hydration data and the theme bootstrap script are inline; a nonce policy would force dynamic rendering of every public page and needs RootHtml to pass the nonce (product decision). All other directives are strict (object-src none, base-uri/form-action self, frame-ancestors self, connect-src self + Supabase).
