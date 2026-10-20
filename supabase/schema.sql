-- =====================================================================
-- Children''s Academy - Supabase / PostgreSQL schema (idempotent, re-runnable)
-- Run in the Supabase SQL editor. Owner: agent "core".
--
-- Conventions
--   * JSONB (L) columns hold {"uz": "...", "ru": "...", "en": "..."}.
--   * UUID PKs use gen_random_uuid() (built in; same effect as uuid_generate_v4()).
--   * Public (anon) clients can NEVER read: olympiad_registrations, academic_questions,
--     psych_questions, quiz attempts, psych submissions, applications, site_visits.
--     They use the SECURITY DEFINER RPCs defined below.
--
-- Bootstrap the first admin after signing up in Supabase Auth:
--   update public.profiles set role = 'super_admin' where id = '<auth user uuid>';
--
-- RPC summary (all callable by anon + authenticated):
--   register_olympiad(...)          -> jsonb pass data (ticket, qr payload, olympiad info)
--   check_olympiad_result(ticket)   -> jsonb | null (score only when results are published)
--   get_quiz_questions(quiz_id)     -> jsonb array WITHOUT correct answers
--   submit_quiz_attempt(...)        -> jsonb {score_percent, correct, total, passed, results[]}
--   get_psych_questions(test_id)    -> jsonb array WITHOUT option scores
--   submit_psych_test(...)          -> jsonb {total_score, max_score, scale{...}}
-- RPC errors are raised as exceptions whose message is a stable code, e.g.
--   registration_closed, grade_not_eligible, invalid_subject, already_registered,
--   invalid_input, not_found.
-- =====================================================================

