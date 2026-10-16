-- 0002_hardening: security, integrity and performance hardening for databases created from an older 0001_init.sql.
-- Generated from supabase/schema.sql by scripts/db/split.mjs (regions marked "@migration 0002"). Idempotent: safe to re-run.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- the role is ALWAYS 'student' here; the name comes from user-controlled metadata, so bound it
  insert into public.profiles (id, full_name, role)
  values (new.id, left(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), 120), 'student')
  on conflict (id) do nothing;
  return new;
end $$;

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

select public._mk_policies('surveys',          $e$public.is_admin()$e$, $e$public.has_role('super_admin','methodist')$e$);
select public._mk_policies('survey_questions', $e$public.is_admin()$e$, $e$public.has_role('super_admin','methodist')$e$);
-- Responses: staff read; super_admin + methodist may delete (spam). Nobody inserts through PostgREST.
alter table public.survey_responses enable row level security;
drop policy if exists survey_responses_read on public.survey_responses;
create policy survey_responses_read on public.survey_responses for select to authenticated using ((select public.is_admin()));
drop policy if exists survey_responses_delete on public.survey_responses;
create policy survey_responses_delete on public.survey_responses for delete to authenticated
  using ((select public.has_role('super_admin','methodist')));

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

drop policy if exists game_content_sets_write on public.game_content_sets;
create policy game_content_sets_write on public.game_content_sets for all to authenticated
  using ((select public.has_role('super_admin','methodist'))) with check ((select public.has_role('super_admin','methodist')));

create or replace function public.list_game_sets(p_game_type text default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public._game_set_summary(s) order by s.sort_order, s.created_at), '[]'::jsonb)
  from (select * from public.game_content_sets g
        where g.is_active and (p_game_type is null or g.game_type = p_game_type)
        order by g.sort_order, g.created_at limit 500) s;
$$;

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

-- Policy helper is only needed while this file runs.
drop function if exists public._mk_policies(text, text, text);
