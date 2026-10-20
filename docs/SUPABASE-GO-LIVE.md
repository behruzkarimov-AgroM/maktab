# Supabase'ga o'tish: bosqichma-bosqich qo'llanma (egasi uchun)

Bu hujjat saytni va **maktab boshqaruv tizimini (SIS, `/school`)** demo rejimdan haqiqiy Supabase loyihasiga o'tkazadi.
Umumiy deploy (Vercel, domen, Telegram) uchun `docs/DEPLOY.md`, SIS tafsilotlari uchun `docs/SIS.md` ga qarang.

> **Muhim.** Kodning Supabase rejimi bu kompyuterda haqiqiy Supabase'siz sinalgan: sxema + RLS + RPC lar PGlite (haqiqiy PostgreSQL)
> ichida, `tests/supabase-sim.test.ts` esa `db-supabase.ts`, kirish, rollar va API'larni shu sxemaga qarshi ishga tushiradi.
> Lekin tarmoq, GoTrue (haqiqiy xat yuborish) va Storage faqat **haqiqiy loyihada** tekshiriladi - shuning uchun 9-bosqichdagi
> `npm run smoke` majburiy. Xato chiqsa 12-bo'limga qarang.

Tartib: **1 loyiha -> 2 SQL -> 3 bucket -> 4 Auth -> 5 SMTP -> 6 env/Vercel -> 7 birinchi admin -> 8 ma'lumot -> 9 smoke -> 10 backup -> 11 monitoring**.

---

## 0. Tayyorgarlik

- GitHub'da repo, Vercel akkaunti, Supabase akkaunti (https://supabase.com).
- Lokal tekshiruv (Supabase kerak emas): `npm ci && npm run db:check && npm run db:refs && npm test` - hammasi yashil bo'lsin.
- **Reja haqida:** Free reja 7 kun faoliyatsiz qolsa loyihani *pauza* qiladi va backup bermaydi. Maktab uchun **Pro** (kunlik backup,
  PITR qo'shimchasi, pauza yo'q) tavsiya etiladi.

## 1. Loyiha yaratish