-- gen_random_uuid() is built into PostgreSQL 13+ (no extension required).

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('super_admin','methodist','psychologist','teacher','student','school_admin','parent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.grade_category as enum ('primary','middle','high');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.difficulty_level as enum ('easy','medium','hard');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.registration_status as enum ('pending','confirmed','attended','disqualified');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.application_status as enum ('new','contacted','interview_scheduled','accepted','rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'student',
  phone text,
  avatar_url text,
  grade int check (grade between 1 and 11),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- SIS: accounts provisioned by a director get a temporary password; the portal forces a change at first login.
-- (guarded by protect_profile_privileged_cols(): users cannot clear it through PostgREST, only the API/service role can)
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Role helpers (SECURITY DEFINER, fixed search_path). Created after profiles.
create or replace function public.has_role(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role::text = any (p_roles)
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_role('super_admin','methodist','psychologist');
$$;

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  school_name jsonb not null default '{}'::jsonb,
  hero_title jsonb not null default '{}'::jsonb,
  hero_subtitle jsonb not null default '{}'::jsonb,
  hero_video_url text,
  hero_image_url text,
  about_mission jsonb not null default '{}'::jsonb,
  about_vision jsonb not null default '{}'::jsonb,
  about_history jsonb not null default '{}'::jsonb,
  stats jsonb not null default '[]'::jsonb,
  address jsonb not null default '{}'::jsonb,
  landmark jsonb not null default '{}'::jsonb,
  phones text[] not null default '{}',
  email text,
  working_hours jsonb not null default '{}'::jsonb,
  map_lat double precision,
  map_lng double precision,
  map_embed_url text,
  social_links jsonb not null default '{}'::jsonb,
  virtual_tour_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  category public.grade_category not null,
  grade_range text not null default '',
  title jsonb not null default '{}'::jsonb,
  short_description jsonb not null default '{}'::jsonb,
  full_content jsonb not null default '{}'::jsonb,
  subjects jsonb not null default '[]'::jsonb,   -- [{key, name L}]
  icon_name text,
  cover_image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campus_life (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,             -- kitchen, security, transport, schedule
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  gallery_urls text[] not null default '{}',
  extra_data jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  is_administration boolean not null default false,
  full_name jsonb not null default '{}'::jsonb,
  position jsonb not null default '{}'::jsonb,
  subject_key text,
  bio jsonb not null default '{}'::jsonb,
  experience_years int check (experience_years is null or experience_years between 0 and 80),
  certificates text[] not null default '{}',
  photo_url text,
  intro_video_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_achievements (
  id uuid primary key default gen_random_uuid(),
  student_name jsonb not null default '{}'::jsonb,
  grade_or_grad_year text,
  achievement_title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  university_accepted jsonb,
  photo_url text,
  certificate_url text,
  category text not null default 'olympiad' check (category in ('olympiad','sport','art','graduate')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.olympiads (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  rules jsonb,
  subjects jsonb not null default '[]'::jsonb,   -- [{key, name L}]
  eligible_grades int[] not null default '{1,2,3,4,5,6,7,8,9,10,11}',
  event_date timestamptz not null,
  registration_deadline timestamptz not null,
  location jsonb not null default '{}'::jsonb,
  cover_image_url text,
  is_registration_open boolean not null default true,
  is_results_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.olympiad_registrations (
  id uuid primary key default gen_random_uuid(),
  olympiad_id uuid not null references public.olympiads(id) on delete cascade,
  ticket_number text not null unique,
  student_full_name text not null check (char_length(student_full_name) between 2 and 120),
  birth_date date not null,
  current_school text not null check (char_length(current_school) between 1 and 160),
  grade int not null check (grade between 1 and 11),
  subject_key text not null check (char_length(subject_key) between 1 and 60),
  parent_phone text not null check (char_length(parent_phone) between 5 and 30),
  extra_phone text check (extra_phone is null or char_length(extra_phone) between 5 and 30),
  qr_code_payload text,
  status public.registration_status not null default 'pending',
  score numeric check (score is null or score >= 0),
  max_score numeric not null default 100 check (max_score > 0),
  rank_place int check (rank_place is null or rank_place > 0),
  certificate_pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint olympiad_ticket_format check (ticket_number ~ '^OLY-[0-9]{4}-([0-9]{6}|[0-9A-F]{10})$')
);
create index if not exists olympiad_registrations_olympiad_idx on public.olympiad_registrations(olympiad_id);
create unique index if not exists olympiad_registrations_dedupe
  on public.olympiad_registrations (olympiad_id, lower(student_full_name), birth_date, subject_key);

create table if not exists public.academic_quizzes (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null default '{}'::jsonb,
  description jsonb,
  subject_key text not null,
  subject_name jsonb not null default '{}'::jsonb,
  grade int not null check (grade between 1 and 11),
  difficulty public.difficulty_level not null default 'medium',
  duration_minutes int not null default 15 check (duration_minutes between 1 and 240),
  passing_score_percent int not null default 60 check (passing_score_percent between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academic_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.academic_quizzes(id) on delete cascade,
  question_text jsonb not null default '{}'::jsonb,
  question_image_url text,
  options jsonb not null default '[]'::jsonb,    -- [{id:"A", text L}]
  correct_option_id text not null,
  explanation jsonb,
  points int not null default 1 check (points > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academic_questions_quiz_idx on public.academic_questions(quiz_id, sort_order);

create table if not exists public.academic_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.academic_quizzes(id) on delete cascade,
  student_name text not null check (char_length(student_name) between 1 and 120),
  student_grade int check (student_grade is null or student_grade between 1 and 11),
  parent_phone text check (parent_phone is null or char_length(parent_phone) <= 30),
  total_questions int not null default 0,
  correct_answers int not null default 0,
  score_percent numeric not null default 0 check (score_percent between 0 and 100),
  time_spent_seconds int check (time_spent_seconds is null or time_spent_seconds between 0 and 86400),
  answers_log jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists academic_quiz_attempts_quiz_idx on public.academic_quiz_attempts(quiz_id, created_at desc);

create table if not exists public.psych_tests (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  instruction jsonb not null default '{}'::jsonb,
  target_audience text not null default 'kids',
  topic text,
  cover_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.psych_questions (
  id uuid primary key default gen_random_uuid(),
  psych_test_id uuid not null references public.psych_tests(id) on delete cascade,
  question_text jsonb not null default '{}'::jsonb,
  question_image_url text,
  options jsonb not null default '[]'::jsonb,    -- [{id, text L, score}]
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists psych_questions_test_idx on public.psych_questions(psych_test_id, sort_order);

create table if not exists public.psych_result_scales (
  id uuid primary key default gen_random_uuid(),
  psych_test_id uuid not null references public.psych_tests(id) on delete cascade,
  min_score numeric not null,
  max_score numeric not null,
  result_title jsonb not null default '{}'::jsonb,
  psychological_analysis jsonb not null default '{}'::jsonb,
  recommendations_for_parents jsonb not null default '{}'::jsonb,
  badge_color text not null default '#22c55e',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psych_scale_range check (min_score <= max_score)
);
create index if not exists psych_result_scales_test_idx on public.psych_result_scales(psych_test_id, min_score);

create table if not exists public.psych_test_submissions (
  id uuid primary key default gen_random_uuid(),
  psych_test_id uuid not null references public.psych_tests(id) on delete cascade,
  student_name text not null check (char_length(student_name) between 1 and 120),
  student_age int check (student_age is null or student_age between 3 and 99),
  parent_phone text check (parent_phone is null or char_length(parent_phone) <= 30),
  total_score numeric not null default 0,
  matched_scale_id uuid references public.psych_result_scales(id) on delete set null,
  answers_log jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists psych_test_submissions_test_idx on public.psych_test_submissions(psych_test_id, created_at desc);

create table if not exists public.brain_games (
  id uuid primary key default gen_random_uuid(),
  game_slug text not null unique,                -- schulte-table, memory-matrix, mental-math, stroop-test, logic-seq
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  how_to_play jsonb not null default '{}'::jsonb,
  cognitive_skill jsonb not null default '{}'::jsonb,
  icon_name text,
  config jsonb not null default '{}'::jsonb,     -- {easy|medium|hard: {grid, time_limit, multiplier}}
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_leaderboard (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.brain_games(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 40),
  student_grade int check (student_grade is null or student_grade between 1 and 11),
  difficulty public.difficulty_level not null default 'easy',
  score int not null check (score between 0 and 1000000),
  completion_time_ms int check (completion_time_ms is null or completion_time_ms between 0 and 3600000),
  accuracy_percent numeric check (accuracy_percent is null or accuracy_percent between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists game_leaderboard_idx on public.game_leaderboard(game_id, difficulty, score desc);

create table if not exists public.admission_applications (
  id uuid primary key default gen_random_uuid(),
  application_type text not null default 'admission' check (application_type in ('admission','campus_tour','callback')),
  parent_name text not null check (char_length(parent_name) between 1 and 120),
  child_name text check (child_name is null or char_length(child_name) <= 120),
  target_grade int check (target_grade is null or target_grade between 0 and 11),
  phone text not null check (char_length(phone) between 5 and 30),
  preferred_language text check (preferred_language is null or preferred_language in ('uz','ru','en')),
  message text check (message is null or char_length(message) <= 2000),
  status public.application_status not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admission_applications_status_idx on public.admission_applications(status, created_at desc);

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  path text not null check (char_length(path) between 1 and 300),
  locale text check (locale is null or locale in ('uz','ru','en')),
  created_at timestamptz not null default now()
);
create index if not exists site_visits_created_idx on public.site_visits(created_at desc);

-- ---------------------------------------------------------------------
-- Hardening constraints / extra tables / indexes (idempotent).
-- Constraints are added NOT VALID so re-running on a populated database never
-- fails on legacy rows, but they are still enforced for every new/updated row.
-- ---------------------------------------------------------------------
-- psych_tests: audience + topic vocabularies (migrates legacy free-text values)
alter table public.psych_tests add column if not exists topic text;
alter table public.psych_tests alter column target_audience set default 'kids';
update public.psych_tests set target_audience = 'kids'
  where target_audience is null or target_audience not in ('kids','teens','older','parents');
alter table public.psych_tests drop constraint if exists psych_tests_audience_chk;
alter table public.psych_tests add constraint psych_tests_audience_chk
  check (target_audience in ('kids','teens','older','parents'));
alter table public.psych_tests drop constraint if exists psych_tests_topic_chk;
alter table public.psych_tests add constraint psych_tests_topic_chk
  check (topic is null or topic in ('interests','temperament','career','readiness','emotional'));

-- game_leaderboard: sane public input
alter table public.game_leaderboard drop constraint if exists game_leaderboard_input_chk;
alter table public.game_leaderboard add constraint game_leaderboard_input_chk check (
  char_length(btrim(player_name)) between 1 and 40
  and player_name !~ '[<>{}[:cntrl:]]'
  and (completion_time_ms is null or completion_time_ms >= 100)
) not valid;

-- admission_applications: sane public input
alter table public.admission_applications drop constraint if exists admission_applications_input_chk;
alter table public.admission_applications add constraint admission_applications_input_chk check (
  char_length(btrim(parent_name)) between 1 and 120
  and phone ~ '^\+?[0-9 ()-]{5,30}$'
  and (admin_notes is null or char_length(admin_notes) <= 4000)
) not valid;

-- Bound the size of client-supplied JSON stored by the public RPCs
alter table public.academic_quiz_attempts drop constraint if exists academic_quiz_attempts_log_size_chk;
alter table public.academic_quiz_attempts add constraint academic_quiz_attempts_log_size_chk
  check (octet_length(answers_log::text) <= 20000) not valid;
alter table public.psych_test_submissions drop constraint if exists psych_test_submissions_log_size_chk;
alter table public.psych_test_submissions add constraint psych_test_submissions_log_size_chk
  check (octet_length(answers_log::text) <= 20000) not valid;

-- Audit log: written by trusted server code (service role) only; super_admin may read.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  user_email text check (user_email is null or char_length(user_email) <= 320),
  action text not null check (char_length(action) between 1 and 60),
  resource text not null check (char_length(resource) between 1 and 80),
  record_id text check (record_id is null or char_length(record_id) <= 80),
  diff jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_resource_idx on public.audit_log(resource, created_at desc);
create index if not exists audit_log_user_idx on public.audit_log(user_id, created_at desc);

-- Fixed-window rate limiter storage (accessed only through rate_limit_hit()).
create table if not exists public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits int not null default 0,
  constraint rate_limits_pkey primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits(window_start);

-- Indexes for common queries
create index if not exists site_visits_created_path_idx on public.site_visits(created_at, path);
create index if not exists admission_applications_created_idx on public.admission_applications(created_at desc);
create index if not exists olympiad_registrations_olympiad_status_idx on public.olympiad_registrations(olympiad_id, status);
create index if not exists olympiad_registrations_phone_idx on public.olympiad_registrations(olympiad_id, parent_phone);
create index if not exists olympiad_registrations_rank_idx on public.olympiad_registrations(olympiad_id, subject_key, rank_place)
  where rank_place is not null;
create index if not exists academic_quizzes_active_idx on public.academic_quizzes(is_active, grade);
create index if not exists academic_quiz_attempts_created_idx on public.academic_quiz_attempts(created_at desc);
create index if not exists psych_tests_active_idx on public.psych_tests(is_active, target_audience);
create index if not exists psych_test_submissions_created_idx on public.psych_test_submissions(created_at desc);
create index if not exists programs_order_idx on public.programs(is_active, sort_order);
create index if not exists staff_members_order_idx on public.staff_members(is_active, is_administration, sort_order);
create index if not exists student_achievements_order_idx on public.student_achievements(is_active, category, sort_order);
create index if not exists campus_life_order_idx on public.campus_life(is_active, sort_order);
create index if not exists brain_games_order_idx on public.brain_games(is_active, sort_order);
create index if not exists game_leaderboard_created_idx on public.game_leaderboard(created_at desc);
create index if not exists olympiads_event_idx on public.olympiads(event_date);
-- ---------------------------------------------------------------------
-- updated_at triggers on every table that has the column
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
      and c.table_name in (select table_name from information_schema.tables
                           where table_schema='public' and table_type='BASE TABLE')
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Profile triggers
-- ---------------------------------------------------------------------
-- @migration 0002 begin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- the role is ALWAYS 'student' here; the name comes from user-controlled metadata, so bound it
  insert into public.profiles (id, full_name, role)
  values (new.id, left(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), 120), 'student')
  on conflict (id) do nothing;
  return new;
end $$;
-- @migration 0002 end

do $$ begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();
exception when insufficient_privilege then
  raise notice 'Could not create auth.users trigger; create it manually from the dashboard.';
end $$;

-- Non super_admins cannot change role / is_active / must_change_password (also on their own row).
create or replace function public.protect_profile_privileged_cols()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or new.must_change_password is distinct from old.must_change_password)
     and coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is not null
     and not public.has_role('super_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_protect on public.profiles;
create trigger trg_profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_privileged_cols();

-- ---------------------------------------------------------------------
-- Ticket generator (loops until unique)
-- ---------------------------------------------------------------------
-- @migration 0002 begin
-- SECURITY DEFINER: the uniqueness probe must see every registration even when the inserting
-- staff user is filtered by RLS, and authenticated has no EXECUTE on the generator.
create or replace function public.generate_olympiad_ticket()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ticket text;
begin
  loop
    -- 10 hex chars (40 bits) from gen_random_uuid() (CSPRNG); the old 6-digit random() format was enumerable.
    v_ticket := 'OLY-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.olympiad_registrations where ticket_number = v_ticket);
  end loop;
  return v_ticket;
end $$;

create or replace function public.olympiad_registration_before_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := public.generate_olympiad_ticket();
  end if;
  if new.qr_code_payload is null or new.qr_code_payload = '' then
    new.qr_code_payload := new.ticket_number;
  end if;
  return new;
end $$;
-- @migration 0002 end
drop trigger if exists trg_olympiad_ticket on public.olympiad_registrations;
create trigger trg_olympiad_ticket before insert on public.olympiad_registrations
  for each row execute function public.olympiad_registration_before_insert();
-- ticket_number is NOT NULL but filled by the trigger; allow insert without it:
alter table public.olympiad_registrations alter column ticket_number set default '';
alter table public.olympiad_registrations drop constraint if exists olympiad_ticket_format;
alter table public.olympiad_registrations add constraint olympiad_ticket_format
  check (ticket_number ~ '^OLY-[0-9]{4}-([0-9]{6}|[0-9A-F]{10})$');

-- =====================================================================
-- RLS policies
-- =====================================================================
-- @migration 0002 begin
-- Helper: standard "public read + role-restricted write" policy pair.
--  * read_expr 'true' / 'is_active' (public content) -> anon + authenticated; anything else (role checks) -> authenticated only
--  * function-call expressions are wrapped in (select ...) so Postgres evaluates them ONCE per statement (initPlan)
--    instead of once per row
create or replace function public._mk_policies(t text, read_expr text, write_expr text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_read text := case when read_expr in ('true', 'is_active') then read_expr else '(select ' || read_expr || ')' end;
  v_write text := '(select ' || write_expr || ')';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_read', t);
  execute format('drop policy if exists %I on public.%I', t || '_write', t);
  if read_expr is not null then
    execute format('create policy %I on public.%I for select to %s using (%s)',
                   t || '_read', t, case when read_expr in ('true', 'is_active') then 'anon, authenticated' else 'authenticated' end, v_read);
  end if;
  if write_expr is not null then
    execute format('create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
                   t || '_write', t, v_write, v_write);
  end if;
end $$;

-- Content editors: super_admin + methodist. Psych: super_admin + psychologist.
select public._mk_policies('site_settings',        'true',      $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('programs',             'is_active', $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('campus_life',          'is_active', $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('staff_members',        'is_active', $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('student_achievements', 'is_active', $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('olympiads',            'true',      $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('academic_quizzes',     'is_active', $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('psych_tests',          'is_active', $e$public.has_role('super_admin','psychologist')$e$);
select public._mk_policies('psych_result_scales',  null,        $e$public.has_role('super_admin','psychologist')$e$);
select public._mk_policies('brain_games',          'is_active', $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('game_leaderboard',     'true',      $e$public.has_role('super_admin','methodist')$e$);

-- No public read: only staff of the right role.
select public._mk_policies('olympiad_registrations',  null, $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('academic_questions',      null, $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('academic_quiz_attempts',  null, $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('psych_questions',         null, $e$public.has_role('super_admin','psychologist')$e$);
select public._mk_policies('psych_test_submissions',  null, $e$public.has_role('super_admin','psychologist')$e$);
select public._mk_policies('site_visits',             null, $e$public.has_role('super_admin','methodist')$e$);
-- Applications: all three staff roles can read; super_admin + methodist manage.
select public._mk_policies('admission_applications',  $e$public.is_admin()$e$, $e$public.has_role('super_admin','methodist')$e$);

-- audit_log: super_admin may read; nobody but service_role (bypasses RLS) can write.
select public._mk_policies('audit_log', $e$public.has_role('super_admin')$e$, null);
-- rate_limits: RLS on, no policies -> only SECURITY DEFINER code / service_role touch it.
select public._mk_policies('rate_limits', null, null);

-- Public writes (game scores, admission applications, page views) are NOT possible with the public
-- anon key: the policies below were removed because a direct PostgREST insert bypassed the API
-- routes' rate limits, bot traps, signed game sessions and validation. The Next.js routes
-- (/api/games/leaderboard, /api/applications, /api/visit) insert with the service role instead.
-- (psych_result_scales has no public read policy on purpose: the scoring RPC returns the matched scale.)
drop policy if exists game_leaderboard_insert on public.game_leaderboard;
drop policy if exists admission_applications_insert on public.admission_applications;
drop policy if exists site_visits_insert on public.site_visits;

-- Staff may delete applications only as super_admin (extra restriction on top of "write").
-- (methodist can update status/notes; the generic policy also lets them delete - tighten:)
drop policy if exists admission_applications_write on public.admission_applications;
drop policy if exists admission_applications_update on public.admission_applications;
create policy admission_applications_update on public.admission_applications
  for update to authenticated
  using ((select public.has_role('super_admin','methodist'))) with check ((select public.has_role('super_admin','methodist')));
drop policy if exists admission_applications_delete on public.admission_applications;
create policy admission_applications_delete on public.admission_applications
  for delete to authenticated using ((select public.has_role('super_admin')));

-- Profiles. Users may edit their own harmless columns; role / is_active / must_change_password are
-- additionally frozen for non-super_admins by trg_profiles_protect (protect_profile_privileged_cols).
alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_role('super_admin')));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
  using ((select public.has_role('super_admin'))) with check ((select public.has_role('super_admin')));
-- @migration 0002 end

-- Table privileges: clean slate here (Supabase default privileges hand anon/authenticated ALL on new tables).
-- The authoritative per-table GRANT matrix and the per-function EXECUTE matrix live in the
-- "HARDENING" section at the end of this file (also shipped as migration 0002_hardening.sql).
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- =====================================================================
-- RPC functions
-- =====================================================================

-- ---- Olympiad: register ---------------------------------------------
-- @migration 0002 begin
create or replace function public.register_olympiad(
  p_olympiad_id uuid,
  p_student_full_name text,
  p_birth_date date,
  p_current_school text,
  p_grade int,
  p_subject_key text,
  p_parent_phone text,
  p_extra_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.olympiads%rowtype;
  r public.olympiad_registrations%rowtype;
  v_tries int := 0;
  v_constraint text;
begin
  if p_student_full_name is null or char_length(trim(p_student_full_name)) not between 2 and 120
     or p_current_school is null or char_length(trim(p_current_school)) not between 1 and 160
     or p_parent_phone is null or char_length(trim(p_parent_phone)) not between 5 and 30
     or (p_extra_phone is not null and char_length(trim(p_extra_phone)) not between 5 and 30)
     or p_birth_date is null or p_birth_date > current_date or p_birth_date < date '1990-01-01'
     or p_grade is null or p_grade not between 1 and 11
     or p_subject_key is null or char_length(p_subject_key) not between 1 and 60 then
    raise exception 'invalid_input';
  end if;

  select * into o from public.olympiads where id = p_olympiad_id;
  if not found then raise exception 'not_found'; end if;
  if not o.is_registration_open or now() > o.registration_deadline then
    raise exception 'registration_closed';
  end if;
  if not (p_grade = any (o.eligible_grades)) then
    raise exception 'grade_not_eligible';
  end if;
  if jsonb_array_length(o.subjects) > 0
     and not exists (select 1 from jsonb_array_elements(o.subjects) s where s->>'key' = p_subject_key) then
    raise exception 'invalid_subject';
  end if;
  if exists (select 1 from public.olympiad_registrations x
             where x.olympiad_id = p_olympiad_id and lower(x.student_full_name) = lower(trim(p_student_full_name))
               and x.birth_date = p_birth_date and x.subject_key = p_subject_key) then
    raise exception 'already_registered';
  end if;
  -- Abuse guards. Serialise per phone so concurrent requests cannot slip past the caps.
  perform pg_advisory_xact_lock(hashtext('oly_phone:' || trim(p_parent_phone)));
  -- (1) one phone number cannot flood a single olympiad
  if (select count(*) from public.olympiad_registrations x
      where x.olympiad_id = p_olympiad_id and x.parent_phone = trim(p_parent_phone)) >= 12 then
    raise exception 'too_many_registrations';
  end if;
  -- (2) per-phone daily cap across ALL olympiads (limits SMS/ticket spam to a victim's number)
  if (select count(*) from public.olympiad_registrations x
      where x.parent_phone = trim(p_parent_phone) and x.created_at > now() - interval '24 hours') >= 8 then
    raise exception 'too_many_registrations';
  end if;

  loop
    begin
      insert into public.olympiad_registrations
        (olympiad_id, ticket_number, student_full_name, birth_date, current_school, grade,
         subject_key, parent_phone, extra_phone)
      values
        (p_olympiad_id, '', trim(p_student_full_name), p_birth_date, trim(p_current_school), p_grade,
         p_subject_key, trim(p_parent_phone), nullif(trim(coalesce(p_extra_phone, '')), ''))
      returning * into r;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      -- A concurrent identical registration won the race: report it as a duplicate.
      if v_constraint = 'olympiad_registrations_dedupe' then raise exception 'already_registered'; end if;
      v_tries := v_tries + 1;
      if v_tries >= 8 then raise exception 'ticket_generation_failed'; end if;
    end;
  end loop;

  return jsonb_build_object(
    'ticket_number', r.ticket_number,
    'qr_code_payload', r.qr_code_payload,
    'student_full_name', r.student_full_name,
    'birth_date', r.birth_date,
    'current_school', r.current_school,
    'grade', r.grade,
    'subject_key', r.subject_key,
    'status', r.status,
    'created_at', r.created_at,
    'olympiad', jsonb_build_object(
      'id', o.id, 'title', o.title, 'event_date', o.event_date, 'location', o.location)
  );
end $$;
-- @migration 0002 end

-- "Karimov Bobur" -> "Karimov B." (public output never carries full names of minors)
create or replace function public._short_name(p_name text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when array_length(p, 1) is null then ''
              when array_length(p, 1) = 1 then p[1]
              else p[1] || ' ' || upper(left(p[2], 1)) || '.' end
  from (select regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+') as p) s;
$$;

-- ---- Olympiad: check result by ticket --------------------------------
-- NOT executable by anon/authenticated: called by the rate-limited Next.js route with the service role.
create or replace function public.check_olympiad_result(p_ticket text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if p_ticket is null or char_length(p_ticket) > 40 then return null; end if;
  select reg.ticket_number, reg.student_full_name, reg.subject_key, reg.grade, reg.status,
         reg.score, reg.max_score, reg.rank_place, o.title as olympiad_title, o.is_results_published
    into r
  from public.olympiad_registrations reg
  join public.olympiads o on o.id = reg.olympiad_id
  where reg.ticket_number = upper(trim(p_ticket));
  -- Unknown ticket and unpublished results are indistinguishable (null): no ticket/name enumeration.
  if not found or not r.is_results_published or r.score is null then return null; end if;
  return jsonb_build_object(
    'ticket_number', r.ticket_number,
    'student_full_name', public._short_name(r.student_full_name),
    'subject_key', r.subject_key,
    'grade', r.grade,
    'status', r.status,
    'olympiad_title', r.olympiad_title,
    'results_published', true,
    'score',      r.score,
    'max_score',  r.max_score,
    'rank_place', r.rank_place
  );
end $$;

-- ---- Quiz: questions without answers ---------------------------------
create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'question_text', q.question_text,
           'question_image_url', q.question_image_url,
           'options', q.options,
           'points', q.points,
           'sort_order', q.sort_order) order by q.sort_order, q.created_at), '[]'::jsonb)
  from public.academic_questions q
  join public.academic_quizzes z on z.id = q.quiz_id and z.is_active
  where q.quiz_id = p_quiz_id;
$$;

-- ---- Quiz: score on the server ---------------------------------------
-- p_answers: {"<question_id>": "<option_id>", ...}
create or replace function public.submit_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb,
  p_student_name text,
  p_student_grade int default null,
  p_parent_phone text default null,
  p_time_spent_seconds int default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  z public.academic_quizzes%rowtype;
  q record;
  v_total int := 0;
  v_correct int := 0;
  v_points_total int := 0;
  v_points_earned int := 0;
  v_pct numeric;
  v_results jsonb := '[]'::jsonb;
  v_sel text;
  v_ok boolean;
begin
  if p_student_name is null or char_length(trim(p_student_name)) not between 1 and 120
     or p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 20000
     or (p_student_grade is not null and p_student_grade not between 1 and 11)
     or (p_parent_phone is not null and char_length(p_parent_phone) > 30) then
    raise exception 'invalid_input';
  end if;
  select * into z from public.academic_quizzes where id = p_quiz_id and is_active;
  if not found then raise exception 'not_found'; end if;

  for q in select * from public.academic_questions where quiz_id = p_quiz_id order by sort_order, created_at loop
    v_total := v_total + 1;
    v_points_total := v_points_total + q.points;
    v_sel := p_answers ->> q.id::text;
    v_ok := v_sel is not null and v_sel = q.correct_option_id;
    if v_ok then v_correct := v_correct + 1; v_points_earned := v_points_earned + q.points; end if;
    v_results := v_results || jsonb_build_object(
      'question_id', q.id,
      'selected_option_id', v_sel,
      'correct', v_ok,
      'correct_option_id', q.correct_option_id,
      'explanation', q.explanation);
  end loop;
  if v_total = 0 then raise exception 'not_found'; end if;

  -- Integer percent: the stored/returned value is exactly the one `passed` is decided on (no 59.6 -> "60%" but failed).
  v_pct := round(100.0 * v_points_earned / nullif(v_points_total, 0), 0);

  insert into public.academic_quiz_attempts
    (quiz_id, student_name, student_grade, parent_phone, total_questions, correct_answers,
     score_percent, time_spent_seconds, answers_log)
  values
    (p_quiz_id, trim(p_student_name), p_student_grade, nullif(trim(coalesce(p_parent_phone,'')), ''),
     v_total, v_correct, coalesce(v_pct, 0),
     least(greatest(coalesce(p_time_spent_seconds, 0), 0), 86400), p_answers);

  return jsonb_build_object(
    'quiz_id', p_quiz_id,
    'total', v_total,
    'correct', v_correct,
    'score_percent', coalesce(v_pct, 0),
    'passed', coalesce(v_pct, 0) >= z.passing_score_percent,
    'passing_score_percent', z.passing_score_percent,
    'results', v_results);
end $$;

-- ---- Psych: tests + questions WITHOUT option scores ---------------------
create or replace function public._psych_questions_json(p_test_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'question_text', q.question_text,
           'question_image_url', q.question_image_url,
           'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o->>'id', 'text', o->'text')), '[]'::jsonb)
                       from jsonb_array_elements(q.options) o),
           'sort_order', q.sort_order) order by q.sort_order, q.created_at), '[]'::jsonb)
  from public.psych_questions q
  where q.psych_test_id = p_test_id;
$$;

-- Array of questions only (kept for backwards compatibility).
create or replace function public.get_psych_questions(p_test_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when exists (select 1 from public.psych_tests t where t.id = p_test_id and t.is_active)
              then public._psych_questions_json(p_test_id) else '[]'::jsonb end;
$$;

-- One test with its questions: {id,title,description,instruction,target_audience,topic,cover_image_url,questions[]}
create or replace function public.get_psych_test(p_test_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
           'id', t.id, 'title', t.title, 'description', t.description, 'instruction', t.instruction,
           'target_audience', t.target_audience, 'topic', t.topic, 'cover_image_url', t.cover_image_url,
           'questions', public._psych_questions_json(t.id))
  from public.psych_tests t where t.id = p_test_id and t.is_active;
$$;

-- All active tests (with questions, without scores), ordered by creation (bounded: first 100).
-- @migration 0002 begin
create or replace function public.list_psych_tests()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'title', t.title, 'description', t.description, 'instruction', t.instruction,
           'target_audience', t.target_audience, 'topic', t.topic, 'cover_image_url', t.cover_image_url,
           'question_count', (select count(*) from public.psych_questions q where q.psych_test_id = t.id),
           'questions', public._psych_questions_json(t.id)) order by t.created_at, t.id), '[]'::jsonb)
  from (select * from public.psych_tests where is_active order by created_at, id limit 100) t;
$$;
-- @migration 0002 end

-- ---- Psych: scoring ---------------------------------------------------
-- p_answers: {"<question_id>": "<option_id>", ...}
-- p_student_name is optional (anonymous submissions are stored as 'Anonymous').
create or replace function public.submit_psych_test(
  p_test_id uuid,
  p_answers jsonb,
  p_student_name text default null,
  p_student_age int default null,
  p_parent_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q record;
  t public.psych_tests%rowtype;
  v_total numeric := 0;
  v_max numeric := 0;
  v_opt numeric;
  v_sel text;
  v_name text := coalesce(nullif(trim(coalesce(p_student_name, '')), ''), 'Anonymous');
  v_scale public.psych_result_scales%rowtype;
  v_n int := 0;
begin
  if char_length(v_name) > 120
     or p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 20000
     or (p_student_age is not null and p_student_age not between 3 and 99)
     or (p_parent_phone is not null and char_length(p_parent_phone) > 30) then
    raise exception 'invalid_input';
  end if;
  select * into t from public.psych_tests where id = p_test_id and is_active;
  if not found then raise exception 'not_found'; end if;

  for q in select * from public.psych_questions where psych_test_id = p_test_id loop
    v_n := v_n + 1;
    v_sel := p_answers ->> q.id::text;
    select coalesce(max((o->>'score')::numeric), 0) into v_opt from jsonb_array_elements(q.options) o;
    v_max := v_max + coalesce(v_opt, 0);
    -- every question needs a valid option: a partial/garbage submission must not score as "low"
    if v_sel is null or not exists (select 1 from jsonb_array_elements(q.options) o where o->>'id' = v_sel) then
      raise exception 'incomplete_answers';
    end if;
    select coalesce((o->>'score')::numeric, 0) into v_opt
    from jsonb_array_elements(q.options) o where o->>'id' = v_sel limit 1;
    v_total := v_total + coalesce(v_opt, 0);
  end loop;
  if v_n = 0 then raise exception 'not_found'; end if;

  -- Exact range first; if the admin-defined scales have a gap, fall back to the nearest scale.
  select * into v_scale from public.psych_result_scales
   where psych_test_id = p_test_id
   order by greatest(min_score - v_total, v_total - max_score, 0), min_score
   limit 1;
  if v_scale.id is null then raise exception 'no_matching_scale'; end if;

  insert into public.psych_test_submissions
    (psych_test_id, student_name, student_age, parent_phone, total_score, matched_scale_id, answers_log)
  values
    (p_test_id, v_name, p_student_age, nullif(trim(coalesce(p_parent_phone,'')), ''),
     v_total, v_scale.id, p_answers);

  return jsonb_build_object(
    'total_score', v_total,
    'max_score', v_max,
    'target_audience', t.target_audience,
    'topic', t.topic,
    'scale', case when v_scale.id is null then null else jsonb_build_object(
      'id', v_scale.id,
      'result_title', v_scale.result_title,
      'psychological_analysis', v_scale.psychological_analysis,
      'recommendations_for_parents', v_scale.recommendations_for_parents,
      'badge_color', v_scale.badge_color) end);
end $$;

-- ---- Quizzes: active list with question_count (bounded: first 500 by grade) ----
-- @migration 0002 begin
create or replace function public.list_quizzes()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', z.id, 'title', z.title, 'description', z.description,
           'subject_key', z.subject_key, 'subject_name', z.subject_name, 'grade', z.grade,
           'difficulty', z.difficulty, 'duration_minutes', z.duration_minutes,
           'passing_score_percent', z.passing_score_percent,
           'question_count', (select count(*) from public.academic_questions q where q.quiz_id = z.id)
         ) order by z.grade, z.created_at, z.id), '[]'::jsonb)
  from (select * from public.academic_quizzes where is_active order by grade, created_at, id limit 500) z;
$$;
-- @migration 0002 end

-- ---- Olympiad: public leaderboard (published results only) --------------
-- Returns [{student_full_name, subject_key, score, max_score, rank_place}] (top 200).
-- Names are shortened here ("Karimov B."). NOT executable by anon: called with the service role from the API.
create or replace function public.olympiad_leaderboard(p_olympiad_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_full_name', public._short_name(x.student_full_name), 'subject_key', x.subject_key,
           'score', x.score, 'max_score', x.max_score, 'rank_place', x.rank_place)
         order by x.rank_place, x.score desc), '[]'::jsonb)
  from (
    select r.* from public.olympiad_registrations r
    join public.olympiads o on o.id = r.olympiad_id and o.is_results_published
    where r.olympiad_id = p_olympiad_id and r.rank_place is not null and r.score is not null
      and r.status <> 'disqualified'
    order by r.rank_place, r.score desc limit 200
  ) x;
$$;

-- ---- Rate limiting (fixed window). Returns TRUE when the hit is ALLOWED, FALSE when over the limit.
create or replace function public.rate_limit_hit(key text, max int, window_seconds int)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  v_start timestamptz;
  v_hits int;
begin
  if key is null or char_length(key) not between 1 and 200
     or max is null or max < 1 or window_seconds is null or window_seconds not between 1 and 86400 then
    raise exception 'invalid_input';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.rate_limits as rl (key, window_start, hits)
  values (key, v_start, 1)
  on conflict on constraint rate_limits_pkey do update set hits = rl.hits + 1
  returning rl.hits into v_hits;
  -- opportunistic cleanup of expired windows
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= max;
end $$;

-- ---- Retention: purge old telemetry / personal data. Run daily from pg_cron or a service-role call.
--   site_visits 400 d, audit_log 730 d, notifications 180 d, quiz attempts + psych submissions 730 d
--   (pass NULL for p_attempt_days to keep them forever), rate_limits: expired windows.
--   Every table is trimmed in batches of p_batch rows (default 20000) so one call never holds long locks;
--   the daily schedule catches up with any backlog. Returns the number of rows deleted per table.
-- @migration 0002 begin
drop function if exists public.purge_old_data(int, int);
create or replace function public.purge_old_data(
  p_visit_days int default 400, p_audit_days int default 730,
  p_notification_days int default 180, p_attempt_days int default 730, p_batch int default 20000)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_visits bigint; v_limits bigint; v_audit bigint; v_notes bigint; v_quiz bigint := 0; v_psych bigint := 0;
  v_b int := least(greatest(coalesce(p_batch, 20000), 100), 200000);
begin
  delete from public.site_visits where ctid in (
    select ctid from public.site_visits
    where created_at < now() - make_interval(days => greatest(coalesce(p_visit_days, 400), 30)) limit v_b);
  get diagnostics v_visits = row_count;
  delete from public.rate_limits where ctid in (
    select ctid from public.rate_limits where window_start < now() - interval '1 day' limit v_b);
  get diagnostics v_limits = row_count;
  delete from public.audit_log where id in (
    select id from public.audit_log
    where created_at < now() - make_interval(days => greatest(coalesce(p_audit_days, 730), 90)) limit v_b);
  get diagnostics v_audit = row_count;
  delete from public.notifications where id in (
    select id from public.notifications
    where created_at < now() - make_interval(days => greatest(coalesce(p_notification_days, 180), 30)) limit v_b);
  get diagnostics v_notes = row_count;
  if p_attempt_days is not null then
    delete from public.academic_quiz_attempts where id in (
      select id from public.academic_quiz_attempts
      where created_at < now() - make_interval(days => greatest(p_attempt_days, 90)) limit v_b);
    get diagnostics v_quiz = row_count;
    delete from public.psych_test_submissions where id in (
      select id from public.psych_test_submissions
      where created_at < now() - make_interval(days => greatest(p_attempt_days, 90)) limit v_b);
    get diagnostics v_psych = row_count;
  end if;
  return jsonb_build_object('site_visits', v_visits, 'rate_limits', v_limits, 'audit_log', v_audit,
    'notifications', v_notes, 'quiz_attempts', v_quiz, 'psych_submissions', v_psych);
end $$;
-- @migration 0002 end
-- Leaderboard helper (top N per game/difficulty) - public, read only
create or replace function public.get_leaderboard(p_game_slug text, p_difficulty text default null, p_limit int default 20)
returns setof public.game_leaderboard
language sql stable security definer set search_path = public, pg_temp as $$
  select l.* from public.game_leaderboard l
  join public.brain_games g on g.id = l.game_id and g.is_active
  where g.game_slug = p_game_slug
    and (p_difficulty is null or l.difficulty::text = p_difficulty)
  -- deterministic: score desc, fastest first, earliest first, id
  order by l.score desc, l.completion_time_ms asc nulls last, l.created_at asc, l.id asc
  limit least(greatest(p_limit, 1), 100);
$$;

-- Function privileges: public RPCs are callable by anon + authenticated;
-- internal helpers and maintenance functions only by service_role.
revoke all on all functions in schema public from public, anon, authenticated;
-- register_olympiad / submit_quiz_attempt / submit_psych_test: service_role only. The API routes call them with the service
-- client after rate limit, honeypot and origin checks (direct PostgREST calls with the anon key would bypass those).
-- check_olympiad_result / olympiad_leaderboard: service_role only (see grant at the end of this block).
grant execute on function public.get_quiz_questions(uuid) to anon, authenticated;
grant execute on function public.list_quizzes() to anon, authenticated;
grant execute on function public.get_psych_questions(uuid) to anon, authenticated;
grant execute on function public.get_psych_test(uuid) to anon, authenticated;
grant execute on function public.list_psych_tests() to anon, authenticated;
grant execute on function public.get_leaderboard(text,text,int) to anon, authenticated;
-- role helpers are used by RLS policies / RPCs of signed-in users only (anon never needs them)
grant execute on function public.has_role(text[]) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on all functions in schema public to service_role;
revoke execute on function public.rate_limit_hit(text,int,int) from public, anon, authenticated;
revoke execute on function public.purge_old_data(int,int,int,int,int) from public, anon, authenticated;

-- =====================================================================
-- SURVEYS (so'rovnomalar): questionnaires with NO scoring and no right answers.
--   * tables are staff-only (RLS); anon has NO table grants
--   * anon/authenticated visitors read through list_surveys() / get_survey()
--   * responses are written by submit_survey_response(), executable by service_role ONLY
--     (called from the rate-limited, bot-trapped /api/surveys/submit route); only a salted
--     sha256 of the browser token is stored, never the token itself
--   * survey_stats() is for staff (super_admin, methodist, psychologist) only
-- =====================================================================
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  audience text not null default 'all',
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  is_anonymous boolean not null default true,          -- false: the respondent group (role) becomes mandatory
  allow_multiple_responses boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint surveys_audience_chk check (audience in ('all','parents','students','teachers')),
  constraint surveys_dates_chk check (starts_at is null or ends_at is null or starts_at <= ends_at)
);
create index if not exists surveys_active_idx on public.surveys(is_active, created_at desc);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  type text not null default 'single',
  question_text jsonb not null default '{}'::jsonb,
  options jsonb not null default '[]'::jsonb,         -- [{id, text L}] for single / multiple
  scale_min int not null default 1,
  scale_max int not null default 5,
  scale_min_label jsonb not null default '{"uz":"","ru":"","en":""}'::jsonb,
  scale_max_label jsonb not null default '{"uz":"","ru":"","en":""}'::jsonb,
  required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_questions_type_chk check (type in ('single','multiple','scale','text','yesno')),
  constraint survey_questions_scale_chk check (scale_min >= 0 and scale_max <= 10 and scale_min < scale_max),
  constraint survey_questions_options_chk check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 20)
);
create index if not exists survey_questions_survey_idx on public.survey_questions(survey_id, sort_order);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  respondent_token_hash text not null check (char_length(respondent_token_hash) between 16 and 128),
  role_hint text,
  grade int,
  answers jsonb not null default '{}'::jsonb,         -- {question_id: value}
  created_at timestamptz not null default now(),
  constraint survey_responses_role_chk check (role_hint is null or role_hint in ('parent','student','teacher','other')),
  constraint survey_responses_grade_chk check (grade is null or grade between 1 and 11),
  constraint survey_responses_size_chk check (octet_length(answers::text) <= 20000)
);
create index if not exists survey_responses_survey_idx on public.survey_responses(survey_id, created_at desc);
create index if not exists survey_responses_token_idx on public.survey_responses(survey_id, respondent_token_hash);

drop trigger if exists trg_surveys_updated_at on public.surveys;
create trigger trg_surveys_updated_at before update on public.surveys
  for each row execute function public.set_updated_at();
drop trigger if exists trg_survey_questions_updated_at on public.survey_questions;
create trigger trg_survey_questions_updated_at before update on public.survey_questions
  for each row execute function public.set_updated_at();

-- RLS: all staff roles read, super_admin + methodist manage surveys and questions.
-- @migration 0002 begin
select public._mk_policies('surveys',          $e$public.is_admin()$e$, $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('survey_questions', $e$public.is_admin()$e$, $e$public.has_role('super_admin','methodist')$e$);
-- Responses: staff read; super_admin + methodist may delete (spam). Nobody inserts through PostgREST.
alter table public.survey_responses enable row level security;
drop policy if exists survey_responses_read on public.survey_responses;
create policy survey_responses_read on public.survey_responses for select to authenticated using ((select public.is_admin()));
drop policy if exists survey_responses_delete on public.survey_responses;
create policy survey_responses_delete on public.survey_responses for delete to authenticated
  using ((select public.has_role('super_admin','methodist')));
-- @migration 0002 end

-- Table privileges (new tables get Supabase default grants: start from a clean slate)
revoke all on public.surveys, public.survey_questions, public.survey_responses from public, anon, authenticated;
grant select, insert, update, delete on public.surveys, public.survey_questions to authenticated;
grant select, delete on public.survey_responses to authenticated;
grant all on public.surveys, public.survey_questions, public.survey_responses to service_role;

-- ---- Public: open surveys (active and inside their date window) -----------
-- @migration 0002 begin
create or replace function public.list_surveys()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'title', s.title, 'description', s.description, 'audience', s.audience,
           'starts_at', s.starts_at, 'ends_at', s.ends_at,
           'is_anonymous', s.is_anonymous, 'allow_multiple_responses', s.allow_multiple_responses,
           'question_count', (select count(*) from public.survey_questions q where q.survey_id = s.id)
         ) order by s.created_at, s.id), '[]'::jsonb)
  from (select * from public.surveys s
        where s.is_active and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at >= now())
        order by s.created_at, s.id limit 100) s;
$$;
-- @migration 0002 end

-- ---- Public: one open survey with its questions (no internals) -------------
create or replace function public.get_survey(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
           'id', s.id, 'title', s.title, 'description', s.description, 'audience', s.audience,
           'starts_at', s.starts_at, 'ends_at', s.ends_at,
           'is_anonymous', s.is_anonymous, 'allow_multiple_responses', s.allow_multiple_responses,
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', q.id, 'type', q.type, 'question_text', q.question_text,
                      'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o->>'id', 'text', o->'text')), '[]'::jsonb)
                                  from jsonb_array_elements(q.options) o),
                      'scale_min', q.scale_min, 'scale_max', q.scale_max,
                      'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
                      'required', q.required, 'sort_order', q.sort_order
                    ) order by q.sort_order, q.created_at, q.id)
             from public.survey_questions q where q.survey_id = s.id), '[]'::jsonb))
  from public.surveys s
  where s.id = p_id and s.is_active
    and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at >= now());
$$;

-- ---- Submit one response (service_role only; see header) --------------------
-- p_answers: {"<question_id>": value}  single/yesno: string, multiple: [string], scale: integer, text: string (<= 1000 chars)
-- Errors (stable codes): invalid_input, not_found, survey_closed, already_responded, required_missing, invalid_answer.
create or replace function public.submit_survey_response(
  p_survey uuid,
  p_answers jsonb,
  p_token text,
  p_role_hint text default null,
  p_grade int default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.surveys%rowtype;
  q public.survey_questions%rowtype;
  v_hash text;
  v_key text;
  v_val jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_n int := 0;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 20000
     or p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$'
     or (p_role_hint is not null and p_role_hint not in ('parent','student','teacher','other'))
     or (p_grade is not null and p_grade not between 1 and 11) then
    raise exception 'invalid_input';
  end if;
  select * into s from public.surveys where id = p_survey;
  if not found or not s.is_active then raise exception 'not_found'; end if;
  if (s.starts_at is not null and s.starts_at > now()) or (s.ends_at is not null and s.ends_at < now()) then
    raise exception 'survey_closed';
  end if;
  if not s.is_anonymous and p_role_hint is null then raise exception 'invalid_input'; end if;

  -- one response per browser token (salted with the survey id) unless the survey allows more
  v_hash := encode(sha256(convert_to('survey:' || p_survey::text || ':' || p_token, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));
  if not s.allow_multiple_responses and exists (
       select 1 from public.survey_responses r where r.survey_id = p_survey and r.respondent_token_hash = v_hash) then
    raise exception 'already_responded';
  end if;

  for q in select * from public.survey_questions where survey_id = p_survey order by sort_order, created_at, id loop
    v_n := v_n + 1;
    v_key := q.id::text;
    v_val := p_answers -> v_key;
    if v_val is null or v_val = 'null'::jsonb
       or (jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '')
       or (jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
      if q.required then raise exception 'required_missing'; end if;
      continue;
    end if;

    if q.type = 'single' then
      if jsonb_typeof(v_val) <> 'string' then raise exception 'invalid_answer'; end if;
      if not exists (select 1 from jsonb_array_elements(q.options) o where o->>'id' = v_val #>> '{}') then
        raise exception 'invalid_answer';
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_val);
    elsif q.type = 'multiple' then
      if jsonb_typeof(v_val) <> 'array' then raise exception 'invalid_answer'; end if;
      if exists (select 1 from jsonb_array_elements(v_val) e where jsonb_typeof(e) <> 'string') then
        raise exception 'invalid_answer';
      end if;
      if exists (select 1 from jsonb_array_elements_text(v_val) e
                 where not exists (select 1 from jsonb_array_elements(q.options) o where o->>'id' = e)) then
        raise exception 'invalid_answer';
      end if;
      if (select count(distinct e) from jsonb_array_elements_text(v_val) e) <> jsonb_array_length(v_val) then
        raise exception 'invalid_answer';
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_val);
    elsif q.type = 'scale' then
      if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^-?[0-9]{1,6}$' then raise exception 'invalid_answer'; end if;
      if (v_val #>> '{}')::int < q.scale_min or (v_val #>> '{}')::int > q.scale_max then raise exception 'invalid_answer'; end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_val);
    elsif q.type = 'yesno' then
      if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('yes','no') then raise exception 'invalid_answer'; end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_val);
    else
      if jsonb_typeof(v_val) <> 'string' or char_length(v_val #>> '{}') > 1000 then raise exception 'invalid_answer'; end if;
      v_clean := v_clean || jsonb_build_object(v_key, btrim(v_val #>> '{}'));
    end if;
  end loop;
  if v_n = 0 then raise exception 'not_found'; end if;

  insert into public.survey_responses (survey_id, respondent_token_hash, role_hint, grade, answers)
  values (p_survey, v_hash, p_role_hint, p_grade, v_clean);
  return jsonb_build_object('ok', true);
end $$;

-- ---- Staff: aggregated statistics ------------------------------------------
-- Internal helper: responses of one survey inside [p_from, p_to).
create or replace function public._survey_filtered(p_survey uuid, p_from timestamptz, p_to timestamptz)
returns setof public.survey_responses
language sql stable security definer set search_path = public, pg_temp as $$
  select r.* from public.survey_responses r
  where r.survey_id = p_survey and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < p_to);
$$;

-- Returns {survey_id,total,first_at,last_at,by_role[],by_day[],questions[{id,type,answered,counts|scale|texts}]}.
-- @migration 0002 begin
create or replace function public.survey_stats(p_survey uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  q public.survey_questions%rowtype;
  v_key text;
  v_item jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_total int;
  v_first timestamptz;
  v_last timestamptz;
begin
  if not public.has_role('super_admin','methodist','psychologist') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.surveys s where s.id = p_survey) then raise exception 'not_found'; end if;
  select count(*), min(r.created_at), max(r.created_at) into v_total, v_first, v_last
    from public._survey_filtered(p_survey, p_from, p_to) r;

  for q in select * from public.survey_questions where survey_id = p_survey order by sort_order, created_at, id loop
    v_key := q.id::text;
    v_item := jsonb_build_object('id', q.id, 'type', q.type,
      'answered', (select count(*) from public._survey_filtered(p_survey, p_from, p_to) r where r.answers ? v_key));
    -- one pass over the responses per question (group by) instead of one pass per option
    if q.type = 'single' then
      v_item := v_item || jsonb_build_object('counts', (
        with c as (
          select r.answers ->> v_key as id, count(*) as n
          from public._survey_filtered(p_survey, p_from, p_to) r
          where jsonb_typeof(r.answers -> v_key) = 'string' group by 1)
        select coalesce(jsonb_agg(jsonb_build_object('id', t.o->>'id', 'count', coalesce(c.n, 0)) order by t.ord), '[]'::jsonb)
        from jsonb_array_elements(q.options) with ordinality as t(o, ord)
        left join c on c.id = t.o->>'id'));
    elsif q.type = 'multiple' then
      v_item := v_item || jsonb_build_object('counts', (
        with c as (
          select e.id, count(*) as n
          from (select r.answers -> v_key as arr from public._survey_filtered(p_survey, p_from, p_to) r) x
          cross join lateral jsonb_array_elements_text(case when jsonb_typeof(x.arr) = 'array' then x.arr else '[]'::jsonb end) as e(id)
          group by e.id)
        select coalesce(jsonb_agg(jsonb_build_object('id', t.o->>'id', 'count', coalesce(c.n, 0)) order by t.ord), '[]'::jsonb)
        from jsonb_array_elements(q.options) with ordinality as t(o, ord)
        left join c on c.id = t.o->>'id'));
    elsif q.type = 'yesno' then
      v_item := v_item || jsonb_build_object('counts', (
        with c as (
          select r.answers ->> v_key as id, count(*) as n
          from public._survey_filtered(p_survey, p_from, p_to) r
          where jsonb_typeof(r.answers -> v_key) = 'string' group by 1)
        select jsonb_agg(jsonb_build_object('id', t.id, 'count', coalesce(c.n, 0)) order by t.ord)
        from (values ('yes', 1), ('no', 2)) as t(id, ord)
        left join c on c.id = t.id));
    elsif q.type = 'scale' then
      v_item := v_item || jsonb_build_object('scale', (
        with vals as (
          select (r.answers ->> v_key)::numeric as v
          from public._survey_filtered(p_survey, p_from, p_to) r
          where jsonb_typeof(r.answers -> v_key) = 'number')
        select jsonb_build_object(
                 'avg', (select round(avg(v), 2) from vals),
                 'min', (select min(v) from vals),
                 'max', (select max(v) from vals),
                 'distribution', (select jsonb_agg(jsonb_build_object('value', g, 'count', (select count(*) from vals where v = g)) order by g)
                                  from generate_series(q.scale_min, q.scale_max) g))));
    else
      v_item := v_item || jsonb_build_object('texts', (
        select coalesce(jsonb_agg(jsonb_build_object('text', x.t, 'created_at', x.c) order by x.c desc), '[]'::jsonb)
        from (select r.answers ->> v_key as t, r.created_at as c
              from public._survey_filtered(p_survey, p_from, p_to) r
              where jsonb_typeof(r.answers -> v_key) = 'string'
              order by r.created_at desc limit 300) x));
    end if;
    v_questions := v_questions || jsonb_build_array(v_item);
  end loop;

  return jsonb_build_object(
    'survey_id', p_survey,
    'total', v_total,
    'first_at', v_first,
    'last_at', v_last,
    'by_role', (select coalesce(jsonb_agg(jsonb_build_object('role', x.role, 'count', x.n) order by x.n desc, x.role), '[]'::jsonb)
                from (select coalesce(r.role_hint, 'unknown') as role, count(*) as n
                      from public._survey_filtered(p_survey, p_from, p_to) r group by 1) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'count', x.n) order by x.d), '[]'::jsonb)
               from (select to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD') as d, count(*) as n
                     from public._survey_filtered(p_survey, p_from, p_to) r group by 1) x),
    'questions', v_questions);
end $$;
-- @migration 0002 end

-- Function privileges (the global revoke above ran before these functions existed)
revoke all on function public.list_surveys(), public.get_survey(uuid),
  public.submit_survey_response(uuid,jsonb,text,text,int),
  public._survey_filtered(uuid,timestamptz,timestamptz),
  public.survey_stats(uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.list_surveys(), public.get_survey(uuid) to anon, authenticated;
grant execute on function public.survey_stats(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.list_surveys(), public.get_survey(uuid),
  public.submit_survey_response(uuid,jsonb,text,text,int),
  public._survey_filtered(uuid,timestamptz,timestamptz),
  public.survey_stats(uuid,timestamptz,timestamptz) to service_role;
-- =====================================================================
-- SECTION: CONTENT GAMES (matching pairs / true-false / quiz race)
-- Staff-authored content sets that the three content-driven games play.
--  * Table game_content_sets: RLS = super_admin + methodist; anon/authenticated have NO other access.
--  * Public access ONLY through RPCs:
--      list_game_sets(game_type)            anon+authenticated  summaries, no items
--      get_game_set(id)                     anon+authenticated  summary; items ONLY for 'matching'
--      start_content_round(set, n)          anon+authenticated  n random items WITHOUT answers
--      check_content_answer(set,item,ans)   service_role ONLY   called by /api/games/content/answer after it
--                                           verified the HMAC round token issued by /api/games/content/round
--      content_fifty_fifty(set,item)        service_role ONLY   two wrong options for the 50/50 lifeline
--  * Matching pairs necessarily ship both sides of each pair to the client (it is a memory game);
--    true_false and quiz_race never ship is_true / correct_option_id / explanation in bulk.
--  * NOTE for db:split: this section sits BEFORE the SEED DATA marker, so it is part of 0001_init.sql
--    (only the demo content sets at the very end of the file are seed data).
-- =====================================================================

-- ---- validation helpers (pure; used by the CHECK constraint, so authenticated needs EXECUTE) ----
create or replace function public._gc_loc_ok(j jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    jsonb_typeof(j) = 'object'
    and jsonb_typeof(j->'uz') = 'string' and char_length(btrim(j->>'uz')) between 1 and 2000
    and coalesce(jsonb_typeof(j->'ru'), 'string') = 'string' and char_length(coalesce(j->>'ru', '')) <= 2000
    and coalesce(jsonb_typeof(j->'en'), 'string') = 'string' and char_length(coalesce(j->>'en', '')) <= 2000,
    false);
$$;

-- optional localized text: absent / null / object whose parts are short strings (may be all empty)
create or replace function public._gc_loc_opt_ok(j jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select j is null or jsonb_typeof(j) = 'null' or coalesce(
    jsonb_typeof(j) = 'object'
    and coalesce(jsonb_typeof(j->'uz'), 'string') = 'string' and char_length(coalesce(j->>'uz', '')) <= 2000
    and coalesce(jsonb_typeof(j->'ru'), 'string') = 'string' and char_length(coalesce(j->>'ru', '')) <= 2000
    and coalesce(jsonb_typeof(j->'en'), 'string') = 'string' and char_length(coalesce(j->>'en', '')) <= 2000,
    false);
$$;

-- matching: [{id, left L, right L}] (>=4) | true_false: [{id, statement L, is_true bool, explanation L?}] (>=5)
-- quiz_race: [{id, question L, options [{id,text L}] (2..6), correct_option_id, explanation L?}] (>=5); ids unique
create or replace function public.validate_game_items(p_type text, p_items jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare
  it jsonb; opt jsonb;
  n int; min_n int; ids text[] := '{}'; oids text[];
begin
  if p_type not in ('matching','true_false','quiz_race') or p_items is null or jsonb_typeof(p_items) <> 'array' then
    return false;
  end if;
  n := jsonb_array_length(p_items);
  min_n := case when p_type = 'matching' then 4 else 5 end;
  if n > 300 or n < min_n then return false; end if;
  for it in select e.value from jsonb_array_elements(p_items) as e(value) loop
    if jsonb_typeof(it) <> 'object' or jsonb_typeof(it->'id') is distinct from 'string'
       or (it->>'id') !~ '^[A-Za-z0-9_-]{1,40}$' or (it->>'id') = any(ids) then
      return false;
    end if;
    ids := ids || (it->>'id');
    if p_type = 'matching' then
      if not (public._gc_loc_ok(it->'left') and public._gc_loc_ok(it->'right')) then return false; end if;
    elsif p_type = 'true_false' then
      if not (public._gc_loc_ok(it->'statement') and jsonb_typeof(it->'is_true') is not distinct from 'boolean'
              and public._gc_loc_opt_ok(it->'explanation')) then return false; end if;
    else
      if not (public._gc_loc_ok(it->'question') and public._gc_loc_opt_ok(it->'explanation')
              and jsonb_typeof(it->'options') is not distinct from 'array'
              and jsonb_array_length(it->'options') between 2 and 6
              and jsonb_typeof(it->'correct_option_id') is not distinct from 'string') then return false; end if;
      oids := '{}';
      for opt in select o.value from jsonb_array_elements(it->'options') as o(value) loop
        if jsonb_typeof(opt) <> 'object' or jsonb_typeof(opt->'id') is distinct from 'string'
           or (opt->>'id') !~ '^[A-Za-z0-9_-]{1,40}$' or (opt->>'id') = any(oids) or not public._gc_loc_ok(opt->'text') then
          return false;
        end if;
        oids := oids || (opt->>'id');
      end loop;
      if not ((it->>'correct_option_id') = any(oids)) then return false; end if;
    end if;
  end loop;
  return true;
end $$;

-- ---- table ----
create table if not exists public.game_content_sets (
  id uuid primary key default gen_random_uuid(),
  game_type text not null check (game_type in ('matching','true_false','quiz_race')),
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  subject_key text not null default 'general' check (subject_key ~ '^[a-z0-9_-]{1,40}$'),
  grade int check (grade is null or grade between 1 and 11),
  difficulty public.difficulty_level not null default 'medium',
  items jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.game_content_sets drop constraint if exists game_content_sets_items_chk;
alter table public.game_content_sets add constraint game_content_sets_items_chk check (public.validate_game_items(game_type, items));
alter table public.game_content_sets drop constraint if exists game_content_sets_title_chk;
alter table public.game_content_sets add constraint game_content_sets_title_chk check (public._gc_loc_ok(title) and public._gc_loc_opt_ok(description));
create index if not exists game_content_sets_list_idx on public.game_content_sets(game_type, is_active, sort_order);
drop trigger if exists trg_game_content_sets_updated_at on public.game_content_sets;
create trigger trg_game_content_sets_updated_at before update on public.game_content_sets
  for each row execute function public.set_updated_at();

-- ---- RLS: staff only; anon has no grants at all ----
alter table public.game_content_sets enable row level security;
-- @migration 0002 begin
drop policy if exists game_content_sets_write on public.game_content_sets;
create policy game_content_sets_write on public.game_content_sets for all to authenticated
  using ((select public.has_role('super_admin','methodist'))) with check ((select public.has_role('super_admin','methodist')));
-- @migration 0002 end
revoke all on public.game_content_sets from public, anon, authenticated;
grant select, insert, update, delete on public.game_content_sets to authenticated;
grant all on public.game_content_sets to service_role;

-- ---- RPCs ----
create or replace function public._game_set_summary(s public.game_content_sets)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'game_type', s.game_type, 'title', s.title, 'description', s.description,
                            'subject_key', s.subject_key, 'grade', s.grade, 'difficulty', s.difficulty::text,
                            'item_count', jsonb_array_length(s.items));
$$;

-- @migration 0002 begin
create or replace function public.list_game_sets(p_game_type text default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public._game_set_summary(s) order by s.sort_order, s.created_at), '[]'::jsonb)
  from (select * from public.game_content_sets g
        where g.is_active and (p_game_type is null or g.game_type = p_game_type)
        order by g.sort_order, g.created_at limit 500) s;
$$;
-- @migration 0002 end

-- one set; the items (all pairs) are included for 'matching' only, never for true_false / quiz_race
create or replace function public.get_game_set(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.game_content_sets%rowtype;
begin
  select * into s from public.game_content_sets where id = p_id and is_active;
  if not found then return null; end if;
  return public._game_set_summary(s) || case when s.game_type = 'matching' then jsonb_build_object('items', s.items) else '{}'::jsonb end;
end $$;

-- n random items, WITHOUT answers (matching keeps both sides). Options of quiz questions are shuffled.
create or replace function public.start_content_round(p_set uuid, p_n int default 10)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.game_content_sets%rowtype; v_items jsonb; v_n int := least(greatest(coalesce(p_n, 10), 1), 50);
begin
  select * into s from public.game_content_sets where id = p_set and is_active;
  if not found then return null; end if;
  select coalesce(jsonb_agg(z.item order by z.r), '[]'::jsonb) into v_items from (
    select y.item, y.r from (
      select case s.game_type
        when 'matching' then jsonb_build_object('id', e.value->>'id', 'left', e.value->'left', 'right', e.value->'right')
        when 'true_false' then jsonb_build_object('id', e.value->>'id', 'statement', e.value->'statement')
        else jsonb_build_object('id', e.value->>'id', 'question', e.value->'question', 'options',
               (select coalesce(jsonb_agg(jsonb_build_object('id', o.value->>'id', 'text', o.value->'text') order by random()), '[]'::jsonb)
                from jsonb_array_elements(e.value->'options') as o(value)))
      end as item, random() as r
      from jsonb_array_elements(s.items) as e(value)
    ) y order by y.r limit v_n
  ) z;
  return jsonb_build_object('set', public._game_set_summary(s), 'items', v_items);
end $$;

-- true_false: p_answer = 'true' | 'false'; quiz_race: p_answer = option id ('' = no answer / timed out)
create or replace function public.check_content_answer(p_set uuid, p_item text, p_answer text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.game_content_sets%rowtype; it jsonb; v_expl jsonb; v_ok boolean;
begin
  select * into s from public.game_content_sets where id = p_set and is_active;
  if not found or s.game_type = 'matching' then return null; end if;
  select e.value into it from jsonb_array_elements(s.items) as e(value) where e.value->>'id' = p_item limit 1;
  if it is null then return null; end if;
  v_expl := it->'explanation';
  if jsonb_typeof(v_expl) is distinct from 'object'
     or (coalesce(v_expl->>'uz','') = '' and coalesce(v_expl->>'ru','') = '' and coalesce(v_expl->>'en','') = '') then
    v_expl := null;
  end if;
  if s.game_type = 'true_false' then
    return jsonb_build_object('correct', (it->>'is_true') = coalesce(p_answer, ''), 'explanation', v_expl);
  end if;
  v_ok := coalesce(p_answer, '') = (it->>'correct_option_id');
  return jsonb_build_object('correct', v_ok, 'explanation', v_expl, 'correct_option_id', it->>'correct_option_id');
end $$;

-- 50/50 lifeline: ids of up to two wrong options to hide (never leaves fewer than two options)
create or replace function public.content_fifty_fifty(p_set uuid, p_item text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.game_content_sets%rowtype; it jsonb; v jsonb;
begin
  select * into s from public.game_content_sets where id = p_set and is_active and game_type = 'quiz_race';
  if not found then return null; end if;
  select e.value into it from jsonb_array_elements(s.items) as e(value) where e.value->>'id' = p_item limit 1;
  if it is null then return null; end if;
  select coalesce(jsonb_agg(w.id), '[]'::jsonb) into v from (
    select o.value->>'id' as id from jsonb_array_elements(it->'options') as o(value)
    where o.value->>'id' <> it->>'correct_option_id'
    order by random()
    limit least(2, greatest(jsonb_array_length(it->'options') - 2, 0))
  ) w;
  return v;
end $$;

revoke all on function public._gc_loc_ok(jsonb), public._gc_loc_opt_ok(jsonb), public.validate_game_items(text, jsonb),
  public._game_set_summary(public.game_content_sets), public.list_game_sets(text), public.get_game_set(uuid),
  public.start_content_round(uuid, int), public.check_content_answer(uuid, text, text), public.content_fifty_fifty(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_game_sets(text), public.get_game_set(uuid), public.start_content_round(uuid, int) to anon, authenticated;
-- the CHECK constraint is evaluated with the privileges of the writing staff user
grant execute on function public._gc_loc_ok(jsonb), public._gc_loc_opt_ok(jsonb), public.validate_game_items(text, jsonb) to authenticated;
grant execute on function public._gc_loc_ok(jsonb), public._gc_loc_opt_ok(jsonb), public.validate_game_items(text, jsonb),
  public._game_set_summary(public.game_content_sets), public.list_game_sets(text), public.get_game_set(uuid),
  public.start_content_round(uuid, int), public.check_content_answer(uuid, text, text), public.content_fifty_fifty(uuid, text) to service_role;


-- =====================================================================
-- Storage buckets (public read, admin write)
-- =====================================================================
-- @migration 0002 begin
insert into storage.buckets (id, name, public) values
  ('school-media', 'school-media', true),
  ('test-assets', 'test-assets', true),
  ('certificates', 'certificates', true)
on conflict (id) do update set public = true;
-- Match the admin upload route (app/api/admin/upload): 8 MB and only the file types it sniffs and accepts.
update storage.buckets set file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/gif','image/webp','application/pdf']
  where id in ('school-media', 'test-assets', 'certificates');

drop policy if exists "maktab_media_read" on storage.objects;
-- Public buckets serve objects by URL without any storage.objects policy; a SELECT policy would additionally
-- let anon LIST a bucket. Listing is therefore allowed for the content buckets only. `certificates`
-- (student names) is listable by staff only, so uploaded paths cannot be enumerated.
create policy "maktab_media_read" on storage.objects for select to anon, authenticated
  using (bucket_id in ('school-media','test-assets'));
drop policy if exists "maktab_certs_staff_read" on storage.objects;
create policy "maktab_certs_staff_read" on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and (select public.is_admin()));
drop policy if exists "maktab_media_admin_insert" on storage.objects;
create policy "maktab_media_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('school-media','test-assets','certificates') and (select public.is_admin()));
drop policy if exists "maktab_media_admin_update" on storage.objects;
create policy "maktab_media_admin_update" on storage.objects for update to authenticated
  using (bucket_id in ('school-media','test-assets','certificates') and (select public.is_admin()))
  with check (bucket_id in ('school-media','test-assets','certificates') and (select public.is_admin()));
drop policy if exists "maktab_media_admin_delete" on storage.objects;
create policy "maktab_media_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('school-media','test-assets','certificates') and (select public.is_admin()));
-- @migration 0002 end

-- =====================================================================
-- SECTION: SCHOOL MANAGEMENT SYSTEM (SIS, portal /school)
-- Electronic journal: attendance, grades, classes, people. See docs/SIS.md.
--   * NO anon access at all (no grants, no policies). Roles: super_admin/school_admin = director,
--     teacher (own classes only), parent (own children), student (self).
--   * The Next.js API uses the service role after verifying the session; RLS + the RPCs below are the
--     second line of defence for direct PostgREST access. Bulk writes go through SECURITY DEFINER RPCs
--     that are called with the USER's JWT (they read auth.uid()).
-- =====================================================================
alter type public.user_role add value if not exists 'school_admin';
alter type public.user_role add value if not exists 'parent';

create table if not exists public.school_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 3 and 40),
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  grading_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_years_dates_chk check (end_date > start_date)
);
create unique index if not exists school_years_current_uq on public.school_years(is_current) where is_current;

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  year_id uuid not null references public.school_years(id) on delete cascade,
  number int not null check (number between 1 and 4),
  name text not null check (char_length(name) between 1 and 60),
  start_date date not null,
  end_date date not null,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_dates_chk check (end_date > start_date),
  constraint terms_number_uq unique (year_id, number)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null default '{}'::jsonb,
  short text not null default '' check (char_length(short) <= 12),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 320),
  subjects uuid[] not null default '{}',
  hired_at date,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  year_id uuid not null references public.school_years(id) on delete cascade,
  grade int not null check (grade between 1 and 11),
  letter text not null check (char_length(letter) between 1 and 3),
  name text not null check (char_length(name) between 1 and 12),
  homeroom_teacher_id uuid references public.teachers(id) on delete set null,
  room text check (room is null or char_length(room) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_uq unique (year_id, grade, letter)
);

create table if not exists public.teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  hours_per_week int not null default 2 check (hours_per_week between 1 and 12),
  created_at timestamptz not null default now(),
  constraint teaching_assignments_uq unique (class_id, subject_id)
);
create index if not exists teaching_assignments_teacher_idx on public.teaching_assignments(teacher_id);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  middle_name text check (middle_name is null or char_length(middle_name) <= 80),
  birth_date date,
  gender text check (gender is null or gender in ('m','f')),
  class_id uuid references public.classes(id) on delete set null,
  student_code text not null unique check (char_length(student_code) between 2 and 30),
  phone text check (phone is null or char_length(phone) <= 30),
  address text check (address is null or char_length(address) <= 300),
  photo_url text check (photo_url is null or char_length(photo_url) <= 500),
  status text not null default 'active' check (status in ('active','transferred','graduated','expelled')),
  enrolled_at date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists students_class_idx on public.students(class_id, status);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  relation text not null default 'parent' check (relation in ('mother','father','guardian','parent','other')),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 320),
  telegram_chat_id text check (telegram_chat_id is null or char_length(telegram_chat_id) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (student_id, guardian_id)
);
create index if not exists student_guardians_guardian_idx on public.student_guardians(guardian_id);

create table if not exists public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  weekday int not null check (weekday between 1 and 6),
  lesson_no int not null check (lesson_no between 1 and 8),
  start_time time not null,
  end_time time not null,
  room text check (room is null or char_length(room) <= 20),
  constraint schedule_slots_uq unique (class_id, weekday, lesson_no),
  constraint schedule_slots_time_chk check (end_time > start_time)
);
create index if not exists schedule_slots_teacher_idx on public.schedule_slots(teacher_id, weekday, lesson_no);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references public.schedule_slots(id) on delete set null,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  date date not null,
  lesson_no int not null check (lesson_no between 1 and 8),
  topic text check (topic is null or char_length(topic) <= 300),
  homework text check (homework is null or char_length(homework) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_uq unique (class_id, date, lesson_no)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  date date not null,
  lesson_no int check (lesson_no is null or lesson_no between 1 and 8),
  status text not null check (status in ('present','absent','late','excused','sick')),
  minutes_late int not null default 0 check (minutes_late between 0 and 240),
  note text check (note is null or char_length(note) <= 200),
  marked_by uuid,
  marked_at timestamptz not null default now()
);
create unique index if not exists attendance_uq on public.attendance(student_id, date, (coalesce(lesson_no, 0)));
create index if not exists attendance_class_date_idx on public.attendance(class_id, date);

create table if not exists public.grade_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  date date not null,
  kind text not null default 'daily' check (kind in ('daily','quiz','test','exam','homework','term','year')),
  score numeric(3,1) not null check (score between 1 and 5),
  max_score numeric(5,1) not null default 5 check (max_score > 0),
  percent numeric(5,2) check (percent is null or percent between 0 and 100),
  weight numeric(4,2) not null default 1 check (weight > 0 and weight <= 10),
  comment text check (comment is null or char_length(comment) <= 300),
  teacher_id uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grade_entries_student_idx on public.grade_entries(student_id, term_id);
create index if not exists grade_entries_journal_idx on public.grade_entries(class_id, subject_id, term_id, date);

create table if not exists public.term_grades (
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  value int check (value is null or value between 1 and 5),
  suggested numeric(3,2) check (suggested is null or suggested between 1 and 5),
  is_confirmed boolean not null default false,
  confirmed_by uuid,
  updated_at timestamptz not null default now(),
  primary key (student_id, subject_id, term_id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  audience text not null default 'all' check (audience in ('all','teachers','parents','students','class')),
  class_id uuid references public.classes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 4000),
  author_id uuid,
  publish_at timestamptz not null default now(),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_class_chk check ((audience = 'class') = (class_id is not null))
);
create index if not exists announcements_publish_idx on public.announcements(publish_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (char_length(type) between 1 and 40),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_payload_chk check (octet_length(payload::text) <= 4000)
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.behavior_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,
  date date not null default current_date,
  kind text not null default 'neutral' check (kind in ('positive','negative','neutral')),
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists behavior_notes_student_idx on public.behavior_notes(student_id, date desc);

-- ---- SIS additions (idempotent) ----
-- why a confirmed term grade differs from the suggestion (kept next to the value, not only in audit_log)
alter table public.term_grades add column if not exists override_reason text
  check (override_reason is null or char_length(override_reason) <= 300);

-- a room and a teacher can be in one place only: no two slots with the same weekday + lesson number + room / teacher
create unique index if not exists schedule_slots_room_uq on public.schedule_slots (weekday, lesson_no, (lower(btrim(room))))
  where room is not null and btrim(room) <> '';
create unique index if not exists schedule_slots_teacher_uq on public.schedule_slots (teacher_id, weekday, lesson_no)
  where teacher_id is not null;

-- per-user notification preferences (one row per account; no row = everything on)
create table if not exists public.school_notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram boolean not null default true,
  email boolean not null default true,
  absence boolean not null default true,
  low_grade boolean not null default true,
  announcements boolean not null default true,
  updated_at timestamptz not null default now()
);

-- updated_at triggers for the tables above (same loop as the core section; idempotent)
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
      and c.table_name in (select table_name from information_schema.tables
                           where table_schema='public' and table_type='BASE TABLE')
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---- identity / ownership helpers (SECURITY DEFINER, fixed search_path; evaluated for the calling user) ----
create or replace function public.is_school_director()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_role('super_admin','school_admin');
$$;

create or replace function public.is_school_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_role('super_admin','school_admin','teacher');
$$;

create or replace function public.my_teacher_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select t.id from public.teachers t
  join public.profiles p on p.id = t.user_id
  where t.user_id = auth.uid() and t.status = 'active' and p.is_active and p.role::text = 'teacher'
  limit 1;
$$;

-- students (ids) that belong to the calling parent
create or replace function public.my_children()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select sg.student_id from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  where g.user_id = auth.uid() and public.has_role('parent');
$$;

-- children (parent) or self (student)
create or replace function public.my_student_ids()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.my_children()
  union
  select s.id from public.students s where s.user_id = auth.uid() and public.has_role('student');
$$;

create or replace function public.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.my_teacher_id() is not null and (
    exists (select 1 from public.teaching_assignments a where a.class_id = p_class and a.teacher_id = public.my_teacher_id())
    or exists (select 1 from public.classes c where c.id = p_class and c.homeroom_teacher_id = public.my_teacher_id())
  );
$$;

create or replace function public.teaches_subject_class(p_class uuid, p_subject uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.my_teacher_id() is not null and exists (
    select 1 from public.teaching_assignments a
    where a.class_id = p_class and a.subject_id = p_subject and a.teacher_id = public.my_teacher_id());
$$;

create or replace function public.can_manage_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_school_director() or public.teaches_class(p_class);
$$;

create or replace function public.can_view_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.can_manage_class(p_class) or exists (
    select 1 from public.students s where s.class_id = p_class and s.id in (select public.my_student_ids()));
$$;

create or replace function public.can_view_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_school_director()
    or p_student in (select public.my_student_ids())
    or exists (select 1 from public.students s where s.id = p_student and s.class_id is not null and public.teaches_class(s.class_id));
$$;

create or replace function public.student_in_class(p_student uuid, p_class uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.students s where s.id = p_student and s.class_id = p_class);
$$;

create or replace function public.announcement_visible(p_audience text, p_class uuid, p_publish timestamptz)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_school_director() or (p_publish <= now() and (
    p_audience = 'all'
    or (p_audience = 'teachers' and public.has_role('teacher'))
    or (p_audience = 'parents' and public.has_role('parent'))
    or (p_audience = 'students' and public.has_role('student'))
    or (p_audience = 'class' and p_class is not null and public.can_view_class(p_class))));
$$;

-- the school calendar day (Uzbekistan, UTC+5) - used for "not in the future" / edit-window checks
create or replace function public.school_today()
returns date language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'Asia/Tashkent')::date;
$$;

-- ---- term lock guard: locked terms reject grade writes from everyone except directors / service role ----
create or replace function public.sis_guard_term_lock()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_locked boolean;
begin
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' or public.is_school_director() then
    return coalesce(new, old);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    select t.is_locked into v_locked from public.terms t where t.id = new.term_id;
    if coalesce(v_locked, false) then raise exception 'term_locked'; end if;
  end if;
  if tg_op in ('UPDATE','DELETE') then
    select t.is_locked into v_locked from public.terms t where t.id = old.term_id;
    if coalesce(v_locked, false) then raise exception 'term_locked'; end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_grade_entries_lock on public.grade_entries;
create trigger trg_grade_entries_lock before insert or update or delete on public.grade_entries
  for each row execute function public.sis_guard_term_lock();
drop trigger if exists trg_term_grades_lock on public.term_grades;
create trigger trg_term_grades_lock before insert or update or delete on public.term_grades
  for each row execute function public.sis_guard_term_lock();

-- ---- RLS ----
-- Conventions: (select auth.uid()) / (select public.fn()) are evaluated once per statement (initPlan), only
-- row-dependent helpers (can_view_student(id) ...) run per row. Every INSERT/UPDATE policy has a WITH CHECK.
-- @migration 0002 begin
create or replace function public._sis_policy(t text, suffix text, cmd text, using_expr text, check_expr text)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_' || suffix, t);
  if cmd = 'insert' then
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_' || suffix, t, check_expr);
  elsif check_expr is null then
    execute format('create policy %I on public.%I for %s to authenticated using (%s)', t || '_' || suffix, t, cmd, using_expr);
  else
    execute format('create policy %I on public.%I for %s to authenticated using (%s) with check (%s)', t || '_' || suffix, t, cmd, using_expr, check_expr);
  end if;
end $$;

-- directors manage everything; reference data is readable by every active school member
do $$
declare t text;
begin
  foreach t in array array['school_years','terms','subjects','teachers','classes','teaching_assignments','students','guardians',
    'student_guardians','schedule_slots','lessons','attendance','grade_entries','term_grades','announcements','notifications','behavior_notes']
  loop
    perform public._sis_policy(t, 'director', 'all', '(select public.is_school_director())', '(select public.is_school_director())');
  end loop;
end $$;

select public._sis_policy('school_years', 'member_read', 'select', $e$(select public.has_role('teacher','parent','student'))$e$, null);
select public._sis_policy('terms',        'member_read', 'select', $e$(select public.has_role('teacher','parent','student'))$e$, null);
select public._sis_policy('subjects',     'member_read', 'select', $e$(select public.has_role('teacher','parent','student'))$e$, null);
select public._sis_policy('classes',      'member_read', 'select', $e$(select public.has_role('teacher','parent','student'))$e$, null);
select public._sis_policy('teachers', 'self_read', 'select', 'user_id = (select auth.uid())', null);
select public._sis_policy('teaching_assignments', 'read', 'select', 'teacher_id = (select public.my_teacher_id()) or public.can_view_class(class_id)', null);
select public._sis_policy('students', 'read', 'select', 'public.can_view_student(id)', null);
select public._sis_policy('guardians', 'read', 'select',
  $e$user_id = (select auth.uid()) or exists (select 1 from public.student_guardians sg where sg.guardian_id = guardians.id and public.can_view_student(sg.student_id) and not (select public.has_role('student')))$e$, null);
select public._sis_policy('student_guardians', 'read', 'select', $e$public.can_view_student(student_id) and not (select public.has_role('student'))$e$, null);
select public._sis_policy('schedule_slots', 'read', 'select', 'public.can_view_class(class_id)', null);
select public._sis_policy('lessons', 'read', 'select', 'public.can_view_class(class_id)', null);
select public._sis_policy('lessons', 'teacher_ins', 'insert', null, 'teacher_id = (select public.my_teacher_id()) and public.teaches_subject_class(class_id, subject_id)');
select public._sis_policy('lessons', 'teacher_upd', 'update', 'teacher_id = (select public.my_teacher_id()) and public.teaches_subject_class(class_id, subject_id)', 'teacher_id = (select public.my_teacher_id()) and public.teaches_subject_class(class_id, subject_id)');
select public._sis_policy('attendance', 'read', 'select', 'public.can_view_student(student_id)', null);
-- direct writes obey the same window as mark_attendance_bulk(): not in the future, not older than 14 days
select public._sis_policy('attendance', 'teacher_ins', 'insert', null, 'public.teaches_class(class_id) and public.student_in_class(student_id, class_id) and date between (select public.school_today()) - 14 and (select public.school_today())');
select public._sis_policy('attendance', 'teacher_upd', 'update', 'public.teaches_class(class_id) and date >= (select public.school_today()) - 14', 'public.teaches_class(class_id) and public.student_in_class(student_id, class_id) and date between (select public.school_today()) - 14 and (select public.school_today())');
select public._sis_policy('grade_entries', 'read', 'select', 'public.can_view_student(student_id)', null);
select public._sis_policy('grade_entries', 'teacher_ins', 'insert', null, 'teacher_id = (select public.my_teacher_id()) and public.teaches_subject_class(class_id, subject_id) and public.student_in_class(student_id, class_id) and date <= (select public.school_today())');
select public._sis_policy('grade_entries', 'teacher_upd', 'update', 'teacher_id = (select public.my_teacher_id()) and public.teaches_subject_class(class_id, subject_id)', 'teacher_id = (select public.my_teacher_id()) and public.teaches_subject_class(class_id, subject_id) and public.student_in_class(student_id, class_id) and date <= (select public.school_today())');
select public._sis_policy('grade_entries', 'teacher_del', 'delete', 'teacher_id = (select public.my_teacher_id()) and public.teaches_subject_class(class_id, subject_id)', null);
select public._sis_policy('term_grades', 'read', 'select', 'public.can_view_student(student_id)', null);
select public._sis_policy('term_grades', 'teacher_ins', 'insert', null, 'public.teaches_subject_class(class_id, subject_id) and public.student_in_class(student_id, class_id)');
select public._sis_policy('term_grades', 'teacher_upd', 'update', 'public.teaches_subject_class(class_id, subject_id)', 'public.teaches_subject_class(class_id, subject_id) and public.student_in_class(student_id, class_id)');
select public._sis_policy('announcements', 'read', 'select', 'public.announcement_visible(audience, class_id, publish_at)', null);
select public._sis_policy('announcements', 'teacher_ins', 'insert', null, $e$audience = 'class' and class_id is not null and public.teaches_class(class_id) and author_id = (select auth.uid())$e$);
select public._sis_policy('announcements', 'teacher_upd', 'update', $e$author_id = (select auth.uid()) and (select public.has_role('teacher'))$e$, $e$audience = 'class' and class_id is not null and public.teaches_class(class_id) and author_id = (select auth.uid())$e$);
select public._sis_policy('announcements', 'teacher_del', 'delete', $e$author_id = (select auth.uid()) and (select public.has_role('teacher'))$e$, null);
select public._sis_policy('notifications', 'own_read', 'select', 'user_id = (select auth.uid())', null);
select public._sis_policy('notifications', 'own_upd', 'update', 'user_id = (select auth.uid())', 'user_id = (select auth.uid())');
select public._sis_policy('school_notification_prefs', 'own_read', 'select', 'user_id = (select auth.uid())', null);
select public._sis_policy('school_notification_prefs', 'own_ins', 'insert', null, 'user_id = (select auth.uid())');
select public._sis_policy('school_notification_prefs', 'own_upd', 'update', 'user_id = (select auth.uid())', 'user_id = (select auth.uid())');
select public._sis_policy('behavior_notes', 'read', 'select', 'public.can_view_student(student_id)', null);
select public._sis_policy('behavior_notes', 'teacher_ins', 'insert', null, 'teacher_id = (select public.my_teacher_id()) and class_id is not null and public.teaches_class(class_id) and public.student_in_class(student_id, class_id)');
drop function if exists public._sis_policy(text, text, text, text, text);
-- @migration 0002 end

-- ---- table grants: NO anon access; authenticated gets DML (RLS filters), service_role everything ----
revoke all on public.school_years, public.terms, public.subjects, public.teachers, public.classes, public.teaching_assignments,
  public.students, public.guardians, public.student_guardians, public.schedule_slots, public.lessons, public.attendance,
  public.grade_entries, public.term_grades, public.announcements, public.notifications, public.behavior_notes from anon, authenticated;
grant select, insert, update, delete on public.school_years, public.terms, public.subjects, public.teachers, public.classes,
  public.teaching_assignments, public.students, public.guardians, public.student_guardians, public.schedule_slots, public.lessons,
  public.attendance, public.grade_entries, public.term_grades, public.announcements, public.notifications, public.behavior_notes to authenticated;
grant all on public.school_years, public.terms, public.subjects, public.teachers, public.classes, public.teaching_assignments,
  public.students, public.guardians, public.student_guardians, public.schedule_slots, public.lessons, public.attendance,
  public.grade_entries, public.term_grades, public.announcements, public.notifications, public.behavior_notes to service_role;
revoke all on public.school_notification_prefs from anon, authenticated;
grant select, insert, update on public.school_notification_prefs to authenticated;
grant all on public.school_notification_prefs to service_role;

-- @migration 0003 begin
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
-- @migration 0003 end

-- @migration 0004 begin
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
-- @migration 0004 end

-- ---- RPCs ----
grant execute on function public.school_today() to authenticated, service_role;
revoke execute on function public.school_today() from public, anon;

-- mark_attendance_bulk(class, date, lesson_no|null, records [{student_id,status,minutes_late?,note?}]) -> {saved}
create or replace function public.mark_attendance_bulk(p_class uuid, p_date date, p_lesson_no int, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  r jsonb; v_sid uuid; v_status text; v_late int; v_note text; n int := 0;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_class is null or p_date is null or p_records is null or jsonb_typeof(p_records) <> 'array' then raise exception 'invalid_input'; end if;
  if not public.can_manage_class(p_class) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_date > public.school_today() then raise exception 'invalid_date'; end if;
  if not public.is_school_director() and p_date < public.school_today() - 14 then raise exception 'edit_window_closed'; end if;
  if p_lesson_no is not null and p_lesson_no not between 1 and 8 then raise exception 'invalid_input'; end if;
  if jsonb_array_length(p_records) not between 1 and 100 then raise exception 'invalid_input'; end if;
  for r in select * from jsonb_array_elements(p_records) loop
    if jsonb_typeof(r) <> 'object' then raise exception 'invalid_input'; end if;
    begin
      v_sid := (r->>'student_id')::uuid;
      v_late := coalesce(nullif(r->>'minutes_late', '')::int, 0);
    exception when others then raise exception 'invalid_input'; end;
    v_status := r->>'status';
    v_note := nullif(left(coalesce(r->>'note', ''), 200), '');
    if v_status is null or v_status not in ('present','absent','late','excused','sick') then raise exception 'invalid_status'; end if;
    if v_late not between 0 and 240 then raise exception 'invalid_input'; end if;
    if v_status <> 'late' then v_late := 0; end if;
    if not public.student_in_class(v_sid, p_class) then raise exception 'student_not_in_class'; end if;
    insert into public.attendance (student_id, class_id, date, lesson_no, status, minutes_late, note, marked_by, marked_at)
    values (v_sid, p_class, p_date, p_lesson_no, v_status, v_late, v_note, v_uid, now())
    on conflict (student_id, date, (coalesce(lesson_no, 0))) do update
      set status = excluded.status, minutes_late = excluded.minutes_late, note = excluded.note,
          class_id = excluded.class_id, marked_by = excluded.marked_by, marked_at = now();
    n := n + 1;
  end loop;
  insert into public.audit_log (user_id, user_email, action, resource, record_id, diff)
  values (v_uid, (select u.email from auth.users u where u.id = v_uid), 'attendance_bulk', 'attendance', p_class::text,
          jsonb_build_object('date', p_date, 'lesson_no', p_lesson_no, 'count', n));
  return jsonb_build_object('saved', n);
end $$;

-- save_grades_bulk(class, subject, term, entries [{id?,delete?,student_id,date,kind,score,weight?,comment?}]) -> {saved,deleted}
create or replace function public.save_grades_bulk(p_class uuid, p_subject uuid, p_term uuid, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_dir boolean := public.is_school_director();
  v_term public.terms; v_year uuid; v_teacher uuid;
  e jsonb; v_id uuid; v_sid uuid; v_date date; v_kind text; v_score numeric; v_weight numeric; v_comment text;
  n int := 0; d int := 0; k int;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_class is null or p_subject is null or p_term is null or p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'invalid_input'; end if;
  if jsonb_array_length(p_entries) not between 1 and 300 then raise exception 'invalid_input'; end if;
  select * into v_term from public.terms where id = p_term;
  if not found then raise exception 'not_found'; end if;
  select year_id into v_year from public.classes where id = p_class;
  if not found then raise exception 'not_found'; end if;
  if v_term.year_id <> v_year then raise exception 'term_not_in_year'; end if;
  if not (v_dir or public.teaches_subject_class(p_class, p_subject)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_term.is_locked and not v_dir then raise exception 'term_locked'; end if;
  v_teacher := coalesce(public.my_teacher_id(),
    (select a.teacher_id from public.teaching_assignments a where a.class_id = p_class and a.subject_id = p_subject));
  for e in select * from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'invalid_input'; end if;
    begin
      v_id := nullif(e->>'id', '')::uuid;
    exception when others then raise exception 'invalid_input'; end;
    if coalesce((e->>'delete')::boolean, false) then
      if v_id is null then raise exception 'invalid_input'; end if;
      delete from public.grade_entries where id = v_id and class_id = p_class and subject_id = p_subject and term_id = p_term;
      get diagnostics k = row_count;
      if k = 0 then raise exception 'not_found'; end if;
      d := d + 1;
      continue;
    end if;
    begin
      v_sid := (e->>'student_id')::uuid;
      v_date := (e->>'date')::date;
      v_score := (e->>'score')::numeric;
      v_weight := coalesce(nullif(e->>'weight', '')::numeric, 1);
    exception when others then raise exception 'invalid_input'; end;
    v_kind := coalesce(e->>'kind', 'daily');
    v_comment := nullif(left(coalesce(e->>'comment', ''), 300), '');
    if v_kind not in ('daily','quiz','test','exam','homework','term','year') then raise exception 'invalid_kind'; end if;
    if v_score is null or v_score < 1 or v_score > 5 then raise exception 'invalid_score'; end if;
    if v_weight <= 0 or v_weight > 10 then raise exception 'invalid_input'; end if;
    if v_date < v_term.start_date or v_date > v_term.end_date then raise exception 'date_out_of_term'; end if;
    if v_date > public.school_today() then raise exception 'invalid_date'; end if;
    if not public.student_in_class(v_sid, p_class) then raise exception 'student_not_in_class'; end if;
    if v_id is null then
      insert into public.grade_entries (student_id, class_id, subject_id, term_id, date, kind, score, weight, comment, teacher_id)
      values (v_sid, p_class, p_subject, p_term, v_date, v_kind, round(v_score, 1), v_weight, v_comment, v_teacher);
    else
      update public.grade_entries set date = v_date, kind = v_kind, score = round(v_score, 1), weight = v_weight, comment = v_comment
      where id = v_id and class_id = p_class and subject_id = p_subject and term_id = p_term and student_id = v_sid;
      get diagnostics k = row_count;
      if k = 0 then raise exception 'not_found'; end if;
    end if;
    n := n + 1;
  end loop;
  insert into public.audit_log (user_id, user_email, action, resource, record_id, diff)
  values (v_uid, (select u.email from auth.users u where u.id = v_uid), 'grades_bulk', 'grade_entries', p_class::text,
          jsonb_build_object('subject_id', p_subject, 'term_id', p_term, 'saved', n, 'deleted', d));
  return jsonb_build_object('saved', n, 'deleted', d);
end $$;

-- save_term_grades_bulk(class, subject, term, rows [{student_id,value|null,suggested?,override_reason?}]) -> {saved}
create or replace function public.save_term_grades_bulk(p_class uuid, p_subject uuid, p_term uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_dir boolean := public.is_school_director();
  v_term public.terms; v_year uuid; r jsonb; v_sid uuid; v_val int; v_sug numeric; v_reason text; n int := 0;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_class is null or p_subject is null or p_term is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input'; end if;
  if jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'invalid_input'; end if;
  select * into v_term from public.terms where id = p_term;
  if not found then raise exception 'not_found'; end if;
  select year_id into v_year from public.classes where id = p_class;
  if not found or v_term.year_id <> v_year then raise exception 'term_not_in_year'; end if;
  if not (v_dir or public.teaches_subject_class(p_class, p_subject)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_term.is_locked and not v_dir then raise exception 'term_locked'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_sid := (r->>'student_id')::uuid;
      v_val := nullif(r->>'value', '')::int;
      v_sug := nullif(r->>'suggested', '')::numeric;
    exception when others then raise exception 'invalid_input'; end;
    if v_val is not null and v_val not between 1 and 5 then raise exception 'invalid_score'; end if;
    if v_sug is not null and v_sug not between 1 and 5 then raise exception 'invalid_score'; end if;
    if not public.student_in_class(v_sid, p_class) then raise exception 'student_not_in_class'; end if;
    -- the reason only makes sense for a confirmed value; cleared grades drop it
    v_reason := case when v_val is null then null else nullif(left(btrim(coalesce(r->>'override_reason', '')), 300), '') end;
    insert into public.term_grades (student_id, subject_id, term_id, class_id, value, suggested, is_confirmed, confirmed_by, override_reason, updated_at)
    values (v_sid, p_subject, p_term, p_class, v_val, v_sug, v_val is not null, case when v_val is not null then v_uid end, v_reason, now())
    on conflict (student_id, subject_id, term_id) do update
      set value = excluded.value, suggested = excluded.suggested, is_confirmed = excluded.is_confirmed,
          confirmed_by = excluded.confirmed_by, class_id = excluded.class_id, override_reason = excluded.override_reason, updated_at = now();
    n := n + 1;
  end loop;
  insert into public.audit_log (user_id, user_email, action, resource, record_id, diff)
  values (v_uid, (select u.email from auth.users u where u.id = v_uid), 'term_grades_bulk', 'term_grades', p_class::text,
          jsonb_build_object('subject_id', p_subject, 'term_id', p_term, 'saved', n));
  return jsonb_build_object('saved', n);
end $$;

-- lock_term(term, locked) - directors only
create or replace function public.lock_term(p_term uuid, p_locked boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_school_director() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.terms set is_locked = coalesce(p_locked, false) where id = p_term;
  if not found then raise exception 'not_found'; end if;
  insert into public.audit_log (user_id, user_email, action, resource, record_id, diff)
  values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), case when p_locked then 'lock' else 'unlock' end, 'terms', p_term::text, null);
  return jsonb_build_object('term_id', p_term, 'is_locked', coalesce(p_locked, false));
end $$;

-- attendance_summary(class, from, to) -> [{student_id,present,absent,late,excused,sick,total,percent}]
create or replace function public.attendance_summary(p_class uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.can_view_class(p_class) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'invalid_input'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'student_id') from (
      select jsonb_build_object(
        'student_id', s.id,
        'present', count(a.id) filter (where a.status = 'present'),
        'absent', count(a.id) filter (where a.status = 'absent'),
        'late', count(a.id) filter (where a.status = 'late'),
        'excused', count(a.id) filter (where a.status = 'excused'),
        'sick', count(a.id) filter (where a.status = 'sick'),
        'total', count(a.id),
        'percent', case when count(a.id) = 0 then null
                        else round(100.0 * count(a.id) filter (where a.status in ('present','late')) / count(a.id), 1) end) as x
      from public.students s
      left join public.attendance a on a.student_id = s.id and a.date between p_from and p_to
      where s.class_id = p_class and s.status = 'active' and public.can_view_student(s.id)
      group by s.id) q), '[]'::jsonb);
end $$;

-- student_performance(student, year) -> {overall_avg, terms[], subjects[], attendance{}}
create or replace function public.student_performance(p_student uuid, p_year uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_start date; v_end date;
begin
  if auth.uid() is null or not public.can_view_student(p_student) then raise exception 'forbidden' using errcode = '42501'; end if;
  select start_date, end_date into v_start, v_end from public.school_years where id = p_year;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'student_id', p_student, 'year_id', p_year,
    'overall_avg', (select round(sum(g.score * g.weight) / nullif(sum(g.weight), 0), 2)
                    from public.grade_entries g join public.terms t on t.id = g.term_id
                    where g.student_id = p_student and t.year_id = p_year and g.kind not in ('term','year')),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('term_id', t.id, 'number', t.number, 'avg', a.avg, 'count', a.n) order by t.number)
                       from public.terms t
                       left join lateral (select round(sum(g.score * g.weight) / nullif(sum(g.weight), 0), 2) as avg, count(*) as n
                                          from public.grade_entries g
                                          where g.student_id = p_student and g.term_id = t.id and g.kind not in ('term','year')) a on true
                       where t.year_id = p_year), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('subject_id', x.subject_id, 'avg', x.avg, 'count', x.n))
                          from (select g.subject_id, round(sum(g.score * g.weight) / nullif(sum(g.weight), 0), 2) as avg, count(*) as n
                                from public.grade_entries g join public.terms t on t.id = g.term_id
                                where g.student_id = p_student and t.year_id = p_year and g.kind not in ('term','year')
                                group by g.subject_id) x), '[]'::jsonb),
    'attendance', (select jsonb_build_object(
        'present', count(*) filter (where status = 'present'), 'absent', count(*) filter (where status = 'absent'),
        'late', count(*) filter (where status = 'late'), 'excused', count(*) filter (where status = 'excused'),
        'sick', count(*) filter (where status = 'sick'), 'total', count(*))
      from public.attendance where student_id = p_student and date between v_start and v_end));
end $$;

-- class_journal(class, subject, term) -> {students[], entries[], lessons[]}
create or replace function public.class_journal(p_class uuid, p_subject uuid, p_term uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null
     or not (public.is_school_director() or public.teaches_subject_class(p_class, p_subject)
             or exists (select 1 from public.classes c where c.id = p_class and c.homeroom_teacher_id is not null and c.homeroom_teacher_id = public.my_teacher_id())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'last_name', s.last_name, 'first_name', s.first_name) order by s.last_name, s.first_name)
                          from public.students s where s.class_id = p_class and s.status = 'active'), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(g) order by g.date, g.created_at)
                         from public.grade_entries g where g.class_id = p_class and g.subject_id = p_subject and g.term_id = p_term), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(l) order by l.date, l.lesson_no)
                         from public.lessons l, public.terms t
                         where t.id = p_term and l.class_id = p_class and l.subject_id = p_subject and l.date between t.start_date and t.end_date), '[]'::jsonb));
