# O'z serverida (Supabase'siz)

Sayt Supabase loyihasisiz, serverdagi oddiy **PostgreSQL** bilan ishlaydi. `DATABASE_URL` berilsa shu rejim yoqiladi.

## Qanday ishlaydi

`lib/localdb/` Supabase'ning ilova ishlatadigan qismini o'zi bajaradi, qolgan kod o'zgarmagan:

| Supabase'da | Bu yerda |
|---|---|
| PostgREST (jadval so'rovlari, RPC) | `lib/localdb/gateway.ts`: har so'rov bitta tranzaksiya, `set local role anon/authenticated/service_role` + JWT claims. RLS, GRANT'lar, `auth.uid()` aynan Supabase'dagidek ishlaydi |
| Supabase Auth | `auth.users` jadvali, parollar **scrypt** xeshi; sessiya: HMAC (`AUTH_SECRET`) bilan imzolangan httpOnly cookie `ca_session` (14 kun) |
| Storage | fayllar diskda (`UPLOAD_DIR`), ommaviy bucket'lar `/media/<bucket>/<fayl>` orqali; `certificates` yopiq |
| Parolni e-pochta orqali tiklash | yo'q (pochta serveri yo'q): parolni direktor / admin tiklaydi |

Admin panelga kirish server orqali (`POST /api/admin/auth/login`), maktab portaliga kirish avvalgidek.

## O'rnatish (bir marta)

```bash
# 1. baza va foydalanuvchi (postgres superuser sifatida)
sudo -u postgres psql -c "create role maktab_app login password '<PAROL>'"
sudo -u postgres psql -c "create database childrensacademy owner maktab_app"
sudo -u postgres psql -d childrensacademy -v app_user=maktab_app -v ON_ERROR_STOP=1 -f supabase/local/bootstrap.sql
# 2. sxema + boshlang'ich ma'lumot (ilova foydalanuvchisi sifatida, u jadvallar egasi bo'ladi)
psql "postgres://maktab_app:<PAROL>@127.0.0.1:5432/childrensacademy" -v ON_ERROR_STOP=1 -f supabase/schema.sql
```

`.env.local`:
```
DATABASE_URL=postgres://maktab_app:<PAROL>@127.0.0.1:5432/childrensacademy
AUTH_SECRET=<32+ belgi: openssl rand -hex 32>
UPLOAD_DIR=/var/www/childrensacademy.uz-uploads
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOW_ADMIN_DEMO=
```

Keyin build, ishga tushirish va hisoblar:
```bash
npm run build && pm2 restart childrensacademy
npm run accounts:create      # har rol uchun login -> HISOBLAR.local.md
```

**Muhim:** standalone server `.env.local` ni o'zi o'qimaydi. pm2'da `node_args: '--env-file=<yo'l>/.env.local'` bo'lishi shart
(serverdagi `ecosystem.config.cjs` da bor).

## Zaxira nusxa

Baza endi sizning serveringizda, zaxira ham sizning zimmangizda:
```bash
pg_dump "postgres://maktab_app:<PAROL>@127.0.0.1:5432/childrensacademy" -Fc -f /root/backups/childrensacademy-$(date +%F).dump
```
`UPLOAD_DIR` papkasini ham nusxalang.

## Sxema yangilanishi

`supabase/schema.sql` idempotent: yangilangandan keyin shu buyruq bilan qayta ishga tushirish xavfsiz
(`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/schema.sql`), keyin `pm2 restart childrensacademy`
(gateway jadval/funksiya ro'yxatini ishga tushganda o'qiydi).

## Tekshiruv

`tests/localdb.test.ts`: shu rejim PGlite'da haqiqiy sxema bilan, uchidan-uchiga (login, sessiya, ro'yxatdan o'tkazish, parol
almashtirish, RLS, admin CMS, fayl yuklash, RPC, hisob yaratish skripti).
