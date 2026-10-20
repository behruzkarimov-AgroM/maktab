-- 0004_phone_codes: phones shared with the Telegram bot + one-time codes sent through it (server / service role only).
-- Generated from supabase/schema.sql by scripts/db/split.mjs (regions marked "@migration 0004"). Idempotent: safe to re-run.

-- ---- Phone verification through the Telegram bot (instead of SMS) ----
-- telegram_phones: the phone number a Telegram user shared with the bot (Telegram only lets a user share their OWN contact).
-- phone_codes: one-time 6-digit codes the site sends to that chat (sign-in by phone, self-registration, form verification).
-- Server (service role) only: RLS on, no policies, no grants for anon / authenticated.
create table if not exists public.telegram_phones (
  chat_id text primary key check (chat_id ~ '^-?[0-9]{4,20}$'),
  phone text not null unique check (phone ~ '^\+[0-9]{9,15}$'),
  updated_at timestamptz not null default now()
);
create table if not exists public.phone_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^\+[0-9]{9,15}$'),
  purpose text not null check (purpose in ('login', 'signup', 'verify')),
  code_hash text not null check (char_length(code_hash) = 64),
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists phone_codes_lookup_idx on public.phone_codes(phone, purpose, created_at desc);
alter table public.telegram_phones enable row level security;
alter table public.phone_codes enable row level security;
revoke all on public.telegram_phones, public.phone_codes from public, anon, authenticated;
grant all on public.telegram_phones, public.phone_codes to service_role;