end $$;

-- function privileges: authenticated + service_role only (never anon / PUBLIC)
revoke execute on function
  public.is_school_director(), public.is_school_staff(), public.my_teacher_id(), public.my_children(), public.my_student_ids(),
  public.teaches_class(uuid), public.teaches_subject_class(uuid, uuid), public.can_manage_class(uuid), public.can_view_class(uuid),
  public.can_view_student(uuid), public.student_in_class(uuid, uuid), public.announcement_visible(text, uuid, timestamptz),
  public.sis_guard_term_lock(),
  public.mark_attendance_bulk(uuid, date, int, jsonb), public.save_grades_bulk(uuid, uuid, uuid, jsonb),
  public.save_term_grades_bulk(uuid, uuid, uuid, jsonb), public.lock_term(uuid, boolean),
  public.attendance_summary(uuid, date, date), public.student_performance(uuid, uuid), public.class_journal(uuid, uuid, uuid)
  from public, anon;
grant execute on function
  public.is_school_director(), public.is_school_staff(), public.my_teacher_id(), public.my_children(), public.my_student_ids(),
  public.teaches_class(uuid), public.teaches_subject_class(uuid, uuid), public.can_manage_class(uuid), public.can_view_class(uuid),
  public.can_view_student(uuid), public.student_in_class(uuid, uuid), public.announcement_visible(text, uuid, timestamptz),
  public.mark_attendance_bulk(uuid, date, int, jsonb), public.save_grades_bulk(uuid, uuid, uuid, jsonb),
  public.save_term_grades_bulk(uuid, uuid, uuid, jsonb), public.lock_term(uuid, boolean),
  public.attendance_summary(uuid, date, date), public.student_performance(uuid, uuid), public.class_journal(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.sis_guard_term_lock() to service_role;

-- =====================================================================
-- SECTION: HARDENING (integrity, performance, privileges)  -- migration 0002
-- Everything in this section is idempotent and re-runnable. The regions marked
-- "@migration 0002" in this file (here and in a few places above) are exported by
-- scripts/db/split.mjs to supabase/migrations/0002_hardening.sql, the upgrade path for databases
-- that were created from the original 0001_init.sql. New constraints are added NOT VALID so legacy
-- rows never block the upgrade; they are enforced for every new/updated row.
--
-- RLS note: ENABLE ROW LEVEL SECURITY is applied to every public table (sweep below). FORCE ROW LEVEL
-- SECURITY is deliberately NOT used: SECURITY DEFINER RPCs run as the table owner and are the only writer of
-- several tables (attempts, submissions, rate_limits, audit_log); FORCE would block them, and service_role
-- bypasses RLS by design. Access control for the owner role is the function EXECUTE matrix below.
-- =====================================================================
-- @migration 0002 begin

-- ---- temp helpers (dropped at the end of this section) ----
create or replace function public._hd_con(p_table text, p_name text, p_def text)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from pg_constraint c where c.conrelid = format('public.%I', p_table)::regclass and c.conname = p_name) then
    return;
  end if;
  execute format('alter table public.%I add constraint %I %s', p_table, p_name, p_def);
