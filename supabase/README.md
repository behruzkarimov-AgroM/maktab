# Supabase setup (Children's Academy)

Without any Supabase variables the site runs in **DEMO mode** (seed data, localStorage, in-memory leaderboard).
Follow these steps to switch to a real database.

## 1. Create the project
1. https://supabase.com -> New project (region closest to Tashkent, e.g. Frankfurt). Save the DB password.
2. Wait until the project is provisioned.

## 2. Run the SQL
Either:
- **SQL Editor (simplest):** paste the whole of `supabase/schema.sql` and run it. It contains schema, RLS, RPCs, storage
  buckets and demo seed data, and is idempotent (safe to re-run after updates).
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push` (applies `supabase/migrations/*.sql`),
  and run `supabase/seed.sql` for demo content (`supabase db reset` locally does both).

`migrations/0001_init.sql`, `migrations/0002_hardening.sql` and `seed.sql` are generated from `schema.sql`:
`npm run db:split` regenerates them; `npm run db:check` fails if they drift. Edit **schema.sql only**.

Skip the seed in production if you want a clean database (every seed insert uses `ON CONFLICT DO NOTHING`, so it never
overwrites or duplicates rows; re-running it does re-create demo rows that an editor deleted).

### Upgrading an EXISTING database (created from an older 0001)
- **Supabase CLI:** `supabase db push` - applies the new `0002_hardening.sql` (the CLI tracks versions, it never re-runs 0001).
- **SQL Editor:** paste and run `supabase/migrations/0002_hardening.sql`, or simply re-run the whole `schema.sql` (idempotent).
- 0002 is idempotent and non-destructive: new CHECK constraints / foreign keys are added `NOT VALID` (legacy rows are never rejected,
  new and updated rows are), unique indexes that meet legacy duplicates are skipped with a `NOTICE` instead of aborting. Afterwards you can
  clean the data and run `alter table ... validate constraint ...` / re-run the migration to create the skipped unique indexes.
- It changes behaviour in a few places the API must tolerate: see `docs/AUDIT-SCHEMA-REQUESTS.md` (FK RESTRICT on grade history, new trigger errors).
- Future changes: wrap the new statements in `-- @migration 0003 begin` / `-- @migration 0003 end` inside `schema.sql`, register `0003` in
  `MIGRATIONS` of `scripts/db/split.mjs`, run `npm run db:split`. `scripts/db/fixtures/0001_legacy.sql` is a frozen copy of the original 0001 used by
  `db:check` to prove the upgrade path.

## 3. Create the first super admin
1. Authentication -> Users -> **Add user** (email + password, tick "Auto confirm user").
   A `profiles` row (role `student`) is created automatically by a trigger.
2. SQL Editor:
   ```sql
   update public.profiles set role = 'super_admin' where id = (select id from auth.users where email = 'you@school.uz');
   ```
3. Sign in at `/admin/login`. Other staff: create users the same way and set role to `methodist` (content, olympiads,
   quizzes) or `psychologist` (psych tests + read applications). `is_active = false` revokes access immediately.

> Only `super_admin` can change roles; the `protect_profile_privileged_cols` trigger blocks self-promotion.

## 4. Environment variables
Copy `.env.example` to `.env.local` (and set the same in your host, e.g. Vercel):

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings -> API -> Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings -> API -> `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings -> API -> `service_role` key (**secret**, server only) |
| `NEXT_PUBLIC_SITE_URL` | your public domain |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | optional, @BotFather + chat id |

Set URL + anon key together (or leave both empty). Verify with `GET /api/health`
(`{"ok":true,"mode":"supabase","db":"ok"}`; it never prints secrets).

Also set Authentication -> URL Configuration -> Site URL to your domain, and disable "Enable sign ups" if only staff
should have accounts (public visitors never need to sign in).

## 5. What is protected (tested by `npm run db:check`)
- `anon` cannot read: registrations, quiz answers (`academic_questions`), psych option scores, attempts, submissions,
  applications, visits, profiles, `audit_log`, `rate_limits`.
- Public access goes through RPCs: `register_olympiad`, `check_olympiad_result`, `olympiad_leaderboard`, `list_quizzes`,
  `get_quiz_questions`, `submit_quiz_attempt`, `list_psych_tests`, `get_psych_test`, `get_psych_questions`,
  `submit_psych_test`, `get_leaderboard`. RPC failures raise stable codes (`registration_closed`, `grade_not_eligible`,
  `invalid_subject`, `already_registered`, `too_many_registrations`, `invalid_input`, `not_found`).
- Roles: `super_admin` all; `methodist` content + olympiads + quizzes + applications (no delete); `psychologist`
  psych_* + read applications. `audit_log` is readable by `super_admin` only and written with the service role.
- Rate limiting: `rate_limit_hit(key, max, window_seconds)` (service role only, returns TRUE when allowed) backs
  `lib/rate-limit.ts`; falls back to in-memory when the service key is absent.

## 5b. Verification tools
- `npm run db:check` - behaviour of the schema/RLS/RPCs in PGlite.
- `npm run db:refs` - static check that every table/column/enum value/RPC argument the TypeScript code references exists in the schema
  (run it after changing either side; it also compares `lib/supabase/database.types.ts` and `lib/school/types.ts` with the DB).
- `npx vitest run tests/supabase-sim.test.ts` - the SIS backend end to end against this schema (role switching, RLS, RPCs, API routes).
- `npm run smoke` - the same assumptions against a real project; step-by-step Uzbek guide: `docs/SUPABASE-GO-LIVE.md`.

## 6. Maintenance
- Retention: `select public.purge_old_data();` (service role only; defaults: site_visits 400 days, audit_log 730 days,
  notifications 180 days, quiz attempts + psych submissions 730 days (pass `p_attempt_days => null` to keep them), expired rate-limit windows;
  at most `p_batch` = 20000 rows per table per call, so a daily schedule drains any backlog). Migration 0002 schedules it daily at 03:17
  automatically when the `pg_cron` extension is enabled (Dashboard -> Database -> Extensions); otherwise call it from any scheduler:
  `select cron.schedule('maktab-purge-old-data', '17 3 * * *', 'select public.purge_old_data()');`
- Privileges: the authoritative table GRANT matrix and function EXECUTE matrix are at the end of `schema.sql` ("HARDENING"); every function pins
  `search_path = public, pg_temp`; every public table has RLS enabled (not FORCEd on purpose: SECURITY DEFINER RPCs run as owner and are the only
  writers of attempts / rate_limits / audit_log; service_role bypasses RLS). `db:check` asserts all of this against `pg_catalog`.
- Storage buckets `school-media`, `test-assets`, `certificates` are public-read, staff-write, 8 MB limit.
- Local validation without a Supabase account: `npm run db:check` (PGlite, ~5 s).
- Types: `lib/supabase/database.types.ts` is maintained by hand; update it when the schema changes
  (or replace it with `supabase gen types typescript --project-id <ref>`).