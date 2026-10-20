-- 0003_telegram_bot: Telegram account links + one-time link codes (server / service role only).
-- Generated from supabase/schema.sql by scripts/db/split.mjs (regions marked "@migration 0003"). Idempotent: safe to re-run.

-- ---- Telegram bot: account links (chat -> portal user) and one-time link codes ----
-- Written and read ONLY by the server (service role): RLS on, no policies, no grants for anon / authenticated.
-- A user opens the portal, asks for a code (hash stored, 10 min, single use), the bot redeems it for its chat id.
create table if not exists public.telegram_links (
  chat_id text primary key check (chat_id ~ '^-?[0-9]{4,20}$'),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text check (username is null or char_length(username) <= 64),
  created_at timestamptz not null default now()
);
create table if not exists public.telegram_link_codes (
  code_hash text primary key check (char_length(code_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists telegram_link_codes_user_idx on public.telegram_link_codes(user_id);
alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_links, public.telegram_link_codes from public, anon, authenticated;
grant all on public.telegram_links, public.telegram_link_codes to service_role;