exception when others then
  raise notice 'hardening: constraint %.% skipped (%)', p_table, p_name, sqlerrm;
end $$;

-- foreign key with an explicit ON DELETE rule (recreated only when the rule differs)
create or replace function public._hd_fk(p_table text, p_col text, p_ref text, p_ondelete text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare v_old text; v_cur "char"; v_want "char";
begin
  v_want := case p_ondelete when 'cascade' then 'c' when 'set null' then 'n' when 'restrict' then 'r' else 'a' end;
  select c.conname, c.confdeltype into v_old, v_cur
  from pg_constraint c
  where c.conrelid = format('public.%I', p_table)::regclass and c.contype = 'f'
    and c.conkey = array[(select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = p_col)];
  if v_cur = v_want then return; end if;
  if v_old is not null then
    execute format('alter table public.%I drop constraint %I', p_table, v_old);
  end if;
  execute format('alter table public.%I add constraint %I foreign key (%I) references %s(id) on delete %s not valid',
                 p_table, p_table || '_' || p_col || '_fkey', p_col, p_ref, p_ondelete);
  begin
    execute format('alter table public.%I validate constraint %I', p_table, p_table || '_' || p_col || '_fkey');
  exception when others then
    raise notice 'hardening: %.% has orphan rows, FK stays NOT VALID (%)', p_table, p_col, sqlerrm;
  end;
exception when others then
  raise notice 'hardening: FK %.% skipped (%)', p_table, p_col, sqlerrm;
end $$;

-- index that may fail on legacy duplicates (unique indexes): report instead of aborting the upgrade
create or replace function public._hd_idx(p_sql text)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  execute p_sql;
exception when others then
  raise notice 'hardening: index skipped (%): %', sqlerrm, p_sql;
end $$;

-- ---- columns ----
alter table public.schedule_slots add column if not exists updated_at timestamptz not null default now();
alter table public.teaching_assignments add column if not exists updated_at timestamptz not null default now();

-- updated_at trigger on every public table that has the column (same loop as above; picks up the new columns)
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
      and c.table_name in (select table_name from information_schema.tables
                           where table_schema='public' and table_type='BASE TABLE')
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---- CHECK constraints (NOT VALID: enforced for new/updated rows) ----
select public._hd_con('profiles', 'profiles_text_len_chk',
  'check (char_length(full_name) <= 200 and (phone is null or char_length(phone) <= 30) and (avatar_url is null or char_length(avatar_url) <= 500)) not valid');
select public._hd_con('olympiads', 'olympiads_dates_chk', 'check (registration_deadline <= event_date) not valid');
select public._hd_con('olympiads', 'olympiads_grades_chk',
  'check (cardinality(eligible_grades) between 1 and 11 and eligible_grades <@ array[1,2,3,4,5,6,7,8,9,10,11]) not valid');
select public._hd_con('olympiad_registrations', 'olympiad_registrations_score_chk', 'check (score is null or score <= max_score) not valid');
select public._hd_con('olympiad_registrations', 'olympiad_registrations_birth_chk', $c$check (birth_date >= date '1990-01-01') not valid$c$);
select public._hd_con('academic_quiz_attempts', 'academic_quiz_attempts_counts_chk',
  'check (total_questions >= 0 and correct_answers between 0 and total_questions) not valid');
select public._hd_con('academic_questions', 'academic_questions_shape_chk',
  'check (points <= 100 and char_length(correct_option_id) between 1 and 40) not valid');
select public._hd_con('academic_quizzes', 'academic_quizzes_subject_chk', 'check (char_length(subject_key) between 1 and 60) not valid');
select public._hd_con('rate_limits', 'rate_limits_hits_chk', 'check (hits >= 0) not valid');
select public._hd_con('attendance', 'attendance_late_chk', $c$check (status = 'late' or minutes_late = 0) not valid$c$);
select public._hd_con('term_grades', 'term_grades_confirmed_chk', 'check (not is_confirmed or value is not null) not valid');
select public._hd_con('teachers', 'teachers_subjects_chk', 'check (cardinality(subjects) <= 50) not valid');
select public._hd_con('survey_responses', 'survey_responses_answers_chk', $c$check (jsonb_typeof(answers) = 'object') not valid$c$);
select public._hd_con('brain_games', 'brain_games_slug_chk', $c$check (game_slug ~ '^[a-z0-9-]{1,40}$') not valid$c$);

-- jsonb shape: localized columns are objects, list columns are arrays
do $$
declare v text;
begin
  foreach v in array array['programs.title','campus_life.title','staff_members.full_name','student_achievements.achievement_title',
    'olympiads.title','academic_quizzes.title','psych_tests.title','brain_games.title','surveys.title','subjects.name',
    'school_years.grading_rules','brain_games.config','site_settings.social_links']
  loop
    perform public._hd_con(split_part(v, '.', 1), split_part(v, '.', 1) || '_' || split_part(v, '.', 2) || '_obj_chk',
      format($f$check (jsonb_typeof(%I) = 'object') not valid$f$, split_part(v, '.', 2)));
  end loop;
  foreach v in array array['programs.subjects','olympiads.subjects','site_settings.stats']
  loop
    perform public._hd_con(split_part(v, '.', 1), split_part(v, '.', 1) || '_' || split_part(v, '.', 2) || '_arr_chk',
      format($f$check (jsonb_typeof(%I) = 'array') not valid$f$, split_part(v, '.', 2)));
  end loop;
  -- URL columns: bounded and no script-capable schemes (rendered as <img src> / <a href> / <iframe src>)
  foreach v in array array['site_settings.hero_video_url','site_settings.hero_image_url','site_settings.map_embed_url',
    'site_settings.virtual_tour_url','programs.cover_image_url','staff_members.photo_url','staff_members.intro_video_url',
    'student_achievements.photo_url','student_achievements.certificate_url','olympiads.cover_image_url',
    'academic_questions.question_image_url','psych_tests.cover_image_url','psych_questions.question_image_url',
    'profiles.avatar_url','students.photo_url','olympiad_registrations.certificate_pdf_url']
  loop
    perform public._hd_con(split_part(v, '.', 1), split_part(v, '.', 1) || '_' || split_part(v, '.', 2) || '_url_chk',
      format($f$check (%1$I is null or (char_length(%1$I) <= 1000 and %1$I !~* %2$L)) not valid$f$,
             split_part(v, '.', 2), '^\s*(javascript|data|vbscript):'));
  end loop;
end $$;

-- ---- foreign keys: explicit ON DELETE rules ----
-- user references: keep the history row, forget the user
select public._hd_fk('attendance', 'marked_by', 'auth.users', 'set null');
select public._hd_fk('term_grades', 'confirmed_by', 'auth.users', 'set null');
select public._hd_fk('announcements', 'author_id', 'auth.users', 'set null');
-- academic history is never wiped by deleting its parent (class / subject / term): delete the grades first on purpose.
-- (deleting a STUDENT still removes that student's own records - right to erasure)
select public._hd_fk('grade_entries', 'class_id', 'public.classes', 'restrict');
select public._hd_fk('grade_entries', 'subject_id', 'public.subjects', 'restrict');
select public._hd_fk('grade_entries', 'term_id', 'public.terms', 'restrict');
select public._hd_fk('term_grades', 'class_id', 'public.classes', 'restrict');
select public._hd_fk('term_grades', 'subject_id', 'public.subjects', 'restrict');
select public._hd_fk('term_grades', 'term_id', 'public.terms', 'restrict');
select public._hd_fk('attendance', 'class_id', 'public.classes', 'restrict');

-- ---- triggers: data-integrity guards ----
-- audit_log is append-only (rows leave only through purge_old_data retention)
create or replace function public.audit_log_block_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'audit_log_immutable' using errcode = '42501';
end $$;
drop trigger if exists trg_audit_log_immutable on public.audit_log;
create trigger trg_audit_log_immutable before update on public.audit_log
  for each row execute function public.audit_log_block_update();

-- the site_settings singleton cannot be deleted by a signed-in user (service role / SQL can)
create or replace function public.site_settings_block_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return old;
end $$;
drop trigger if exists trg_site_settings_no_delete on public.site_settings;
create trigger trg_site_settings_no_delete before delete on public.site_settings
  for each row execute function public.site_settings_block_delete();

-- quiz / psych / survey question options: well-formed, unique ids, a correct answer that exists
create or replace function public.validate_question_options()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare o jsonb; ids text[] := '{}'; v_need int := 0;
begin
  -- choice questions of a survey need >= 2 options; other survey types carry none. (type is read through
  -- to_jsonb(new) because this one function serves three tables with different columns)
  if tg_table_name = 'survey_questions' and (to_jsonb(new) ->> 'type') not in ('single','multiple') then
    return new;
  end if;
  v_need := 2;
  if jsonb_typeof(new.options) is distinct from 'array' or jsonb_array_length(new.options) not between v_need and 20 then
    raise exception 'invalid_options' using errcode = '23514';
  end if;
  for o in select e.value from jsonb_array_elements(new.options) as e(value) loop
    if jsonb_typeof(o) <> 'object' or jsonb_typeof(o->'id') is distinct from 'string'
       or char_length(o->>'id') not between 1 and 40 or (o->>'id') = any(ids) then
      raise exception 'invalid_options' using errcode = '23514';
    end if;
    if tg_table_name = 'psych_questions' and o ? 'score' and (o->>'score') !~ '^-?[0-9]{1,6}(\.[0-9]{1,4})?$' then
      raise exception 'invalid_option_score' using errcode = '23514';
    end if;
    ids := ids || (o->>'id');
  end loop;
  if tg_table_name = 'academic_questions' and not ((to_jsonb(new) ->> 'correct_option_id') = any(ids)) then
    raise exception 'correct_option_missing' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_academic_questions_options on public.academic_questions;
create trigger trg_academic_questions_options before insert or update of options, correct_option_id on public.academic_questions
  for each row execute function public.validate_question_options();
drop trigger if exists trg_psych_questions_options on public.psych_questions;
create trigger trg_psych_questions_options before insert or update of options on public.psych_questions
  for each row execute function public.validate_question_options();
drop trigger if exists trg_survey_questions_options on public.survey_questions;
create trigger trg_survey_questions_options before insert or update of options, type on public.survey_questions
  for each row execute function public.validate_question_options();

-- a grade belongs to a term of the SAME school year as its class, and a daily mark to a date inside that term
create or replace function public.sis_validate_grade_scope()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_term public.terms; v_year uuid; v_date date;
begin
  -- the same function serves grade_entries (has a date) and term_grades (has none): read it dynamically
  v_date := case when tg_table_name = 'grade_entries' then (to_jsonb(new) ->> 'date')::date end;
  if tg_op = 'UPDATE' and new.term_id = old.term_id and new.class_id = old.class_id
     and v_date is not distinct from (case when tg_table_name = 'grade_entries' then (to_jsonb(old) ->> 'date')::date end) then
    return new;
  end if;
  select * into v_term from public.terms where id = new.term_id;
  select c.year_id into v_year from public.classes c where c.id = new.class_id;
  if v_term.id is null or v_year is null or v_term.year_id <> v_year then
    raise exception 'term_not_in_year' using errcode = '23514';
  end if;
  if v_date is not null and (v_date < v_term.start_date or v_date > v_term.end_date) then
    raise exception 'date_out_of_term' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_grade_entries_scope on public.grade_entries;
create trigger trg_grade_entries_scope before insert or update on public.grade_entries
  for each row execute function public.sis_validate_grade_scope();
drop trigger if exists trg_term_grades_scope on public.term_grades;
create trigger trg_term_grades_scope before insert or update on public.term_grades
  for each row execute function public.sis_validate_grade_scope();

-- a term lies inside its school year
create or replace function public.sis_validate_term()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare y public.school_years;
begin
  select * into y from public.school_years where id = new.year_id;
  if y.id is not null and (new.start_date < y.start_date or new.end_date > y.end_date) then
    raise exception 'term_outside_year' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_terms_in_year on public.terms;
create trigger trg_terms_in_year before insert or update of year_id, start_date, end_date on public.terms
  for each row execute function public.sis_validate_term();

-- ---- unique constraints that may meet legacy duplicates (reported, never fatal) ----
select public._hd_idx('create unique index if not exists student_guardians_one_primary_uq on public.student_guardians(student_id) where is_primary');
select public._hd_idx('create unique index if not exists psych_result_scales_test_min_uq on public.psych_result_scales(psych_test_id, min_score)');
select public._hd_idx('create unique index if not exists classes_year_name_uq on public.classes(year_id, lower(name))');
select public._hd_idx('create unique index if not exists students_identity_uq on public.students(lower(btrim(last_name)), lower(btrim(first_name)), lower(btrim(coalesce(middle_name, ''''))), birth_date) where birth_date is not null and status = ''active''');

-- ---- indexes: FK columns, common filters/sorts, partial indexes ----
-- redundant (a longer index with the same leading column(s) exists)
drop index if exists public.olympiad_registrations_olympiad_idx;   -- covered by (olympiad_id, status) and the dedupe index
drop index if exists public.site_visits_created_idx;               -- covered by (created_at, path)
-- olympiads / registrations
create index if not exists olympiad_registrations_created_idx on public.olympiad_registrations(olympiad_id, created_at desc);
create index if not exists olympiad_registrations_phone_recent_idx on public.olympiad_registrations(parent_phone, created_at desc);
create index if not exists psych_test_submissions_scale_idx on public.psych_test_submissions(matched_scale_id) where matched_scale_id is not null;
-- SIS foreign keys + filters
create index if not exists students_name_idx on public.students(last_name, first_name);
create index if not exists teaching_assignments_subject_idx on public.teaching_assignments(subject_id);
create index if not exists classes_homeroom_idx on public.classes(homeroom_teacher_id) where homeroom_teacher_id is not null;
create index if not exists schedule_slots_subject_idx on public.schedule_slots(subject_id);
create index if not exists lessons_slot_idx on public.lessons(slot_id) where slot_id is not null;
create index if not exists lessons_subject_idx on public.lessons(subject_id);
create index if not exists lessons_teacher_date_idx on public.lessons(teacher_id, date) where teacher_id is not null;
create index if not exists attendance_date_status_idx on public.attendance(date, status);
create index if not exists attendance_marked_by_idx on public.attendance(marked_by) where marked_by is not null;
create index if not exists grade_entries_term_idx on public.grade_entries(term_id);
create index if not exists grade_entries_subject_idx on public.grade_entries(subject_id);
create index if not exists grade_entries_teacher_idx on public.grade_entries(teacher_id) where teacher_id is not null;
create index if not exists term_grades_journal_idx on public.term_grades(class_id, subject_id, term_id);
create index if not exists term_grades_term_idx on public.term_grades(term_id);
create index if not exists term_grades_subject_idx on public.term_grades(subject_id);
create index if not exists term_grades_confirmed_by_idx on public.term_grades(confirmed_by) where confirmed_by is not null;
create index if not exists announcements_class_idx on public.announcements(class_id) where class_id is not null;
create index if not exists announcements_author_idx on public.announcements(author_id) where author_id is not null;
create index if not exists notifications_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists behavior_notes_class_idx on public.behavior_notes(class_id) where class_id is not null;
create index if not exists behavior_notes_teacher_idx on public.behavior_notes(teacher_id) where teacher_id is not null;
create index if not exists audit_log_record_idx on public.audit_log(resource, record_id, created_at desc) where record_id is not null;

-- ---- retention schedule (daily 03:17) when pg_cron is installed; otherwise run purge_old_data() from any scheduler ----
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'maktab-purge-old-data') then
      perform cron.schedule('maktab-purge-old-data', '17 3 * * *', 'select public.purge_old_data()');
    end if;
  end if;
exception when others then
  raise notice 'hardening: pg_cron schedule skipped (%): run select public.purge_old_data() daily from your scheduler', sqlerrm;
end $$;

-- ---- RLS sweep: every table in public has row level security enabled ----
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
  loop
    raise notice 'hardening: enabling RLS on public.%', r.relname;
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end $$;

-- ---- pin search_path on every function in public (SECURITY DEFINER or not) ----
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c = 'search_path=public, pg_temp')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- ---- default privileges: future tables / sequences / functions are NOT handed to anon / authenticated ----
do $$
begin
  alter default privileges in schema public revoke all on tables from anon, authenticated;
  alter default privileges in schema public revoke all on sequences from anon, authenticated;
  alter default privileges in schema public revoke execute on functions from anon, authenticated;
