-- Self-hosted PostgreSQL (no Supabase): the pieces of Supabase that supabase/schema.sql relies on.
-- Run ONCE per database, as a superuser, BEFORE schema.sql:
--   psql "$DATABASE_URL_ADMIN" -v app_user=maktab_app -f supabase/local/bootstrap.sql
-- Then, as the app user (the owner of the tables): schema.sql, seed.sql.
-- Never run this on a Supabase project (it has its own auth / storage schemas).

do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;

-- the application's login role switches to these roles per request (SET LOCAL ROLE), like PostgREST
grant anon, authenticated, service_role to :"app_user";

create schema if not exists auth authorization :"app_user";
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  -- scrypt hash written by lib/localdb/gateway.ts (never readable by anon / authenticated)
  encrypted_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table auth.users owner to :"app_user";
create unique index if not exists users_email_lower_uq on auth.users (lower(email));

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;
alter function auth.uid() owner to :"app_user";
alter function auth.role() owner to :"app_user";
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- the users table itself stays private to the app user (passwords); schema.sql only references it by foreign key / trigger

-- storage: bucket rows from schema.sql are kept for reference; files live on disk (UPLOAD_DIR)
create schema if not exists storage authorization :"app_user";
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.buckets owner to :"app_user";
alter table storage.objects owner to :"app_user";
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;

-- objects created later by the app user (schema.sql) must be usable by the request roles exactly as on Supabase
grant usage, create on schema public to :"app_user";
grant usage on schema public to anon, authenticated, service_role;
