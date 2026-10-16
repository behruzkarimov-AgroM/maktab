# DB outline (user-provided schema; agent "core" turns this into supabase/schema.sql with the fixes listed at the bottom)
All `JSONB (L)` columns hold `{"uz","ru","en"}` (LocalizedText). UUID PKs via uuid_generate_v4(); created_at/updated_at TIMESTAMPTZ.
Enums: user_role(super_admin,methodist,psychologist,teacher,student); grade_category(primary,middle,high); difficulty_level(easy,medium,hard); registration_status(pending,confirmed,attended,disqualified); application_status(new,contacted,interview_scheduled,accepted,rejected).

- profiles(id→auth.users, full_name, role, phone, avatar_url, grade 1-11, is_active)
- site_settings(id=1 singleton; school_name L, hero_title L, hero_subtitle L, hero_video_url, hero_image_url, about_mission L, about_vision L, about_history L, stats JSONB [{key,value,suffix,label L}], address L, landmark L, phones TEXT[], email, working_hours L, map_lat, map_lng, map_embed_url, social_links JSONB{telegram,instagram,youtube,facebook}, virtual_tour_url)
- programs(category, grade_range, title L, short_description L, full_content L, subjects JSONB, icon_name, cover_image_url, sort_order, is_active)
- campus_life(section_key UNIQUE [kitchen,security,transport,schedule], title L, description L, gallery_urls TEXT[], extra_data JSONB, sort_order, is_active)
- staff_members(is_administration, full_name L, position L, subject_key, bio L, experience_years, certificates TEXT[], photo_url, intro_video_url, sort_order, is_active)
- student_achievements(student_name L, grade_or_grad_year, achievement_title L, description L, university_accepted L?, photo_url, certificate_url, category [olympiad,sport,art,graduate], sort_order, is_active)
- olympiads(title L, description L, rules L?, subjects JSONB [{key,name L}], eligible_grades INT[], event_date, registration_deadline, location L, cover_image_url, is_registration_open, is_results_published)
- olympiad_registrations(olympiad_id, ticket_number UNIQUE 'OLY-YYYY-NNNNNN' (trigger), student_full_name, birth_date, current_school, grade, subject_key, parent_phone, extra_phone, qr_code_payload, status, score, max_score default 100, rank_place, certificate_pdf_url)
- academic_quizzes(title L, description L?, subject_key, subject_name L, grade 1-11, difficulty, duration_minutes, passing_score_percent, is_active)
- academic_questions(quiz_id, question_text L, question_image_url, options JSONB [{id:"A",text L}], correct_option_id, explanation L?, points, sort_order)
- academic_quiz_attempts(quiz_id, student_name, student_grade, parent_phone, total_questions, correct_answers, score_percent, time_spent_seconds, answers_log JSONB)
- psych_tests(title L, description L, instruction L, target_audience, cover_image_url, is_active)
- psych_questions(psych_test_id, question_text L, question_image_url, options JSONB [{id,text L,score}], sort_order)
- psych_result_scales(psych_test_id, min_score, max_score, result_title L, psychological_analysis L, recommendations_for_parents L, badge_color)
- psych_test_submissions(psych_test_id, student_name, student_age, parent_phone, total_score, matched_scale_id, answers_log)
- brain_games(game_slug UNIQUE [schulte-table,memory-matrix,mental-math,stroop-test,logic-seq], title L, description L, how_to_play L, cognitive_skill L, icon_name, config JSONB {easy|medium|hard:{grid,time_limit,multiplier}}, is_active, sort_order)
- game_leaderboard(game_id→brain_games, player_name, student_grade, difficulty, score, completion_time_ms, accuracy_percent)
- admission_applications(application_type [admission,campus_tour,callback], parent_name, child_name, target_grade, phone, preferred_language, message, status, admin_notes)
- site_visits(id, path, locale, created_at)  -- NEW, for dashboard "visitors" stat
Storage buckets (public read, admin write): school-media, test-assets, certificates.
is_admin() SECURITY DEFINER = profiles.role in (super_admin, methodist, psychologist) AND is_active. Use `SET search_path = public`.

## Required fixes vs. the original draft (security)
1. NO public SELECT on olympiad_registrations. Provide RPC `check_olympiad_result(p_ticket text)` (SECURITY DEFINER) returning only name, ticket, subject, grade, status, score, max_score, rank_place (only when olympiads.is_results_published), and RPC `register_olympiad(...)` that validates open registration/deadline/eligible grade and retries ticket generation on collision, returning the row needed for the pass.
2. NO public SELECT on academic_questions.correct_option_id/explanation: expose a view/RPC `get_quiz_questions(quiz_id)` without answers, and RPC `submit_quiz_attempt(quiz_id, answers jsonb, name, grade, phone, seconds)` that scores server-side and returns score + per-question correct/explanation. Same idea for psych: scores of options must not be needed by the client; `submit_psych_test(...)` returns matched scale.
3. Public INSERT for leaderboard/applications stays but with CHECK constraints (length limits, score bounds) and no direct INSERT on registrations/attempts/submissions (RPC only).
4. Admin roles: super_admin full; methodist: content + olympiads + quizzes; psychologist: psych_* only (+read applications). Implement with helper fns `has_role(...)`.
5. Ticket generator: loop until unique. Add `ON DELETE` sanity, updated_at triggers on all tables having updated_at.
6. Seed data: 3 programs, 4 campus_life sections, 6 staff, 4 achievements, 1 olympiad (date = now()+14d), 2 quizzes with 5 questions each, 2 psych tests with scales, 5 brain_games rows, a few leaderboard rows.