exception when others then
  raise notice 'hardening: default privileges not changed (%)', sqlerrm;
end $$;

-- ---- TABLE privileges: the authoritative matrix (RLS still filters rows) ----
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
-- anon: read-only public content (published rows only, see the *_read policies)
grant select on public.site_settings, public.programs, public.campus_life, public.staff_members,
  public.student_achievements, public.olympiads, public.academic_quizzes, public.psych_tests,
  public.brain_games, public.game_leaderboard to anon;
-- authenticated (staff / school members): everything below is further limited by the RLS policies
grant select, insert, update, delete on public.site_settings, public.programs, public.campus_life, public.staff_members,
  public.student_achievements, public.olympiads, public.olympiad_registrations, public.academic_quizzes, public.academic_questions,
  public.psych_tests, public.psych_questions, public.psych_result_scales, public.brain_games, public.surveys,
  public.survey_questions, public.game_content_sets to authenticated;
grant select, update, delete on public.game_leaderboard, public.admission_applications to authenticated;
-- written only by SECURITY DEFINER RPCs / the service role: staff may read and purge them
grant select, delete on public.academic_quiz_attempts, public.psych_test_submissions, public.survey_responses, public.site_visits to authenticated;
grant select on public.audit_log to authenticated;
grant select, update, delete on public.profiles to authenticated;   -- rows are created by the auth trigger only
grant select, insert, update, delete on public.school_years, public.terms, public.subjects, public.teachers, public.classes,
  public.teaching_assignments, public.students, public.guardians, public.student_guardians, public.schedule_slots, public.lessons,
  public.attendance, public.grade_entries, public.term_grades, public.announcements, public.behavior_notes to authenticated;