1. Supabase -> **New project**. Region: Frankfurt (`eu-central-1`) - O'zbekistonga eng yaqin.
2. **Database password** ni kuchli qilib belgilang va parol menejerida saqlang (kodga kerak emas, faqat qo'lda dump uchun).
3. Loyiha tayyor bo'lgach **Project Settings -> API** sahifasidan nusxa oling:
   - `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` -> `SUPABASE_SERVICE_ROLE_KEY` (**maxfiy**: faqat server, hech qachon `NEXT_PUBLIC_` bilan emas, chatga/gitga tashlamang).

## 2. Sxema va seed (migratsiya)

Variant A (eng oddiy): **SQL Editor** -> `supabase/schema.sql` ni to'liq joylab **Run**. U idempotent: yangilangandan keyin
qayta ishga tushirsa bo'ladi (jadvallar `if not exists`, ustunlar `add column if not exists`, funksiyalar `create or replace`).

Variant B (CLI): `supabase link --project-ref <ref>` -> `supabase db push` (`supabase/migrations/0001_init.sql`), keyin
`supabase/seed.sql` ni SQL Editor'da yoki `psql` bilan ishga tushiring.

Eslatmalar:
- `migrations/0001_init.sql` va `seed.sql` **faqat** `schema.sql` dan `npm run db:split` bilan yaratiladi (qo'lda tahrirlamang;
  CI `db:split --check` bilan tekshiradi). Bitta migratsiya fayli bor, shuning uchun sxema o'zgarsa CLI foydalanuvchilari ham
  yangilangan `schema.sql` ni SQL Editor'da qayta ishga tushirishi kerak.
- **Seed** demo kontent (dasturlar, viktorina, o'yinlar) va SIS ma'lumotnomasini (2026-2027 o'quv yili, 4 chorak, 12 fan, 14 sinf)
  qo'shadi. Ishchi bazada demo kontentni admin panelida o'chirib, o'quv yilini `/school/director/settings` da o'zingizniki bilan
  almashtiring. Toza baza uchun `seed.sql` ni ishga tushirmang (lekin sinflar/fanlar/choraklarni o'zingiz kiritishingiz kerak bo'ladi).
- Tekshirish: SQL Editor -> `select count(*) from public.terms;` (>= 4), `select proname from pg_proc where proname = 'mark_attendance_bulk';`.
- Jadval "not in schema cache" desa: SQL Editor -> `notify pgrst, 'reload schema';`.

## 3. Storage bucket'lar

`schema.sql` o'zi yaratadi: `school-media`, `test-assets`, `certificates` (8 MB limit, ommaviy o'qish, yozish faqat xodimlar).
**Storage** sahifasida uchalasi ko'rinishi kerak. `certificates` ichidagi fayllarni anon ro'yxatlay olmaydi (faqat URL bo'yicha) -
smoke skript buni tekshiradi. Qo'shimcha bucket kerak emas.

## 4. Authentication sozlamalari

**Authentication -> Providers -> Email**
- *Enable Email provider*: **ON**.
- *Enable sign ups*: **OFF** (hisoblarni faqat direktor/admin yaratadi; ochiq ro'yxatdan o'tish yo'q).
- *Confirm email*: **ON** qoldiring (direktor yaratgan hisoblar `email_confirm: true` bilan darhol tasdiqlangan bo'ladi).
- *Secure email change*: ON.

**Authentication -> Sign In / Providers -> Password** (nomi versiyaga qarab o'zgaradi)
- *Minimum password length*: **8** (ilova qo'shimcha ravishda: 8-72 belgi, kamida bitta harf va raqam, ommabop parollar va e-pochta nomi taqiqlangan).
- *Password requirements*: "lowercase + uppercase + digits" ni yoqish mumkin: direktor uchun yaratiladigan vaqtincha parol (12 belgi) doim
  kichik harf, katta harf va raqam saqlaydi. Supabase talabi ilova qoidasidan qattiqroq bo'lsa, ikkalasi ham bajariladi
  (direktor o'zi parol bersa, u ham shu talabga mos bo'lishi kerak).
- *Leaked password protection* (Pro): ON.
- *Secure password change* (Settings): ON bo'lsa, eski sessiyada parol almashtirish "reauthentication" talab qiladi - ilova joriy parolni o'zi
  tekshirgani uchun admin API orqali davom etadi, ya'ni foydalanuvchiga xalaqit bermaydi.

**Authentication -> URL Configuration**
- *Site URL*: `https://sizning-domen.uz` (oxirida `/` siz).
- *Redirect URLs* (har birini alohida qo'shing):
  - `https://sizning-domen.uz/school/reset-password`  (parolni tiklash havolasi, `NEXT_PUBLIC_SITE_URL` + `/school/reset-password`)
  - `https://sizning-domen.uz/**`
  - lokal sinov uchun `http://localhost:3000/**`
  Ro'yxatda bo'lmagan manzilga Supabase yo'naltirmaydi - parol tiklash xati "ishlamaydi" bo'lib qoladi.

**Authentication -> Email Templates -> Reset Password** (ixtiyoriy, lekin tavsiya): havolani shunday o'zgartiring, shunda havola **istalgan
brauzerda/telefonda** ishlaydi (standart PKCE havolasi faqat so'rov yuborilgan brauzerda ishlaydi):
```html
<h2>Parolni tiklash</h2>
<p><a href="{{ .SiteURL }}/school/reset-password?token_hash={{ .TokenHash }}&type=recovery">Yangi parol o'rnatish</a></p>
```
UI sahifasi (`/school/reset-password`) `token_hash` ni `POST /api/school/auth/complete-reset` ga yuboradi (`docs/SIS.md`).

**Authentication -> Rate Limits**: *emails sent per hour* ni SMTP ulagandan keyin oshiring (standart juda past).

## 5. SMTP (xat yuborish) - parolni tiklash uchun SHART

Supabase'ning o'rnatilgan pochtasi soatiga bir necha xat bilan cheklangan va faqat **jamoa a'zolari** manzillariga yuboradi.
Ota-onalar uchun parolni tiklash ishlashi uchun o'z SMTP'ingizni ulang:

1. Xizmat tanlang: Resend, Brevo (Sendinblue), Mailgun, Postmark yoki Gmail/Google Workspace (App Password).
2. **Project Settings -> Authentication -> SMTP Settings** -> *Enable custom SMTP*:
   Host (masalan `smtp.resend.com`), Port `465` (SSL) yoki `587`, Username, Password, *Sender email* (`no-reply@sizning-domen.uz`), *Sender name*.
3. Domeningiz uchun **SPF/DKIM/DMARC** DNS yozuvlarini xizmat ko'rsatmasi bo'yicha qo'shing (aks holda xatlar spamga tushadi).
4. Sinov: `/school/login` -> "Parolni unutdim" -> haqiqiy manzil. Xat kelmasa: Supabase **Logs -> Auth** va SMTP xizmati loglarini ko'ring.

> Xavfsizlik: `POST /api/school/auth/request-reset` e-pochta mavjudligini **hech qachon oshkor qilmaydi** (har doim bir xil javob), IP bo'yicha
> 10/10 daqiqa va manzil bo'yicha 3/10 daqiqa limit bor.

## 6. Environment o'zgaruvchilari va Vercel

Vercel -> Project -> **Settings -> Environment Variables** (Production, kerak bo'lsa Preview):

| O'zgaruvchi | Qiymat | Izoh |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | URL va anon kalitni **birga** bering |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public | brauzerga chiqadi, RLS himoyalaydi |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role | **SIS uchun majburiy**: jadval o'qish/yozish, hisob yaratish (`auth.admin`), audit |
| `NEXT_PUBLIC_SITE_URL` | `https://sizning-domen.uz` | parolni tiklash havolasi, sitemap, QR |
| `SCHOOL_NOTIFY_ABSENCE` | `on` (ixtiyoriy) | qoldirilgan dars haqida Telegram xabari (ota-onaning `telegram_chat_id`si va `TELEGRAM_BOT_TOKEN` kerak) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | ixtiyoriy | arizalar va davomat xabarlari |
| `ALLOW_ADMIN_DEMO` | **bermang** | production'da demo kirish yopiq bo'lsin |

Qoidalar:
- `NEXT_PUBLIC_*` qiymatlar **build vaqtida** kiritiladi: o'zgartirgach albatta **Redeploy** qiling (aks holda sayt hamon DEMO rejimida bo'ladi).
- `SUPABASE_SERVICE_ROLE_KEY` bo'lmasa maktab portali ishlamaydi (`/api/school/*` -> `not_configured` 501 yoki `unauthorized`).
- Tekshirish: `https://domen/api/health` -> `{"ok":true}`.

## 7. Birinchi super admin va direktor

**Tez yo'l:** `.env.local` to'ldirilgach `npm run accounts:create`. Skript har rol uchun bitta login yaratadi (`admin@`, `direktor@`,
`metodist@`, `psixolog@`, `oqituvchi@`, `oquvchi@`, `ota-ona@` + `SCHOOL_EMAIL_DOMAIN`), o'qituvchi/o'quvchi/ota-ona uchun "Namuna"
yozuvlarini bog'laydi va hammasini `HISOBLAR.local.md` ga yozadi (gitga tushmaydi). Qayta ishga tushirish xavfsiz: mavjud hisoblar
o'zgarmaydi (`-- --reset` yangi parol beradi). Quyidagi qo'lda yo'l ham ishlaydi.

**O'quvchi + ota-ona:** super admin `/admin/enroll` sahifasida kiritadi; ikkalasiga hisob avtomatik yaratiladi (login maktab
domenida, masalan `karimov.sardor@...`; band bo'lsa `karimov.sardor2@...`). Ota-ona telefoni bazada bo'lsa (aka-uka), yangi ota-ona
yaratilmaydi: bola mavjud ota-onaga bog'lanadi.

1. **Authentication -> Users -> Add user** (email + parol, *Auto Confirm User*). Trigger `profiles` qatorini (`role = student`) o'zi yaratadi.
2. **SQL Editor**:
   ```sql
   -- sayt admin paneli (/admin) + hamma narsa:
   update public.profiles set role = 'super_admin'
   where id = (select id from auth.users where email = 'siz@maktab.uz');

   -- faqat maktab portali direktori (/school/director), admin panelisiz:
   update public.profiles set role = 'school_admin'
   where id = (select id from auth.users where email = 'direktor@maktab.uz');
   ```
3. Kirish: `/admin/login` (super_admin, methodist, psychologist) yoki `/school/login` (super_admin, school_admin, teacher, parent, student).
   `methodist` va `psychologist` maktab portaliga kira olmaydi.
4. O'qituvchi/ota-ona/o'quvchi hisoblarini direktor portalning o'zida yaratadi (7a).

**7a. Hisob yaratish (direktor):** `POST /api/school/accounts` (yoki UI) o'qituvchi/o'quvchi/vasiy uchun login yaratadi va **bir martalik
vaqtincha parol** qaytaradi. Vasiy uchun qulay yo'l: `POST /api/school/guardians/invite` - vasiyni yaratadi, bolalarini bog'laydi va
ota-ona loginini beradi. Vaqtincha parolli hisob `must_change_password = true` bilan belgilanadi: birinchi kirishda foydalanuvchi **faqat**
parolni almashtira oladi (`password_change_required`), keyin hammasi ochiladi. Parolni xavfsiz kanal orqali yetkazing, loglarga yozmang.

## 8. Maktab ma'lumotlarini kiritish

1. `/school/director/settings`: o'quv yili va choraklar sanalari (seed namunasini o'zgartiring), baholash qoidalari.
2. Fanlar, sinflar (sinf rahbari), o'qituvchilar, o'qituvchi-sinf-fan biriktirishlari (`teaching_assignments`).
3. O'quvchilar: `/school/director/import` (Excel/CSV, 1000 qatorgacha, avval "preview") yoki bittalab.
4. Vasiylar va bog'lash; hisoblar (7a).
5. Dars jadvali: bir xonada bir vaqtda bitta sinf (`room_busy`), bir o'qituvchi bir vaqtda bitta darsda bo'ladi (`conflict`) - baza ham shuni majburlaydi.
6. Chorak yopilgach `/school/director/grades` dan chorakni **qulflang** (`lock_term`): o'qituvchilar baho o'zgartira olmaydi.

## 9. Smoke test (majburiy)

Sinov hisoblari yarating (har rol uchun bittadan; vaqtincha parolni oldindan almashtirib qo'ying) yoki mavjudlaridan foydalaning.
`.env.local` (yoki shell) da:

```bash
NEXT_PUBLIC_SUPABASE_URL=...        NEXT_PUBLIC_SUPABASE_ANON_KEY=...     SUPABASE_SERVICE_ROLE_KEY=...
BASE_URL=https://sizning-domen.uz
SMOKE_ADMIN_EMAIL=...               SMOKE_ADMIN_PASSWORD=...
SMOKE_SCHOOL_DIRECTOR_EMAIL=...     SMOKE_SCHOOL_DIRECTOR_PASSWORD=...
SMOKE_SCHOOL_TEACHER_EMAIL=...      SMOKE_SCHOOL_TEACHER_PASSWORD=...
SMOKE_SCHOOL_PARENT_EMAIL=...       SMOKE_SCHOOL_PARENT_PASSWORD=...
SMOKE_SCHOOL_STUDENT_EMAIL=...      SMOKE_SCHOOL_STUDENT_PASSWORD=...
```
```bash
npm run smoke            # = node scripts/supabase-smoke.mjs
```
Skript PASS/FAIL jadvalini chiqaradi (FAIL bo'lsa kod 1 bilan tugaydi). U nimani tekshiradi:

| Guruh | Tekshiruv |
|---|---|
| app / public pages | `/api/health`, bosh sahifa va asosiy sahifalar 200, noma'lum sahifa 404 |
| supabase | REST ishlaydi, sign-up o'chiq, seed bor |
| anon cannot read/write | anon kaliti bilan `students`, `grade_entries`, `attendance`, `profiles`, `audit_log`, ... **o'qib bo'lmaydi**, yozib bo'lmaydi |
| rpc | anon uchun `list_quizzes` ishlaydi, maktab RPC lari (`mark_attendance_bulk`, `lock_term`, ...) anon uchun yopiq; service role bilan RPC lar **ilova ishlatadigan argument nomlari** bilan mavjud |
| schema | SIS jadvallari, yangi ustunlar/jadvallar (`override_reason`, `school_notification_prefs`, `must_change_password`), xona/o'qituvchi unique indekslari, bucket'lar, kamida bitta `super_admin` |
| admin | Supabase paroli bilan kirish, profil roli CMS roli |
| school | har rol uchun: login, `/me` (`demo:false`), faqat o'z doirasidagi ma'lumot (o'quvchi 1 ta o'quvchi, ota-ona faqat bolalari), direktor-only endpointlar 403, noto'g'ri parol 401, logoutdan keyin 401 |
| registration | vaqtinchalik olimpiada yaratadi, ro'yxatdan o'tkazadi, takroriy so'rovni rad etadi, **hammasini o'chiradi** (`SMOKE_SKIP_OLYMPIAD=1` bilan o'tkazib yuborish mumkin) |

Skript mavjud ma'lumotni o'zgartirmaydi; faqat ikki vaqtinchalik yozuv (olimpiada, jadval qatori) yaratib, oxirida o'chiradi.
Telegram sozlangan bo'lsa "SMOKE TEST" xabari kelishi mumkin.

## 10. Backup

- **Pro**: kunlik avtomatik backup (Dashboard -> Database -> Backups); PITR qo'shimchasini yoqing - baholar va davomat uchun foydali.
- **Free**: backup yo'q. Haftasiga kamida bir marta: `pg_dump "$DB_URL" -Fc -f backup-$(date +%F).dump` (Settings -> Database -> Connection string).
- Storage fayllari DB backupiga kirmaydi - `rclone`/Dashboard orqali nusxalang.
- Har chorak oxirida (qulflashdan oldin) va o'quv yili oxirida alohida to'liq dump oling va shifrlangan joyda saqlang (shaxsiy ma'lumot).
- Tiklash mashqi: yiliga kamida bir marta dumpni **alohida test loyihada** tiklab, `npm run smoke` ni unga qarshi ishga tushiring.
- Kalitlar almashtirilishi: `service_role` kaliti sizib chiqsa - Settings -> API -> *Reset*, Vercel env'ni yangilab redeploy qiling.

## 11. Monitoring

- **Uptime**: UptimeRobot/Better Stack -> `GET /api/health` (har 5 daqiqa). Bu Free rejada loyiha pauzaga tushmasligiga ham yordam beradi.
- **Supabase**: *Reports* (DB hajmi, CPU, auth so'rovlari), *Logs Explorer* (Postgres va Auth loglari: RLS/RPC xatolari, SMTP xatolari).
  *Settings -> Billing* da hajm/trafik ogohlantirishlarini yoqing.
- **Vercel**: Logs -> `[school-db]`, `[school]`, `[school-reset]`, `[school-account]` teglari bilan qidiring (shaxsiy ma'lumotsiz yoziladi).
- **Audit**: direktor portalidagi "Audit" sahifasi (`audit_log`): baho/davomat massiv yozuvlari, qulf, hisob yaratish, parol tiklash, excuse qabul qilish.
- Signal: `429 rate_limited` va `invalid_credentials` ko'payishi - hujum belgisi; 5xx - Vercel loglarini oching.
- Tozalash: `select public.purge_old_data();` (pg_cron bilan har kuni, `docs/DEPLOY.md` 7-bo'lim).

## 12. Keng tarqalgan xatolar

| Alomat | Sabab va yechim |
|---|---|
| Sayt hamon demo (`demo:true`, `director@demo.uz` ishlaydi) | `NEXT_PUBLIC_SUPABASE_*` build vaqtida yo'q edi. Env'ni kiriting va **Redeploy** qiling. |
| `/api/school/*` -> `501 not_configured` | `SUPABASE_SERVICE_ROLE_KEY` yoki URL yo'q. |
| Login `401 invalid_credentials`, parol to'g'ri | `profiles.is_active = false`, yoki rol maktab roli emas (`methodist`/`psychologist`), yoki hisob boshqa loyihada. SQL: `select id, role, is_active from public.profiles where id = (select id from auth.users where email = '...');` |
| Login bor, lekin `/me` -> 401 | Cookie ketmayapti: `www` va apex domen aralashgan, HTTPS yo'q, yoki Site URL boshqa domen. Bitta kanonik domen ishlating. |
| `403 password_change_required` | Hisob vaqtincha parolda. UI parol almashtirish sahifasiga yo'naltirishi kerak; vaqtincha: `POST /api/school/auth/change-password`. |
| `42501 permission denied for table ...` | `schema.sql` to'liq bajarilmagan (grant/RLS yo'q) yoki noto'g'ri kalit ishlatilgan (anon o'rniga service). `schema.sql` ni qayta ishga tushiring. |
| `PGRST202 Could not find the function ...` | Funksiya yoki argument nomi eski. Yangi `schema.sql` ni ishga tushiring, `notify pgrst, 'reload schema';`. |
| `PGRST205 table ... in the schema cache` | Jadval yo'q yoki kesh eski: SQL bajaring + `notify pgrst, 'reload schema';`. |
| `column ... does not exist` (500 `db_error`) | Eski sxema: yangi `schema.sql` (idempotent) ni qayta ishga tushiring. `npm run db:refs` kod-sxema moslikni lokal tekshiradi. |
| Parol tiklash xati kelmaydi | SMTP ulanmagan/cheklov (5-bo'lim), spam papkasi, Redirect URLs ro'yxatida manzil yo'q. Supabase Logs -> Auth. |
| Havola ochiladi, "invalid_token" | Havola 1 soatdan keyin eskirgan yoki bir marta ishlatilgan; yoki PKCE `code` boshqa brauzerda ochilgan - 4-bo'limdagi `token_hash` shablonini qo'ying. |
| `weak_password` | 8-72 belgi, harf+raqam, ommabop/e-pochtaga o'xshash emas, eskisidan farqli. |
| `wrong_password` (403) | Joriy parol noto'g'ri. 5 urinish / 10 daqiqa, keyin `429`. |
| `room_busy` / `conflict` (jadval) | Xona yoki o'qituvchi o'sha hafta kuni va dars raqamida band. |
| `term_locked` / `edit_window_closed` | Chorak qulflangan (faqat direktor o'zgartiradi) / o'qituvchi 14 kundan eski davomatni o'zgartira olmaydi. |
| `already_resolved` | Bu kun uchun sabab allaqachon qabul qilingan (`excused`). |
| Login `429` | 10 urinish / 10 daqiqa / IP. Kutish yoki boshqa tarmoq. |
| Loyiha "paused" | Free reja 7 kunlik faoliyatsizlikdan keyin; Dashboard'dan *Restore*. Pro'ga o'ting yoki health-check qo'shing. |
| Sanalar bir kunga siljigan | Maktab kuni `Asia/Tashkent` (UTC+5). `school_today()` shu zonada hisoblaydi; sanalarni `YYYY-MM-DD` formatida yuboring. |

## 13. Ishga tushirishdan oldingi qisqa checklist

- [ ] `schema.sql` bajarilgan, `select count(*) from public.terms` >= 4
- [ ] Sign-ups OFF, Site URL va Redirect URLs to'g'ri, custom SMTP ulangan va sinalgan
- [ ] Vercel env to'liq (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`), `ALLOW_ADMIN_DEMO` yo'q, redeploy qilingan
- [ ] Super admin va direktor yaratilgan, demo hisoblar ishlamasligi tekshirilgan
- [ ] `npm run smoke` -> `RESULT: PASS`
- [ ] Backup (Pro yoki haftalik dump) va uptime monitoring ulangan
- [ ] Haqiqiy o'qituvchi/ota-ona bilan bitta to'liq oqim sinalgan: login -> parol almashtirish -> davomat -> baho -> sabab yuborish -> qabul qilish