grant select, insert, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;     -- users only mark their notifications read
grant select, insert, update on public.school_notification_prefs to authenticated;
-- rate_limits: no client access at all
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---- FUNCTION privileges: the authoritative EXECUTE matrix ----
do $$
declare
  v_anon text[] := array[   -- public RPCs: anon + authenticated (register/submit RPCs are service_role only, see above)
    'get_quiz_questions(uuid)', 'list_quizzes()', 'get_psych_questions(uuid)', 'get_psych_test(uuid)',
    'list_psych_tests()', 'get_leaderboard(text,text,int)',
    'list_surveys()', 'get_survey(uuid)', 'list_game_sets(text)', 'get_game_set(uuid)', 'start_content_round(uuid,int)'];
  v_auth text[] := array[   -- signed-in users only (RLS helpers, CHECK helpers, SIS RPCs)
    'has_role(text[])', 'is_admin()', 'survey_stats(uuid,timestamptz,timestamptz)',
    '_gc_loc_ok(jsonb)', '_gc_loc_opt_ok(jsonb)', 'validate_game_items(text,jsonb)', 'school_today()',
    'is_school_director()', 'is_school_staff()', 'my_teacher_id()', 'my_children()', 'my_student_ids()',
    'teaches_class(uuid)', 'teaches_subject_class(uuid,uuid)', 'can_manage_class(uuid)', 'can_view_class(uuid)',
    'can_view_student(uuid)', 'student_in_class(uuid,uuid)', 'announcement_visible(text,uuid,timestamptz)',
    'mark_attendance_bulk(uuid,date,int,jsonb)', 'save_grades_bulk(uuid,uuid,uuid,jsonb)',
    'save_term_grades_bulk(uuid,uuid,uuid,jsonb)', 'lock_term(uuid,boolean)', 'attendance_summary(uuid,date,date)',
    'student_performance(uuid,uuid)', 'class_journal(uuid,uuid,uuid)'];
  s text; f regprocedure;
begin
  revoke all on all functions in schema public from public, anon, authenticated;
  foreach s in array v_anon loop
    f := to_regprocedure('public.' || s);
    if f is null then raise exception 'hardening: unknown function %', s; end if;
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach s in array v_auth loop
    f := to_regprocedure('public.' || s);
    if f is null then raise exception 'hardening: unknown function %', s; end if;
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- everything else (internal helpers, trigger functions, check_olympiad_result, olympiad_leaderboard, rate_limit_hit,
  -- purge_old_data, submit_survey_response, check_content_answer, ...): service_role only
  grant execute on all functions in schema public to service_role;
end $$;

drop function if exists public._hd_con(text, text, text);
drop function if exists public._hd_fk(text, text, text, text);
drop function if exists public._hd_idx(text);
-- @migration 0002 end

-- =====================================================================
-- SEED DATA (idempotent: fixed ids + bare ON CONFLICT DO NOTHING, i.e. ANY unique violation - id, slug,
-- section key, "one current school year" - skips the row instead of aborting the run)
-- Demo content only, no real people: names, phones (+998 71 200 00 00) and e-mail (info@example.com) are fictional.
-- Re-running this file re-creates demo rows an editor deleted; skip seed.sql in production
-- (`supabase db push` applies migrations only; seed.sql runs on `supabase db reset` / manual execution).
-- Uzbek uses the proper modifier letter (U+02BB) so no quote escaping is needed.
-- =====================================================================
create or replace function public._l(uz text, ru text, en text)
returns jsonb language sql immutable as $$ select jsonb_build_object('uz', uz, 'ru', ru, 'en', en) $$;
create or replace function public._n(v text)
returns jsonb language sql immutable as $$ select public._l(v, v, v) $$;
create or replace function public._id(n int)
returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Site settings
insert into public.site_settings (
  id, school_name, hero_title, hero_subtitle, about_mission, about_vision, about_history, stats,
  address, landmark, phones, email, working_hours, map_lat, map_lng, social_links
) values (
  1,
  public._l('Children''s Academy Group Termez xususiy maktabi', 'Частная школа «Children''s Academy Group Termez»', 'Children''s Academy Group Termez Private School'),
  public._l('Bilim, mehr va kelajak bir joyda', 'Знания, забота и будущее в одном месте', 'Knowledge, care and future in one place'),
  public._l('Bolangizning iqtidorini kashf etadigan zamonaviy xususiy maktab',
            'Современная частная школа, раскрывающая таланты вашего ребёнка',
            'A modern private school that unlocks your child''s talents'),
  public._l('Har bir bolaga individual yondashuv orqali sifatli ta’lim va tarbiya berish.',
            'Давать качественное образование и воспитание через индивидуальный подход к каждому ребёнку.',
            'To give every child quality education and upbringing through an individual approach.'),
  public._l('Oʻzbekistonning eng ishonchli va innovatsion maktablaridan biri boʻlish.',
            'Стать одной из самых надёжных и инновационных школ Узбекистана.',
            'To become one of the most trusted and innovative schools in Uzbekistan.'),
  public._l('Maktabimiz oʻqituvchilar va ota-onalar jamoasi tomonidan zamonaviy ta’lim gʻoyasi asosida tashkil etilgan.',
            'Наша школа основана командой педагогов и родителей на идее современного образования.',
            'Our school was founded by a team of teachers and parents around the idea of modern education.'),
  jsonb_build_array(
    jsonb_build_object('key','students','value',450,'suffix','+','label',public._l('Oʻquvchilar','Учеников','Students')),
    jsonb_build_object('key','teachers','value',45,'suffix','+','label',public._l('Oʻqituvchilar','Учителей','Teachers')),
    jsonb_build_object('key','years','value',12,'suffix','','label',public._l('Yillik tajriba','Лет опыта','Years of experience')),
    jsonb_build_object('key','winners','value',120,'suffix','+','label',public._l('Olimpiada gʻoliblari','Победителей олимпиад','Olympiad winners'))
  ),
  public._l('Toshkent shahri, Yunusobod tumani, Amir Temur koʻchasi 1', 'г. Ташкент, Юнусабадский район, ул. Амира Темура, 1', '1 Amir Temur Street, Yunusabad district, Tashkent'),
  public._l('Amir Temur xiyoboni yaqinida', 'Рядом со сквером Амира Темура', 'Near Amir Temur Square'),
  array['+998 71 200 00 00', '+998 90 123 45 67'],
  'info@example.com',
  public._l('Du-Sha: 08:00 - 18:00', 'Пн-Сб: 08:00 - 18:00', 'Mon-Sat: 08:00 - 18:00'),
  41.3111, 69.2797,
  jsonb_build_object('telegram','','instagram','','youtube','','facebook','')
) on conflict do nothing;

-- Programs
insert into public.programs (id, category, grade_range, title, short_description, full_content, subjects, icon_name, sort_order) values
 (public._id(1), 'primary', '1-4',
  public._l('Boshlangʻich sinflar', 'Начальная школа', 'Primary school'),
  public._l('Oʻqish, yozish va hisoblashning mustahkam poydevori.', 'Прочный фундамент чтения, письма и счёта.', 'A solid foundation in reading, writing and numeracy.'),
  public._l('1-4 sinflarda bolalar oʻyin orqali oʻrganadi: ona tili, matematika, ingliz tili, tabiatshunoslik va ijodiy mashgʻulotlar.', 'В 1-4 классах дети учатся через игру: родной язык, математика, английский, природоведение и творчество.', 'In grades 1-4 children learn through play: native language, maths, English, nature studies and creative activities.'),
  jsonb_build_array(
    jsonb_build_object('key','math','name',public._l('Matematika','Математика','Mathematics')),
    jsonb_build_object('key','english','name',public._l('Ingliz tili','Английский язык','English')),
    jsonb_build_object('key','native','name',public._l('Ona tili','Родной язык','Native language'))),
  'baby', 1),
 (public._id(2), 'middle', '5-9',
  public._l('Oʻrta sinflar', 'Средняя школа', 'Middle school'),
  public._l('Fanlarni chuqur oʻrganish va tanqidiy fikrlash.', 'Углублённое изучение предметов и критическое мышление.', 'In-depth subjects and critical thinking.'),
  public._l('5-9 sinflarda STEM yoʻnalishi, chet tillari, informatika va loyiha ishlari ustuvor.', 'В 5-9 классах приоритет у STEM, иностранных языков, информатики и проектной работы.', 'Grades 5-9 focus on STEM, foreign languages, informatics and project work.'),
  jsonb_build_array(
    jsonb_build_object('key','algebra','name',public._l('Algebra','Алгебра','Algebra')),
    jsonb_build_object('key','informatics','name',public._l('Informatika','Информатика','Informatics')),
    jsonb_build_object('key','science','name',public._l('Tabiiy fanlar','Естественные науки','Natural sciences'))),
  'rocket', 2),
 (public._id(3), 'high', '10-11',
  public._l('Yuqori sinflar', 'Старшая школа', 'High school'),
  public._l('Universitetga tayyorgarlik va kasbga yoʻnaltirish.', 'Подготовка к университету и профориентация.', 'University preparation and career guidance.'),
  public._l('10-11 sinflarda chuqurlashtirilgan tayyorgarlik, IELTS/SAT kurslari va kasbga yoʻnaltirish.', 'В 10-11 классах углублённая подготовка, курсы IELTS/SAT и профориентация.', 'Grades 10-11 offer advanced preparation, IELTS/SAT courses and career guidance.'),
  jsonb_build_array(
    jsonb_build_object('key','ielts','name',public._l('IELTS tayyorlov','Подготовка к IELTS','IELTS preparation')),
    jsonb_build_object('key','physics','name',public._l('Fizika','Физика','Physics')),
    jsonb_build_object('key','economics','name',public._l('Iqtisodiyot','Экономика','Economics'))),
  'graduation-cap', 3)
on conflict do nothing;

-- Campus life
insert into public.campus_life (id, section_key, title, description, extra_data, sort_order) values
 (public._id(11), 'kitchen',
  public._l('Maktab oshxonasi', 'Школьная столовая', 'School kitchen'),
  public._l('Kuniga 3 mahal sifatli va foydali ovqat, allergiyalar hisobga olinadi.', 'Трёхразовое качественное и полезное питание с учётом аллергий.', 'Three nutritious meals a day, allergies taken into account.'),
  jsonb_build_object('meals_per_day', 3), 1),
 (public._id(12), 'security',
  public._l('Xavfsizlik', 'Безопасность', 'Security'),
  public._l('24/7 qoʻriqlash, videokuzatuv va turniket tizimi.', 'Круглосуточная охрана, видеонаблюдение и система турникетов.', '24/7 guards, CCTV and turnstile access control.'),
  jsonb_build_object('cctv', true), 2),
 (public._id(13), 'transport',
  public._l('Maktab transporti', 'Школьный транспорт', 'School transport'),
  public._l('Shahar boʻylab qulay avtobus marshrutlari, GPS orqali kuzatuv.', 'Удобные автобусные маршруты по городу с GPS-отслеживанием.', 'Convenient bus routes across the city with GPS tracking.'),
  jsonb_build_object('routes', 8), 3),
 (public._id(14), 'schedule',
  public._l('Kun tartibi', 'Распорядок дня', 'Daily schedule'),
  public._l('Dars, ijodiy toʻgaraklar va dam olish muvozanati.', 'Баланс уроков, кружков и отдыха.', 'A balance of lessons, clubs and rest.'),
  jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('time','08:30','label',public._l('Darslar boshlanishi','Начало уроков','Lessons start')),
    jsonb_build_object('time','12:30','label',public._l('Tushlik','Обед','Lunch')),
    jsonb_build_object('time','14:00','label',public._l('Toʻgaraklar','Кружки','Clubs')),
    jsonb_build_object('time','17:00','label',public._l('Uyga qaytish','Возвращение домой','Going home')))), 4)
on conflict do nothing;

-- Staff (6)
insert into public.staff_members (id, is_administration, full_name, position, subject_key, bio, experience_years, sort_order) values
 (public._id(21), true,  public._l('Dilnoza Karimova','Дильноза Каримова','Dilnoza Karimova'), public._l('Maktab direktori','Директор школы','School director'), null,
  public._l('Taʼlim boshqaruvi boʻyicha 15 yillik tajriba.','15 лет опыта в управлении образованием.','15 years in education management.'), 15, 1),
 (public._id(22), true,  public._l('Rustam Aliyev','Рустам Алиев','Rustam Aliyev'), public._l('Oʻquv ishlari boʻyicha direktor oʻrinbosari','Заместитель директора по учебной работе','Deputy director for academics'), null,
  public._l('Metodist, innovatsion taʼlim dasturlari muallifi.','Методист, автор инновационных программ.','Methodologist, author of innovative programs.'), 12, 2),
 (public._id(23), false, public._l('Malika Yusupova','Малика Юсупова','Malika Yusupova'), public._l('Matematika oʻqituvchisi','Учитель математики','Mathematics teacher'), 'math',
  public._l('Respublika olimpiadalari tayyorlovchisi.','Тренер республиканских олимпиад.','Coach of national olympiads.'), 9, 3),
 (public._id(24), false, public._l('Jasur Tursunov','Жасур Турсунов','Jasur Tursunov'), public._l('Ingliz tili oʻqituvchisi','Учитель английского языка','English teacher'), 'english',
  public._l('IELTS 8.0, CELTA sertifikati.','IELTS 8.0, сертификат CELTA.','IELTS 8.0, CELTA certified.'), 7, 4),
 (public._id(25), false, public._l('Nigora Rahimova','Нигора Рахимова','Nigora Rahimova'), public._l('Boshlangʻich sinf oʻqituvchisi','Учитель начальных классов','Primary teacher'), 'primary',
  public._l('Bolalar bilan ishlashda 11 yillik tajriba.','11 лет опыта работы с детьми.','11 years of experience working with children.'), 11, 5),
 (public._id(26), false, public._l('Sherzod Normatov','Шерзод Норматов','Sherzod Normatov'), public._l('Informatika oʻqituvchisi','Учитель информатики','Informatics teacher'), 'informatics',
  public._l('Robototexnika va dasturlash toʻgaraklari rahbari.','Руководитель кружков робототехники и программирования.','Head of robotics and coding clubs.'), 6, 6)
on conflict do nothing;

-- Achievements (4)
insert into public.student_achievements (id, student_name, grade_or_grad_year, achievement_title, description, university_accepted, category, sort_order) values
 (public._id(31), public._l('Aziza Qodirova','Азиза Кодирова','Aziza Kodirova'), '9',
  public._l('Respublika matematika olimpiadasi — 1-oʻrin','Республиканская олимпиада по математике — 1 место','National Math Olympiad — 1st place'),
  public._l('Aziza respublika bosqichida mutlaq gʻolib boʻldi.','Азиза стала абсолютной победительницей республиканского этапа.','Aziza won the national round outright.'), null, 'olympiad', 1),
 (public._id(32), public._l('Bekzod Ismoilov','Бекзод Исмоилов','Bekzod Ismoilov'), '2024',
  public._l('Bitiruvchi — Westminster universiteti','Выпускник — Вестминстерский университет','Graduate — Westminster University'),
  public._l('Grant asosida oʻqishga qabul qilindi.','Принят на грант.','Accepted with a scholarship.'),
  public._l('Westminster xalqaro universiteti, Toshkent','Международный Вестминстерский университет в Ташкенте','Westminster International University in Tashkent'), 'graduate', 2),
 (public._id(33), public._l('Sevinch Abdullayeva','Севинч Абдуллаева','Sevinch Abdullayeva'), '7',
  public._l('Shahmat boʻyicha shahar chempioni','Чемпионка города по шахматам','City chess champion'),
  public._l('Yoshlar oʻrtasida shahar turnirida gʻalaba.','Победа в городском турнире среди юниоров.','Won the city junior tournament.'), null, 'sport', 3),
 (public._id(34), public._l('Omar Hasanov','Омар Хасанов','Omar Hasanov'), '5',
  public._l('Xalqaro rassomlik tanlovi — Gran-pri','Международный конкурс рисунка — Гран-при','International art contest — Grand Prix'),
  public._l('"Mening ona yurtim" mavzusidagi tanlov gʻolibi.','Победитель конкурса на тему «Моя родина».','Winner of the "My Homeland" contest.'), null, 'art', 4)
on conflict do nothing;

-- Olympiad (date = now()+14d)
insert into public.olympiads (id, title, description, rules, subjects, eligible_grades, event_date, registration_deadline, location, is_registration_open) values
 (public._id(41),
  public._l('Children''s Academy ochiq olimpiadasi','Открытая олимпиада Children''s Academy','Children''s Academy Open Olympiad'),
  public._l('Barcha maktab oʻquvchilari uchun ochiq intellektual musobaqa.','Открытое интеллектуальное соревнование для школьников.','An open intellectual competition for all school students.'),
  public._l('Ruxsatnoma va pasport/guvohnoma bilan keling. Telefon taqiqlanadi.','Приходите с пропуском и документом. Телефоны запрещены.','Bring your pass and ID. Phones are not allowed.'),
  jsonb_build_array(
    jsonb_build_object('key','math','name',public._l('Matematika','Математика','Mathematics')),
    jsonb_build_object('key','english','name',public._l('Ingliz tili','Английский язык','English')),
    jsonb_build_object('key','science','name',public._l('Tabiiy fanlar','Естественные науки','Natural sciences'))),
  '{1,2,3,4,5,6,7,8,9,10,11}',
  now() + interval '14 days', now() + interval '10 days',
  public._l('Children''s Academy, katta zal','Children''s Academy, большой зал','Children''s Academy, main hall'), true)
on conflict do nothing;

-- Quizzes (2 x 5)
insert into public.academic_quizzes (id, title, description, subject_key, subject_name, grade, difficulty, duration_minutes, passing_score_percent) values
 (public._id(51), public._l('Matematika: 5-sinf sinov testi','Математика: пробный тест 5 класс','Maths: grade 5 practice test'),
  public._l('Asosiy amallar va geometriya.','Основные действия и геометрия.','Core operations and geometry.'),
  'math', public._l('Matematika','Математика','Mathematics'), 5, 'easy', 10, 60),
 (public._id(52), public._l('Tabiiy fanlar: 4-sinf viktorinasi','Естествознание: викторина 4 класс','Science: grade 4 quiz'),
  public._l('Quyosh tizimi, suv va oʻsimliklar.','Солнечная система, вода и растения.','Solar system, water and plants.'),
  'science', public._l('Tabiiy fanlar','Естественные науки','Natural sciences'), 4, 'easy', 10, 60)
on conflict do nothing;

insert into public.academic_questions (id, quiz_id, question_text, options, correct_option_id, explanation, points, sort_order) values
 (public._id(101), public._id(51), public._l('12 × 8 = ?','12 × 8 = ?','12 × 8 = ?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('86')),jsonb_build_object('id','B','text',public._n('96')),jsonb_build_object('id','C','text',public._n('108')),jsonb_build_object('id','D','text',public._n('88'))),
  'B', public._l('12 × 8 = 96.','12 × 8 = 96.','12 × 8 = 96.'), 1, 1),
 (public._id(102), public._id(51), public._l('100 ning 3/4 qismi nechaga teng?','Чему равны 3/4 от 100?','What is 3/4 of 100?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('25')),jsonb_build_object('id','B','text',public._n('50')),jsonb_build_object('id','C','text',public._n('75')),jsonb_build_object('id','D','text',public._n('80'))),
  'C', public._l('100 : 4 × 3 = 75.','100 : 4 × 3 = 75.','100 ÷ 4 × 3 = 75.'), 1, 2),
 (public._id(103), public._id(51), public._l('Tomoni 7 sm boʻlgan kvadratning perimetri?','Периметр квадрата со стороной 7 см?','Perimeter of a square with side 7 cm?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._l('14 sm','14 см','14 cm')),jsonb_build_object('id','B','text',public._l('21 sm','21 см','21 cm')),jsonb_build_object('id','C','text',public._l('28 sm','28 см','28 cm')),jsonb_build_object('id','D','text',public._l('49 sm','49 см','49 cm'))),
  'C', public._l('P = 4 × 7 = 28 sm.','P = 4 × 7 = 28 см.','P = 4 × 7 = 28 cm.'), 1, 3),
 (public._id(104), public._id(51), public._l('144 : 12 = ?','144 : 12 = ?','144 ÷ 12 = ?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('10')),jsonb_build_object('id','B','text',public._n('11')),jsonb_build_object('id','C','text',public._n('12')),jsonb_build_object('id','D','text',public._n('14'))),
  'C', public._l('12 × 12 = 144.','12 × 12 = 144.','12 × 12 = 144.'), 1, 4),
 (public._id(105), public._id(51), public._l('Eng kichik tub son qaysi?','Какое наименьшее простое число?','Which is the smallest prime number?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('0')),jsonb_build_object('id','B','text',public._n('1')),jsonb_build_object('id','C','text',public._n('2')),jsonb_build_object('id','D','text',public._n('3'))),
  'C', public._l('2 — eng kichik tub son.','2 — наименьшее простое число.','2 is the smallest prime number.'), 1, 5),

 (public._id(111), public._id(52), public._l('Quyoshga eng yaqin sayyora qaysi?','Какая планета ближе всего к Солнцу?','Which planet is closest to the Sun?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._l('Venera','Венера','Venus')),jsonb_build_object('id','B','text',public._l('Merkuriy','Меркурий','Mercury')),jsonb_build_object('id','C','text',public._l('Mars','Марс','Mars')),jsonb_build_object('id','D','text',public._l('Yer','Земля','Earth'))),
  'B', public._l('Merkuriy Quyoshga eng yaqin.','Меркурий ближе всех к Солнцу.','Mercury is the closest to the Sun.'), 1, 1),
 (public._id(112), public._id(52), public._l('Suv necha daraja Selsiyda qaynaydi?','При скольких градусах Цельсия кипит вода?','At what Celsius temperature does water boil?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('50')),jsonb_build_object('id','B','text',public._n('90')),jsonb_build_object('id','C','text',public._n('100')),jsonb_build_object('id','D','text',public._n('120'))),
  'C', public._l('Normal bosimda suv 100 °C da qaynaydi.','При нормальном давлении вода кипит при 100 °C.','At normal pressure water boils at 100 °C.'), 1, 2),
 (public._id(113), public._id(52), public._l('Yerda nechta qitʼa bor?','Сколько континентов на Земле?','How many continents are there?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._n('5')),jsonb_build_object('id','B','text',public._n('6')),jsonb_build_object('id','C','text',public._n('7')),jsonb_build_object('id','D','text',public._n('8'))),
  'C', public._l('Yettita qitʼa mavjud.','Существует семь континентов.','There are seven continents.'), 1, 3),
 (public._id(114), public._id(52), public._l('Eng katta okean qaysi?','Какой океан самый большой?','Which is the largest ocean?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._l('Atlantika','Атлантический','Atlantic')),jsonb_build_object('id','B','text',public._l('Hind','Индийский','Indian')),jsonb_build_object('id','C','text',public._l('Tinch','Тихий','Pacific')),jsonb_build_object('id','D','text',public._l('Shimoliy Muz','Северный Ледовитый','Arctic'))),
  'C', public._l('Tinch okeani eng katta.','Тихий океан — самый большой.','The Pacific is the largest.'), 1, 4),
 (public._id(115), public._id(52), public._l('Oʻsimliklar nafas olishda qaysi gazni yutadi?','Какой газ поглощают растения при фотосинтезе?','Which gas do plants absorb during photosynthesis?'),
  jsonb_build_array(jsonb_build_object('id','A','text',public._l('Kislorod','Кислород','Oxygen')),jsonb_build_object('id','B','text',public._l('Karbonat angidrid','Углекислый газ','Carbon dioxide')),jsonb_build_object('id','C','text',public._l('Azot','Азот','Nitrogen')),jsonb_build_object('id','D','text',public._l('Vodorod','Водород','Hydrogen'))),
  'B', public._l('Fotosintezda CO₂ yutiladi.','При фотосинтезе поглощается CO₂.','CO₂ is absorbed in photosynthesis.'), 1, 5)
on conflict do nothing;

-- Psych tests (2) with scales
insert into public.psych_tests (id, title, description, instruction, target_audience, topic) values
 (public._id(61), public._l('Maktab xavotiri testi','Тест школьной тревожности','School anxiety check'),
  public._l('Maktabdagi hissiyotlarni baholovchi qisqa test.','Короткий тест на оценку школьных переживаний.','A short test about feelings at school.'),
  public._l('Har bir savolga samimiy javob bering — notoʻgʻri javob yoʻq.','Отвечайте честно — неправильных ответов нет.','Answer honestly — there are no wrong answers.'), 'kids', 'emotional'),
 (public._id(62), public._l('Oʻqishga motivatsiya','Мотивация к учёбе','Motivation to learn'),
  public._l('Oʻqishga qiziqish darajasini aniqlaydi.','Определяет уровень интереса к учёбе.','Finds out how motivated the student is.'),
  public._l('Eng mos variantni tanlang.','Выберите наиболее подходящий вариант.','Choose the best fitting option.'), 'teens', 'interests')
on conflict do nothing;

insert into public.psych_questions (id, psych_test_id, question_text, options, sort_order)
select qid, tid, qt, opts, so from (values
  (public._id(201), public._id(61), public._l('Dars oldidan hayajonlanaman.','Я волнуюсь перед уроком.','I feel nervous before lessons.'), 1),
  (public._id(202), public._id(61), public._l('Doskaga chaqirilsam, qoʻrqaman.','Я боюсь, когда меня вызывают к доске.','I am afraid when called to the board.'), 2),
  (public._id(203), public._id(61), public._l('Baholar haqida koʻp tashvishlanaman.','Я сильно переживаю из-за оценок.','I worry a lot about grades.'), 3),
  (public._id(204), public._id(61), public._l('Tunda maktab haqida oʻylab uxlay olmayman.','Ночью я не могу уснуть из-за мыслей о школе.','I cannot sleep thinking about school.'), 4)
) as v(qid, tid, qt, so)
cross join lateral (select jsonb_build_array(
  jsonb_build_object('id','A','text',public._l('Hech qachon','Никогда','Never'),'score',0),
  jsonb_build_object('id','B','text',public._l('Ba’zan','Иногда','Sometimes'),'score',1),
  jsonb_build_object('id','C','text',public._l('Koʻpincha','Часто','Often'),'score',2),
  jsonb_build_object('id','D','text',public._l('Doim','Всегда','Always'),'score',3)) as opts) o
on conflict do nothing;

insert into public.psych_questions (id, psych_test_id, question_text, options, sort_order)
select qid, tid, qt, opts, so from (values
  (public._id(211), public._id(62), public._l('Yangi narsalarni oʻrganish menga yoqadi.','Мне нравится узнавать новое.','I enjoy learning new things.'), 1),
  (public._id(212), public._id(62), public._l('Uy vazifasini oʻz xohishim bilan bajaraman.','Я делаю домашнее задание по своей воле.','I do homework willingly.'), 2),
  (public._id(213), public._id(62), public._l('Qiyin masalalarda taslim boʻlmayman.','Я не сдаюсь на сложных задачах.','I do not give up on hard tasks.'), 3),
  (public._id(214), public._id(62), public._l('Kelajak kasbim haqida oʻylayman.','Я думаю о будущей профессии.','I think about my future career.'), 4)
) as v(qid, tid, qt, so)
cross join lateral (select jsonb_build_array(
  jsonb_build_object('id','A','text',public._l('Kamdan-kam','Редко','Rarely'),'score',1),
  jsonb_build_object('id','B','text',public._l('Ba’zan','Иногда','Sometimes'),'score',2),
  jsonb_build_object('id','C','text',public._l('Koʻpincha','Часто','Often'),'score',3)) as opts) o
on conflict do nothing;

insert into public.psych_result_scales (id, psych_test_id, min_score, max_score, result_title, psychological_analysis, recommendations_for_parents, badge_color) values
 (public._id(301), public._id(61), 0, 3, public._l('Past xavotir','Низкая тревожность','Low anxiety'),
  public._l('Bola maktabda oʻzini xotirjam his qiladi.','Ребёнок спокойно чувствует себя в школе.','The child feels calm at school.'),
  public._l('Qoʻllab-quvvatlashda davom eting va muvaffaqiyatlarni nishonlang.','Продолжайте поддерживать и отмечайте успехи.','Keep supporting and celebrate successes.'), '#22c55e'),
 (public._id(302), public._id(61), 4, 8, public._l('Oʻrtacha xavotir','Умеренная тревожность','Moderate anxiety'),
  public._l('Ba’zi vaziyatlarda xavotir sezilmoqda.','В некоторых ситуациях заметна тревога.','Some situations cause worry.'),
  public._l('Bola bilan ochiq suhbatlashing, kun tartibini barqaror qiling.','Откровенно разговаривайте с ребёнком, наладьте режим дня.','Talk openly with your child and keep a steady routine.'), '#f59e0b'),
 (public._id(303), public._id(61), 9, 12, public._l('Yuqori xavotir','Высокая тревожность','High anxiety'),
  public._l('Xavotir darajasi yuqori, mutaxassis maslahati foydali.','Уровень тревоги высокий, полезна консультация специалиста.','Anxiety is high; a specialist consultation would help.'),
  public._l('Maktab psixologiga murojaat qiling, bosimni kamaytiring.','Обратитесь к школьному психологу, снизьте давление.','Contact the school psychologist and reduce pressure.'), '#ef4444'),
 (public._id(311), public._id(62), 4, 6, public._l('Motivatsiya past','Низкая мотивация','Low motivation'),
  public._l('Oʻqishga qiziqish hozircha past.','Интерес к учёбе пока невысокий.','Interest in learning is currently low.'),
  public._l('Bolaning qiziqishlarini oʻqish bilan bogʻlang.','Свяжите увлечения ребёнка с учёбой.','Connect your child''s hobbies to learning.'), '#f59e0b'),
 (public._id(312), public._id(62), 7, 9, public._l('Motivatsiya oʻrtacha','Средняя мотивация','Moderate motivation'),
  public._l('Qiziqish bor, lekin barqaror emas.','Интерес есть, но он нестабилен.','There is interest but it is not stable.'),
  public._l('Kichik maqsadlar qoʻying va maqtang.','Ставьте небольшие цели и хвалите.','Set small goals and praise progress.'), '#3b82f6'),
 (public._id(313), public._id(62), 10, 12, public._l('Motivatsiya yuqori','Высокая мотивация','High motivation'),
  public._l('Bola oʻqishga juda qiziqadi.','Ребёнок очень увлечён учёбой.','The child is highly motivated.'),
  public._l('Qoʻshimcha loyihalar va olimpiadalarni taklif qiling.','Предложите дополнительные проекты и олимпиады.','Offer extra projects and olympiads.'), '#22c55e')
on conflict do nothing;

-- Brain games (5)
insert into public.brain_games (id, game_slug, title, description, how_to_play, cognitive_skill, icon_name, config, sort_order) values
 (public._id(71), 'schulte-table',
  public._l('Shulte jadvali','Таблица Шульте','Schulte table'),
  public._l('Raqamlarni tartib bilan tez toping.','Быстро находите числа по порядку.','Find numbers in order as fast as you can.'),
  public._l('1 dan boshlab barcha raqamlarni ketma-ket bosing.','Нажимайте числа подряд, начиная с 1.','Tap all numbers in order starting from 1.'),
  public._l('Diqqat va periferik koʻrish','Внимание и периферическое зрение','Attention and peripheral vision'), 'grid-3x3',
  '{"easy":{"grid":4,"time_limit":60,"multiplier":1},"medium":{"grid":5,"time_limit":90,"multiplier":2},"hard":{"grid":6,"time_limit":120,"multiplier":3}}'::jsonb, 1),
 (public._id(72), 'memory-matrix',
  public._l('Xotira matritsasi','Матрица памяти','Memory matrix'),
  public._l('Yonib oʻchgan kataklarni eslab qoling.','Запомните подсвеченные клетки.','Remember the highlighted cells.'),
  public._l('Yorigan kataklarni eslab, keyin ularni bosing.','Запомните подсвеченные клетки и нажмите на них.','Memorise the lit cells then tap them.'),
  public._l('Qisqa muddatli xotira','Кратковременная память','Short-term memory'), 'brain',
  '{"easy":{"grid":3,"time_limit":45,"multiplier":1},"medium":{"grid":4,"time_limit":60,"multiplier":2},"hard":{"grid":5,"time_limit":75,"multiplier":3}}'::jsonb, 2),
 (public._id(73), 'mental-math',
  public._l('Tezkor arifmetika','Устный счёт','Mental math'),
  public._l('Misollarni tez yeching.','Решайте примеры быстро.','Solve sums quickly.'),
  public._l('Vaqt tugaguncha iloji boricha koʻp misol yeching.','Решите как можно больше примеров до конца времени.','Solve as many sums as possible before time runs out.'),
  public._l('Hisoblash tezligi','Скорость счёта','Calculation speed'), 'calculator',
  '{"easy":{"grid":0,"time_limit":60,"multiplier":1},"medium":{"grid":0,"time_limit":60,"multiplier":2},"hard":{"grid":0,"time_limit":60,"multiplier":3}}'::jsonb, 3),
 (public._id(74), 'stroop-test',
  public._l('Stroop testi','Тест Струпа','Stroop test'),
  public._l('Soʻz rangini toping, yozuvni emas.','Выбирайте цвет слова, а не текст.','Pick the colour of the word, not the text.'),
  public._l('Soʻz qanday rangda yozilganini tanlang.','Выберите цвет, которым написано слово.','Choose the colour the word is written in.'),
  public._l('Diqqat va tormozlash nazorati','Внимание и контроль торможения','Attention and inhibition control'), 'palette',
  '{"easy":{"grid":0,"time_limit":45,"multiplier":1},"medium":{"grid":0,"time_limit":45,"multiplier":2},"hard":{"grid":0,"time_limit":45,"multiplier":3}}'::jsonb, 4),
 (public._id(75), 'logic-seq',
  public._l('Mantiqiy ketma-ketlik','Логические последовательности','Logic sequences'),
  public._l('Keyingi raqamni toping.','Найдите следующее число.','Find the next number.'),
  public._l('Ketma-ketlik qonuniyatini aniqlang.','Определите закономерность последовательности.','Work out the pattern of the sequence.'),
  public._l('Mantiqiy fikrlash','Логическое мышление','Logical reasoning'), 'puzzle',
  '{"easy":{"grid":0,"time_limit":90,"multiplier":1},"medium":{"grid":0,"time_limit":90,"multiplier":2},"hard":{"grid":0,"time_limit":90,"multiplier":3}}'::jsonb, 5)
on conflict do nothing;

insert into public.game_leaderboard (id, game_id, player_name, student_grade, difficulty, score, completion_time_ms, accuracy_percent) values
 (public._id(81), public._id(71), 'Aziza', 5, 'easy', 920, 31000, 100),
 (public._id(82), public._id(71), 'Bekzod', 6, 'easy', 840, 36000, 98),
 (public._id(83), public._id(72), 'Sevinch', 4, 'easy', 760, 28000, 95),
 (public._id(84), public._id(73), 'Omar', 7, 'medium', 1300, 60000, 90),
 (public._id(85), public._id(74), 'Malika', 8, 'medium', 1100, 45000, 92),
 (public._id(86), public._id(75), 'Jasur', 9, 'hard', 1500, 80000, 88)
on conflict do nothing;

-- Surveys (2 samples: parents satisfaction, students' interests)
create or replace function public._so(id text, uz text, ru text, en text)
returns jsonb language sql immutable as $$ select jsonb_build_object('id', id, 'text', public._l(uz, ru, en)) $$;

insert into public.surveys (id, title, description, audience, is_anonymous, allow_multiple_responses) values
 (public._id(401),
  public._l('Ota-onalar mamnunligi soʻrovnomasi', 'Опрос удовлетворённости родителей', 'Parent satisfaction survey'),
  public._l('Fikringiz maktabni yaxshilashga yordam beradi. Soʻrovnoma anonim, 2 daqiqa vaqt oladi.',
            'Ваше мнение помогает нам улучшать школу. Опрос анонимный и занимает 2 минуты.',
            'Your opinion helps us improve the school. The survey is anonymous and takes 2 minutes.'),
  'parents', true, false),
 (public._id(402),
  public._l('Oʻquvchilar qiziqishlari soʻrovi', 'Опрос интересов учеников', 'Students'' interests poll'),
  public._l('Sizga nima qiziq? Toʻgaraklar va tadbirlarni sizning fikringiz bilan rejalashtiramiz.',
            'Что вам интересно? Мы планируем кружки и мероприятия с учётом вашего мнения.',
            'What are you into? We plan clubs and events with your input.'),
  'students', true, false)
on conflict do nothing;

insert into public.survey_questions (id, survey_id, type, question_text, options, scale_min, scale_max, scale_min_label, scale_max_label, required, sort_order) values
 (public._id(411), public._id(401), 'scale',
  public._l('Umuman olganda, maktabdan qanchalik mamnunsiz?', 'В целом, насколько вы довольны школой?', 'Overall, how satisfied are you with the school?'),
  '[]'::jsonb, 1, 5,
  public._l('Umuman mamnun emasman', 'Совсем не доволен', 'Not satisfied at all'), public._l('Juda mamnunman', 'Очень доволен', 'Very satisfied'), true, 1),
 (public._id(412), public._id(401), 'single',
  public._l('Maktab haqida qayerdan bilib oldingiz?', 'Как вы узнали о школе?', 'How did you hear about the school?'),
  jsonb_build_array(
    public._so('A', 'Doʻstlar yoki tanishlardan', 'От друзей или знакомых', 'Friends or acquaintances'),
    public._so('B', 'Ijtimoiy tarmoqlardan', 'Из социальных сетей', 'Social media'),
    public._so('C', 'Reklamadan', 'Из рекламы', 'Advertising'),
    public._so('D', 'Boshqa', 'Другое', 'Other')),
  1, 5, public._n(''), public._n(''), true, 2),
 (public._id(413), public._id(401), 'multiple',
  public._l('Quyidagilardan qaysilari siz uchun eng muhim?', 'Что для вас важнее всего?', 'Which of these matter most to you?'),
  jsonb_build_array(
    public._so('A', 'Sifatli taʼlim', 'Качественное образование', 'Quality of teaching'),
    public._so('B', 'Xavfsizlik', 'Безопасность', 'Safety'),
    public._so('C', 'Ovqatlanish', 'Питание', 'Meals'),
    public._so('D', 'Maktab transporti', 'Школьный транспорт', 'School transport'),
    public._so('E', 'Toʻgaraklar', 'Кружки', 'Clubs'),
    public._so('F', 'Ingliz tili', 'Английский язык', 'English language')),
  1, 5, public._n(''), public._n(''), true, 3),
 (public._id(414), public._id(401), 'scale',
  public._l('Oʻqituvchilar bilan aloqa qanchalik qulay?', 'Насколько удобно общение с учителями?', 'How easy is it to communicate with teachers?'),
  '[]'::jsonb, 1, 5, public._l('Qiyin', 'Сложно', 'Difficult'), public._l('Juda qulay', 'Очень удобно', 'Very easy'), true, 4),
 (public._id(415), public._id(401), 'yesno',
  public._l('Maktabni boshqa ota-onalarga tavsiya qilasizmi?', 'Порекомендуете ли вы школу другим родителям?', 'Would you recommend the school to other parents?'),
  '[]'::jsonb, 1, 5, public._n(''), public._n(''), true, 5),
 (public._id(416), public._id(401), 'text',
  public._l('Maktabni yaxshilash boʻyicha takliflaringiz?', 'Ваши предложения по улучшению школы?', 'Any suggestions to improve the school?'),
  '[]'::jsonb, 1, 5, public._n(''), public._n(''), false, 6),

 (public._id(421), public._id(402), 'multiple',
  public._l('Qaysi fanlar sizga yoqadi?', 'Какие предметы вам нравятся?', 'Which subjects do you like?'),
  jsonb_build_array(
    public._so('A', 'Matematika', 'Математика', 'Maths'),
    public._so('B', 'Ingliz tili', 'Английский язык', 'English'),
    public._so('C', 'Tabiiy fanlar', 'Естественные науки', 'Science'),
    public._so('D', 'Tasviriy sanʼat', 'Рисование', 'Art'),
    public._so('E', 'Jismoniy tarbiya', 'Физкультура', 'Sport'),
    public._so('F', 'Informatika', 'Информатика', 'Computer science')),
  1, 5, public._n(''), public._n(''), true, 1),
 (public._id(422), public._id(402), 'single',
  public._l('Qaysi toʻgarakka qatnashgan boʻlardingiz?', 'В какой кружок вы бы пошли?', 'Which club would you join?'),
  jsonb_build_array(
    public._so('A', 'Robototexnika', 'Робототехника', 'Robotics'),
    public._so('B', 'Rassomlik', 'Рисование', 'Art'),
    public._so('C', 'Sport', 'Спорт', 'Sport'),
    public._so('D', 'Musiqa', 'Музыка', 'Music'),
    public._so('E', 'Shaxmat', 'Шахматы', 'Chess')),
  1, 5, public._n(''), public._n(''), true, 2),
 (public._id(423), public._id(402), 'scale',
  public._l('Maktabda oʻzingizni qanday his qilasiz?', 'Как вы себя чувствуете в школе?', 'How do you feel at school?'),
  '[]'::jsonb, 1, 5, public._l('Yoqmaydi', 'Не нравится', 'I don''t like it'), public._l('Juda yoqadi', 'Очень нравится', 'I love it'), true, 3),
 (public._id(424), public._id(402), 'yesno',
  public._l('Koʻproq ekskursiyalar boʻlishini xohlaysizmi?', 'Хотите больше экскурсий?', 'Do you want more field trips?'),
  '[]'::jsonb, 1, 5, public._n(''), public._n(''), true, 4),
 (public._id(425), public._id(402), 'text',
  public._l('Qanday yangi toʻgarak yoki tadbir qoʻshgan boʻlardingiz?', 'Какой новый кружок или мероприятие вы бы добавили?', 'What new club or event would you add?'),
  '[]'::jsonb, 1, 5, public._n(''), public._n(''), false, 5)
on conflict do nothing;
drop function if exists public._so(text, text, text, text);

-- ---- seed: school management reference data (year, 4 terms, 12 subjects, 14 classes). People, schedule,
--      attendance and grades for the DEMO are generated deterministically by lib/school/demo-data.ts (same ids). ----
-- is_current only when no other year is current (unique partial index), terms/classes only when their year exists
insert into public.school_years (id, name, start_date, end_date, is_current)
select public._id(9001), '2026-2027', date '2026-09-01', date '2027-05-31', not exists (select 1 from public.school_years where is_current)
on conflict do nothing;
insert into public.terms (id, year_id, number, name, start_date, end_date)
select v.* from (values
 (public._id(9011), public._id(9001), 1, '1-chorak', date '2026-09-01', date '2026-11-02'),
 (public._id(9012), public._id(9001), 2, '2-chorak', date '2026-11-10', date '2026-12-28'),
 (public._id(9013), public._id(9001), 3, '3-chorak', date '2027-01-11', date '2027-03-15'),
 (public._id(9014), public._id(9001), 4, '4-chorak', date '2027-03-24', date '2027-05-26')
) as v(id, year_id, number, name, start_date, end_date)
where exists (select 1 from public.school_years y where y.id = v.year_id)
on conflict do nothing;
insert into public.subjects (id, name, short, sort_order) values
 (public._id(9101), public._l('Ona tili va adabiyot', 'Родной язык и литература', 'Native language & literature'), 'Ona', 1),
 (public._id(9102), public._l('Rus tili', 'Русский язык', 'Russian'), 'Rus', 2),
 (public._id(9103), public._l('Ingliz tili', 'Английский язык', 'English'), 'Ing', 3),
 (public._id(9104), public._l('Matematika', 'Математика', 'Mathematics'), 'Mat', 4),
 (public._id(9105), public._l('Fizika', 'Физика', 'Physics'), 'Fiz', 5),
 (public._id(9106), public._l('Kimyo', 'Химия', 'Chemistry'), 'Kim', 6),
 (public._id(9107), public._l('Biologiya', 'Биология', 'Biology'), 'Bio', 7),
 (public._id(9108), public._l('Tarix', 'История', 'History'), 'Tar', 8),
 (public._id(9109), public._l('Geografiya', 'География', 'Geography'), 'Geo', 9),
 (public._id(9110), public._l('Informatika', 'Информатика', 'Computer science'), 'Inf', 10),
 (public._id(9111), public._l('Jismoniy tarbiya', 'Физкультура', 'Physical education'), 'JT', 11),
 (public._id(9112), public._l('Tasviriy san''at', 'ИЗО', 'Art'), 'San', 12)
on conflict do nothing;
insert into public.classes (id, year_id, grade, letter, name, room)
select v.* from (values
 (public._id(9201), public._id(9001), 1, 'A', '1A', '101'), (public._id(9202), public._id(9001), 1, 'B', '1B', '102'),
 (public._id(9203), public._id(9001), 2, 'A', '2A', '103'), (public._id(9204), public._id(9001), 2, 'B', '2B', '104'),
 (public._id(9205), public._id(9001), 3, 'A', '3A', '105'), (public._id(9206), public._id(9001), 3, 'B', '3B', '106'),
 (public._id(9207), public._id(9001), 4, 'A', '4A', '201'), (public._id(9208), public._id(9001), 5, 'A', '5A', '202'),
 (public._id(9209), public._id(9001), 6, 'A', '6A', '203'), (public._id(9210), public._id(9001), 7, 'A', '7A', '204'),
 (public._id(9211), public._id(9001), 8, 'A', '8A', '301'), (public._id(9212), public._id(9001), 9, 'A', '9A', '302'),
 (public._id(9213), public._id(9001), 10, 'A', '10A', '303'), (public._id(9214), public._id(9001), 11, 'A', '11A', '304')
) as v(id, year_id, grade, letter, name, room)
where exists (select 1 from public.school_years y where y.id = v.year_id)
on conflict do nothing;

-- Cleanup seed helpers + policy helper
drop function if exists public._l(text, text, text);
drop function if exists public._n(text);
drop function if exists public._id(int);
drop function if exists public._mk_policies(text, text, text);

-- ---- seed: the three games (leaderboard rows reference brain_games) ----
insert into public.brain_games (id, game_slug, title, description, how_to_play, cognitive_skill, icon_name, config, sort_order) values
 ('00000000-0000-4000-8000-00000000b001', 'matching-pairs',
  '{"uz":"Juftlikni top","ru":"Найди пару","en":"Matching pairs"}'::jsonb,
  '{"uz":"Atama va ta’rifni, so‘z va tarjimani juftlang.","ru":"Соединяйте термины с определениями, слова с переводами.","en":"Match terms with definitions and words with translations."}'::jsonb,
  '{"uz":"Mavzu to‘plamini tanlang. Kartalarni oching yoki mos juftlarni ulang. Xatolar ballni kamaytiradi, tezlik oshiradi.","ru":"Выберите набор. Переворачивайте карточки или соединяйте пары. Ошибки снижают очки, скорость повышает.","en":"Pick a set. Flip cards or connect the matching items. Mistakes cost points, speed earns them."}'::jsonb,
  '{"uz":"Xotira va bilim","ru":"Память и знания","en":"Memory & knowledge"}'::jsonb, 'layers',
  '{"easy":{"grid":6,"time_limit":120,"multiplier":1},"medium":{"grid":8,"time_limit":150,"multiplier":1.5},"hard":{"grid":12,"time_limit":180,"multiplier":2}}'::jsonb, 6),
 ('00000000-0000-4000-8000-00000000b002', 'true-false',
  '{"uz":"To‘g‘ri yoki noto‘g‘ri","ru":"Верно или неверно","en":"True or false"}'::jsonb,
  '{"uz":"Tasdiqni tez baholang, kombo to‘plang.","ru":"Быстро оценивайте утверждения и копите комбо.","en":"Judge statements fast and build a combo."}'::jsonb,
  '{"uz":"To‘plamni tanlang. Har bir tasdiq to‘g‘ri yoki noto‘g‘riligini tez belgilang. Xato javob jonni olib qo‘yadi.","ru":"Выберите набор. Быстро отмечайте, верно ли утверждение. Ошибка отнимает жизнь.","en":"Pick a set. Quickly mark each statement true or false. A wrong answer costs a life."}'::jsonb,
  '{"uz":"Tezkor qaror qabul qilish","ru":"Быстрое принятие решений","en":"Quick judgement"}'::jsonb, 'check',
  '{"easy":{"grid":3,"time_limit":60,"multiplier":1},"medium":{"grid":3,"time_limit":60,"multiplier":1.5},"hard":{"grid":2,"time_limit":60,"multiplier":2}}'::jsonb, 7),
 ('00000000-0000-4000-8000-00000000b003', 'quiz-race',
  '{"uz":"Viktorina poygasi","ru":"Гонка викторины","en":"Quiz race"}'::jsonb,
  '{"uz":"Savolga vaqt tugamasdan javob bering, yordamchilardan foydalaning.","ru":"Отвечайте до конца времени и используйте подсказки.","en":"Answer before the countdown ends and use your lifelines."}'::jsonb,
  '{"uz":"Har bir savolga cheklangan vaqt beriladi. 3 ta yordam: 50/50, o‘tkazib yuborish, +vaqt.","ru":"На каждый вопрос ограничено время. 3 подсказки: 50/50, пропуск, +время.","en":"Each question has a countdown. Three lifelines: 50/50, skip and +time."}'::jsonb,
  '{"uz":"Bilim va tezlik","ru":"Знания и скорость","en":"Knowledge & speed"}'::jsonb, 'flag',
  '{"easy":{"grid":8,"time_limit":20,"multiplier":1},"medium":{"grid":10,"time_limit":15,"multiplier":1.5},"hard":{"grid":12,"time_limit":10,"multiplier":2}}'::jsonb, 8)
on conflict do nothing;

-- ---- seed: content sets (same data as components/games/content-seed.json, used by demo mode) ----
insert into public.game_content_sets (id, game_type, title, description, subject_key, grade, difficulty, items, sort_order) values
 ('00000000-0000-4000-8000-00000000c001', 'matching', $j${"uz":"Ingliz–o'zbek lug'ati: kundalik so'zlar","ru":"Англо-узбекский словарь: повседневные слова","en":"English–Uzbek vocabulary: everyday words"}$j$::jsonb, $j${"uz":"Ingliz so'zini o'zbekcha tarjimasi bilan juftlang.","ru":"Соедините английское слово с его узбекским переводом.","en":"Match each English word with its Uzbek translation."}$j$::jsonb, 'english', 3, 'easy', $j$[{"id":"p1","left":{"uz":"apple","ru":"apple","en":"apple"},"right":{"uz":"olma","ru":"olma","en":"olma"}},{"id":"p2","left":{"uz":"book","ru":"book","en":"book"},"right":{"uz":"kitob","ru":"kitob","en":"kitob"}},{"id":"p3","left":{"uz":"water","ru":"water","en":"water"},"right":{"uz":"suv","ru":"suv","en":"suv"}},{"id":"p4","left":{"uz":"house","ru":"house","en":"house"},"right":{"uz":"uy","ru":"uy","en":"uy"}},{"id":"p5","left":{"uz":"friend","ru":"friend","en":"friend"},"right":{"uz":"do'st","ru":"do'st","en":"do'st"}},{"id":"p6","left":{"uz":"school","ru":"school","en":"school"},"right":{"uz":"maktab","ru":"maktab","en":"maktab"}},{"id":"p7","left":{"uz":"bread","ru":"bread","en":"bread"},"right":{"uz":"non","ru":"non","en":"non"}},{"id":"p8","left":{"uz":"sun","ru":"sun","en":"sun"},"right":{"uz":"quyosh","ru":"quyosh","en":"quyosh"}},{"id":"p9","left":{"uz":"teacher","ru":"teacher","en":"teacher"},"right":{"uz":"o'qituvchi","ru":"o'qituvchi","en":"o'qituvchi"}},{"id":"p10","left":{"uz":"cat","ru":"cat","en":"cat"},"right":{"uz":"mushuk","ru":"mushuk","en":"mushuk"}}]$j$::jsonb, 1),
 ('00000000-0000-4000-8000-00000000c002', 'matching', $j${"uz":"Tabiiy fanlar: atama va ta'rif","ru":"Естествознание: термин и определение","en":"Science: term and definition"}$j$::jsonb, $j${"uz":"Fan atamalarini ularning ta'rifi bilan juftlang.","ru":"Соедините научные термины с их определениями.","en":"Match science terms with their definitions."}$j$::jsonb, 'science', 5, 'medium', $j$[{"id":"p1","left":{"uz":"Fotosintez","ru":"Фотосинтез","en":"Photosynthesis"},"right":{"uz":"O'simliklarning yorug'likda oziq modda hosil qilishi","ru":"Образование растениями питательных веществ на свету","en":"Plants making food from light"}},{"id":"p2","left":{"uz":"Gravitatsiya","ru":"Гравитация","en":"Gravity"},"right":{"uz":"Jismlarning bir-biriga tortilish kuchi","ru":"Сила притяжения тел друг к другу","en":"The force that pulls objects together"}},{"id":"p3","left":{"uz":"Ekotizim","ru":"Экосистема","en":"Ecosystem"},"right":{"uz":"Tirik organizmlar va ularning yashash muhiti birligi","ru":"Единство живых организмов и среды их обитания","en":"Living things and the environment they share"}},{"id":"p4","left":{"uz":"Bug'lanish","ru":"Испарение","en":"Evaporation"},"right":{"uz":"Suyuqlikning gazga aylanishi","ru":"Превращение жидкости в газ","en":"A liquid turning into a gas"}},{"id":"p5","left":{"uz":"Atom","ru":"Атом","en":"Atom"},"right":{"uz":"Kimyoviy elementning eng kichik zarrasi","ru":"Мельчайшая частица химического элемента","en":"The smallest particle of a chemical element"}},{"id":"p6","left":{"uz":"Energiya","ru":"Энергия","en":"Energy"},"right":{"uz":"Ish bajarish qobiliyati","ru":"Способность совершать работу","en":"The ability to do work"}},{"id":"p7","left":{"uz":"Yashash muhiti","ru":"Среда обитания","en":"Habitat"},"right":{"uz":"Jonzot yashaydigan tabiiy joy","ru":"Природное место, где живёт организм","en":"The natural home of an organism"}},{"id":"p8","left":{"uz":"Mineral","ru":"Минерал","en":"Mineral"},"right":{"uz":"Tabiiy hosil bo'lgan bir jinsli qattiq modda","ru":"Природное однородное твёрдое вещество","en":"A naturally formed, uniform solid substance"}}]$j$::jsonb, 2),
 ('00000000-0000-4000-8000-00000000c003', 'true_false', $j${"uz":"Geografiya: to'g'ri yoki noto'g'ri?","ru":"География: верно или неверно?","en":"Geography: true or false?"}$j$::jsonb, $j${"uz":"Dunyo va O'zbekiston geografiyasi bo'yicha tezkor savollar.","ru":"Быстрые вопросы по географии мира и Узбекистана.","en":"Quick questions on world and Uzbekistan geography."}$j$::jsonb, 'geography', 5, 'easy', $j$[{"id":"s1","statement":{"uz":"Toshkent — O'zbekistonning poytaxti.","ru":"Ташкент — столица Узбекистана.","en":"Tashkent is the capital of Uzbekistan."},"is_true":true,"explanation":null},{"id":"s2","statement":{"uz":"Amazonka daryosi Afrikada joylashgan.","ru":"Река Амазонка находится в Африке.","en":"The Amazon River is in Africa."},"is_true":false,"explanation":{"uz":"Amazonka Janubiy Amerikada oqadi. Afrikadagi mashhur daryo — Nil.","ru":"Амазонка течёт в Южной Америке. Знаменитая река Африки — Нил.","en":"The Amazon flows in South America. Africa's famous river is the Nile."}},{"id":"s3","statement":{"uz":"Tinch okeani Yerdagi eng katta okeandir.","ru":"Тихий океан — самый большой океан Земли.","en":"The Pacific is the largest ocean on Earth."},"is_true":true,"explanation":null},{"id":"s4","statement":{"uz":"Everest cho'qqisi Alp tog'larida joylashgan.","ru":"Пик Эверест находится в Альпах.","en":"Mount Everest is in the Alps."},"is_true":false,"explanation":{"uz":"Everest Himolay tog'larida, Nepal va Xitoy chegarasida joylashgan.","ru":"Эверест расположен в Гималаях, на границе Непала и Китая.","en":"Everest is in the Himalayas, on the border of Nepal and China."}},{"id":"s5","statement":{"uz":"Antarktida — eng sovuq qit'a.","ru":"Антарктида — самый холодный континент.","en":"Antarctica is the coldest continent."},"is_true":true,"explanation":null},{"id":"s6","statement":{"uz":"Avstraliya Yevropa qit'asida joylashgan.","ru":"Австралия находится в Европе.","en":"Australia is in Europe."},"is_true":false,"explanation":{"uz":"Avstraliya — alohida qit'a, Janubiy yarim sharda joylashgan.","ru":"Австралия — отдельный континент в Южном полушарии.","en":"Australia is a continent of its own, in the Southern Hemisphere."}},{"id":"s7","statement":{"uz":"Samarqand — O'zbekistonning qadimiy shaharlaridan biri.","ru":"Самарканд — один из древних городов Узбекистана.","en":"Samarkand is one of the ancient cities of Uzbekistan."},"is_true":true,"explanation":null},{"id":"s8","statement":{"uz":"Nil daryosi Janubiy Amerikada oqadi.","ru":"Река Нил течёт в Южной Америке.","en":"The Nile flows through South America."},"is_true":false,"explanation":{"uz":"Nil Shimoliy-Sharqiy Afrikadan o'tib, O'rta dengizga quyiladi.","ru":"Нил течёт по северо-востоку Африки и впадает в Средиземное море.","en":"The Nile flows through north-east Africa into the Mediterranean Sea."}},{"id":"s9","statement":{"uz":"Yer yuzida beshta okean bor.","ru":"На Земле пять океанов.","en":"There are five oceans on Earth."},"is_true":true,"explanation":null},{"id":"s10","statement":{"uz":"Orol dengizi Yaponiyada joylashgan.","ru":"Аральское море находится в Японии.","en":"The Aral Sea is in Japan."},"is_true":false,"explanation":{"uz":"Orol dengizi O'zbekiston va Qozog'iston o'rtasida, Markaziy Osiyoda joylashgan.","ru":"Аральское море расположено в Центральной Азии, между Узбекистаном и Казахстаном.","en":"The Aral Sea is in Central Asia, between Uzbekistan and Kazakhstan."}}]$j$::jsonb, 3),
 ('00000000-0000-4000-8000-00000000c004', 'quiz_race', $j${"uz":"Umumiy bilim viktorinasi","ru":"Викторина на общие знания","en":"General knowledge quiz"}$j$::jsonb, $j${"uz":"Tabiat, fan va tarixdan aralash savollar.","ru":"Смешанные вопросы о природе, науке и истории.","en":"Mixed questions on nature, science and history."}$j$::jsonb, 'general', null, 'medium', $j$[{"id":"q1","question":{"uz":"Quyoshga eng yaqin sayyora qaysi?","ru":"Какая планета ближе всего к Солнцу?","en":"Which planet is closest to the Sun?"},"options":[{"id":"A","text":{"uz":"Merkuriy","ru":"Меркурий","en":"Mercury"}},{"id":"B","text":{"uz":"Venera","ru":"Венера","en":"Venus"}},{"id":"C","text":{"uz":"Mars","ru":"Марс","en":"Mars"}},{"id":"D","text":{"uz":"Yupiter","ru":"Юпитер","en":"Jupiter"}}],"correct_option_id":"A","explanation":{"uz":"Merkuriy Quyoshga eng yaqin sayyoradir.","ru":"Меркурий — ближайшая к Солнцу планета.","en":"Mercury is the planet nearest the Sun."}},{"id":"q2","question":{"uz":"Suvning kimyoviy formulasi qanday?","ru":"Какова химическая формула воды?","en":"What is the chemical formula of water?"},"options":[{"id":"A","text":{"uz":"CO2","ru":"CO2","en":"CO2"}},{"id":"B","text":{"uz":"H2O","ru":"H2O","en":"H2O"}},{"id":"C","text":{"uz":"O2","ru":"O2","en":"O2"}},{"id":"D","text":{"uz":"NaCl","ru":"NaCl","en":"NaCl"}}],"correct_option_id":"B","explanation":{"uz":"Suv molekulasi ikkita vodorod va bitta kislorod atomidan iborat.","ru":"Молекула воды состоит из двух атомов водорода и одного атома кислорода.","en":"A water molecule has two hydrogen atoms and one oxygen atom."}},{"id":"q3","question":{"uz":"O'zbekiston Mustaqilligi kuni qachon nishonlanadi?","ru":"Когда отмечается День независимости Узбекистана?","en":"When is Uzbekistan's Independence Day?"},"options":[{"id":"A","text":{"uz":"1-yanvar","ru":"1 января","en":"1 January"}},{"id":"B","text":{"uz":"21-mart","ru":"21 марта","en":"21 March"}},{"id":"C","text":{"uz":"1-sentabr","ru":"1 сентября","en":"1 September"}},{"id":"D","text":{"uz":"9-may","ru":"9 мая","en":"9 May"}}],"correct_option_id":"C","explanation":null},{"id":"q4","question":{"uz":"Eng katta sutemizuvchi hayvon qaysi?","ru":"Какое млекопитающее самое большое?","en":"Which is the largest mammal?"},"options":[{"id":"A","text":{"uz":"Fil","ru":"Слон","en":"Elephant"}},{"id":"B","text":{"uz":"Jirafa","ru":"Жираф","en":"Giraffe"}},{"id":"C","text":{"uz":"Ko'k kit","ru":"Синий кит","en":"Blue whale"}},{"id":"D","text":{"uz":"Qutb ayig'i","ru":"Белый медведь","en":"Polar bear"}}],"correct_option_id":"C","explanation":{"uz":"Ko'k kit Yer tarixidagi eng katta hayvonlardan biridir.","ru":"Синий кит — одно из крупнейших животных в истории Земли.","en":"The blue whale is one of the largest animals ever to live."}},{"id":"q5","question":{"uz":"Mirzo Ulug'bek qaysi sohada mashhur?","ru":"В какой области известен Мирзо Улугбек?","en":"What was Mirzo Ulugbek famous for?"},"options":[{"id":"A","text":{"uz":"Astronomiya","ru":"Астрономия","en":"Astronomy"}},{"id":"B","text":{"uz":"Tibbiyot","ru":"Медицина","en":"Medicine"}},{"id":"C","text":{"uz":"Dengiz sayohati","ru":"Морские путешествия","en":"Sea voyages"}},{"id":"D","text":{"uz":"Kimyo","ru":"Химия","en":"Chemistry"}}],"correct_option_id":"A","explanation":{"uz":"Ulug'bek Samarqandda rasadxona qurdirgan va yulduzlar jadvalini tuzgan.","ru":"Улугбек построил обсерваторию в Самарканде и составил звёздный каталог.","en":"Ulugbek built an observatory in Samarkand and compiled a star catalogue."}},{"id":"q6","question":{"uz":"O'simliklar fotosintezda qaysi gazni yutadi?","ru":"Какой газ поглощают растения при фотосинтезе?","en":"Which gas do plants absorb during photosynthesis?"},"options":[{"id":"A","text":{"uz":"Kislorod","ru":"Кислород","en":"Oxygen"}},{"id":"B","text":{"uz":"Azot","ru":"Азот","en":"Nitrogen"}},{"id":"C","text":{"uz":"Karbonat angidrid","ru":"Углекислый газ","en":"Carbon dioxide"}},{"id":"D","text":{"uz":"Vodorod","ru":"Водород","en":"Hydrogen"}}],"correct_option_id":"C","explanation":{"uz":"O'simliklar karbonat angidridni yutib, kislorod chiqaradi.","ru":"Растения поглощают углекислый газ и выделяют кислород.","en":"Plants take in carbon dioxide and release oxygen."}},{"id":"q7","question":{"uz":"Dunyodagi eng baland tog' qaysi?","ru":"Какая гора самая высокая в мире?","en":"What is the highest mountain in the world?"},"options":[{"id":"A","text":{"uz":"Elbrus","ru":"Эльбрус","en":"Elbrus"}},{"id":"B","text":{"uz":"Everest","ru":"Эверест","en":"Everest"}},{"id":"C","text":{"uz":"Kilimanjaro","ru":"Килиманджаро","en":"Kilimanjaro"}},{"id":"D","text":{"uz":"Mont-Blan","ru":"Монблан","en":"Mont Blanc"}}],"correct_option_id":"B","explanation":null},{"id":"q8","question":{"uz":"Kattalar tanasida nechta suyak bor?","ru":"Сколько костей в теле взрослого человека?","en":"How many bones does an adult human have?"},"options":[{"id":"A","text":{"uz":"106","ru":"106","en":"106"}},{"id":"B","text":{"uz":"206","ru":"206","en":"206"}},{"id":"C","text":{"uz":"306","ru":"306","en":"306"}},{"id":"D","text":{"uz":"406","ru":"406","en":"406"}}],"correct_option_id":"B","explanation":null},{"id":"q9","question":{"uz":"Quyosh qaysi tomondan chiqadi?","ru":"С какой стороны восходит Солнце?","en":"In which direction does the Sun rise?"},"options":[{"id":"A","text":{"uz":"Sharq","ru":"Восток","en":"East"}},{"id":"B","text":{"uz":"G'arb","ru":"Запад","en":"West"}},{"id":"C","text":{"uz":"Shimol","ru":"Север","en":"North"}},{"id":"D","text":{"uz":"Janub","ru":"Юг","en":"South"}}],"correct_option_id":"A","explanation":null},{"id":"q10","question":{"uz":"Qaysi hayvon qush emas?","ru":"Какое животное не является птицей?","en":"Which animal is NOT a bird?"},"options":[{"id":"A","text":{"uz":"Pingvin","ru":"Пингвин","en":"Penguin"}},{"id":"B","text":{"uz":"Burgut","ru":"Орёл","en":"Eagle"}},{"id":"C","text":{"uz":"Ko'rshapalak","ru":"Летучая мышь","en":"Bat"}},{"id":"D","text":{"uz":"Boyqush","ru":"Сова","en":"Owl"}}],"correct_option_id":"C","explanation":{"uz":"Ko'rshapalak — uchadigan sutemizuvchi, qush emas.","ru":"Летучая мышь — летающее млекопитающее, а не птица.","en":"A bat is a flying mammal, not a bird."}}]$j$::jsonb, 4),
 ('00000000-0000-4000-8000-00000000c005', 'quiz_race', $j${"uz":"Matematika poygasi, 4-sinf","ru":"Математическая гонка, 4 класс","en":"Maths race, grade 4"}$j$::jsonb, $j${"uz":"Tez hisoblang va to'g'ri javobni tanlang.","ru":"Считайте быстро и выбирайте верный ответ.","en":"Calculate fast and pick the right answer."}$j$::jsonb, 'math', 4, 'easy', $j$[{"id":"q1","question":{"uz":"7 × 8 = ?","ru":"7 × 8 = ?","en":"7 × 8 = ?"},"options":[{"id":"A","text":{"uz":"54","ru":"54","en":"54"}},{"id":"B","text":{"uz":"56","ru":"56","en":"56"}},{"id":"C","text":{"uz":"63","ru":"63","en":"63"}},{"id":"D","text":{"uz":"48","ru":"48","en":"48"}}],"correct_option_id":"B","explanation":null},{"id":"q2","question":{"uz":"100 − 37 = ?","ru":"100 − 37 = ?","en":"100 − 37 = ?"},"options":[{"id":"A","text":{"uz":"63","ru":"63","en":"63"}},{"id":"B","text":{"uz":"73","ru":"73","en":"73"}},{"id":"C","text":{"uz":"67","ru":"67","en":"67"}},{"id":"D","text":{"uz":"57","ru":"57","en":"57"}}],"correct_option_id":"A","explanation":null},{"id":"q3","question":{"uz":"20 ning 3/4 qismi nechaga teng?","ru":"Чему равны 3/4 от 20?","en":"What is 3/4 of 20?"},"options":[{"id":"A","text":{"uz":"10","ru":"10","en":"10"}},{"id":"B","text":{"uz":"12","ru":"12","en":"12"}},{"id":"C","text":{"uz":"15","ru":"15","en":"15"}},{"id":"D","text":{"uz":"18","ru":"18","en":"18"}}],"correct_option_id":"C","explanation":{"uz":"20 ÷ 4 = 5, 5 × 3 = 15.","ru":"20 ÷ 4 = 5, 5 × 3 = 15.","en":"20 ÷ 4 = 5, then 5 × 3 = 15."}},{"id":"q4","question":{"uz":"Tomoni 6 sm bo'lgan kvadratning perimetri necha sm?","ru":"Чему равен периметр квадрата со стороной 6 см?","en":"What is the perimeter of a square with side 6 cm?"},"options":[{"id":"A","text":{"uz":"12 sm","ru":"12 см","en":"12 cm"}},{"id":"B","text":{"uz":"24 sm","ru":"24 см","en":"24 cm"}},{"id":"C","text":{"uz":"36 sm","ru":"36 см","en":"36 cm"}},{"id":"D","text":{"uz":"18 sm","ru":"18 см","en":"18 cm"}}],"correct_option_id":"B","explanation":{"uz":"Perimetr = 4 × 6 = 24.","ru":"Периметр = 4 × 6 = 24.","en":"Perimeter = 4 × 6 = 24."}},{"id":"q5","question":{"uz":"Qaysi son eng katta?","ru":"Какое число самое большое?","en":"Which number is the largest?"},"options":[{"id":"A","text":{"uz":"0,5","ru":"0,5","en":"0.5"}},{"id":"B","text":{"uz":"0,45","ru":"0,45","en":"0.45"}},{"id":"C","text":{"uz":"0,6","ru":"0,6","en":"0.6"}},{"id":"D","text":{"uz":"0,09","ru":"0,09","en":"0.09"}}],"correct_option_id":"C","explanation":null},{"id":"q6","question":{"uz":"144 ÷ 12 = ?","ru":"144 ÷ 12 = ?","en":"144 ÷ 12 = ?"},"options":[{"id":"A","text":{"uz":"10","ru":"10","en":"10"}},{"id":"B","text":{"uz":"11","ru":"11","en":"11"}},{"id":"C","text":{"uz":"12","ru":"12","en":"12"}},{"id":"D","text":{"uz":"14","ru":"14","en":"14"}}],"correct_option_id":"C","explanation":null},{"id":"q7","question":{"uz":"2,5 soatda necha daqiqa bor?","ru":"Сколько минут в 2,5 часах?","en":"How many minutes are in 2.5 hours?"},"options":[{"id":"A","text":{"uz":"120","ru":"120","en":"120"}},{"id":"B","text":{"uz":"130","ru":"130","en":"130"}},{"id":"C","text":{"uz":"150","ru":"150","en":"150"}},{"id":"D","text":{"uz":"250","ru":"250","en":"250"}}],"correct_option_id":"C","explanation":{"uz":"2 soat = 120 daqiqa, yarim soat = 30 daqiqa.","ru":"2 часа = 120 минут, полчаса = 30 минут.","en":"2 hours = 120 minutes, half an hour = 30 minutes."}},{"id":"q8","question":{"uz":"5 sm × 9 sm to'g'ri to'rtburchakning yuzi qancha?","ru":"Чему равна площадь прямоугольника 5 см × 9 см?","en":"What is the area of a 5 cm × 9 cm rectangle?"},"options":[{"id":"A","text":{"uz":"28 sm²","ru":"28 см²","en":"28 cm²"}},{"id":"B","text":{"uz":"45 sm²","ru":"45 см²","en":"45 cm²"}},{"id":"C","text":{"uz":"14 sm²","ru":"14 см²","en":"14 cm²"}},{"id":"D","text":{"uz":"54 sm²","ru":"54 см²","en":"54 cm²"}}],"correct_option_id":"B","explanation":{"uz":"Yuz = 5 × 9 = 45.","ru":"Площадь = 5 × 9 = 45.","en":"Area = 5 × 9 = 45."}}]$j$::jsonb, 5)
on conflict do nothing;
