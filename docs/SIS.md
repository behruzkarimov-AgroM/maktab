# School management system (SIS) - phase 1 contract

Portal under `/school` (UI) and `/api/school/**` (API) for running the school: attendance (davomat), academic performance (o'zlashtirish),
people and classes, announcements, reports. Separate from the public site and from the CMS (`/admin`), which are untouched.
Phase 1 (this document) = architecture, data model, backend, auth, demo data, portal shell. Phase 2 = three parallel UI agents (section 9).

## 1. Scope

| Area | What exists in phase 1 |
|---|---|
| Data | `supabase/schema.sql` section "SCHOOL MANAGEMENT SYSTEM" (tables, RLS, RPCs) + reference seed; `lib/school/demo-data.ts` generates the demo people / schedule / 8 weeks of attendance / grades |
| Backend | `lib/school/**` (service layer on a `SchoolDb` interface: Supabase or in-memory demo store), `app/api/school/**` |
| Auth | Supabase Auth (email+password) + `profiles.role/is_active`; demo mode with HMAC cookie |
| UI shell | `app/school/**`: login, role redirect, guarded portal layout with role sidebar, placeholder pages "coming in phase 2" |
| Not in phase 1 | the real pages of the three portals, PDF/Excel export UI (data endpoints exist), SQL demo loader (see section 12) |

Everything works in DEMO mode (no Supabase env). With `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
it uses Supabase: table reads/writes through the service-role client after the code-level role/ownership checks, bulk writes
(`mark_attendance_bulk`, `save_grades_bulk`, `save_term_grades_bulk`, `lock_term`) through SECURITY DEFINER RPCs called with the **user's JWT**
(so the database re-checks ownership, ranges, locks and writes `audit_log`). RLS protects every direct PostgREST access. `anon` has no grants at all.

## 2. Roles and permissions

`profiles.role` (enum `user_role`, extended with `school_admin`, `parent`): **director** = `super_admin` or `school_admin`; `teacher`; `parent`; `student`.
`methodist` / `psychologist` (CMS roles) have no school access. The account must be `is_active`.

| Resource | director | teacher | parent | student |
|---|---|---|---|---|
| years / terms / subjects | rw | r | r | r |
| classes, assignments, schedule | rw | r own classes (schedule: own slots) | r classes of own children | r own class |
| teachers | rw | r self | - | - |
| students | rw | r students of own classes | r own children | r self |
| guardians | rw | r guardians of own-class students | r own | - |
| attendance | rw (any date) | rw own classes; not future; max 14 days back | r own children | r self |
| grade entries / term grades | rw (also in locked terms) | rw only own **subject in own class**; locked term rejected | r own children | r self |
| lessons (topic/homework) | rw | rw own subject+class | r | r |
| announcements | rw | r; may create `audience=class` for own class (not pinned) and edit/delete own | r | r |
| notifications | own | own | own | own |
| reports / analytics / risk | all | own classes (`risk` list: staff only) | own children (report card, performance) | self |
| import, accounts, term lock | yes | - | - | - |

"Own classes" = classes where the teacher has a `teaching_assignment` **or** is `homeroom_teacher`. The homeroom teacher sees and marks attendance for the whole class.
Matrix in code: `lib/school/permissions.ts` (`MATRIX`); in SQL: policies + helper functions (`is_school_director()`, `my_teacher_id()`, `my_children()`,
`my_student_ids()`, `teaches_class()`, `teaches_subject_class()`, `can_manage_class()`, `can_view_class()`, `can_view_student()`).

## 3. Data model (public schema)

All ids are uuid. Dates `YYYY-MM-DD`, times `HH:MM:SS`. TypeScript types for every row: `lib/school/types.ts`.

| Table | Columns (key ones) |
|---|---|
| `school_years` | id, name unique, start_date, end_date, is_current (only one true), grading_rules jsonb (overrides of `GradingRules`) |
| `terms` | id, year_id, number 1-4, name, start_date, end_date, **is_locked**; unique(year_id, number). Uzbek "chorak" system |
| `subjects` | id, name `{uz,ru,en}`, short, sort_order |
| `teachers` | id, user_id? (unique, auth.users), full_name, phone, email, subjects uuid[], hired_at, status active/inactive |
| `classes` | id, year_id, grade 1-11, letter, name ("7A"), homeroom_teacher_id?, room; unique(year_id, grade, letter) |
| `teaching_assignments` | id, class_id, subject_id, teacher_id, hours_per_week; unique(class_id, subject_id) |
| `students` | id, user_id?, first_name, last_name, middle_name, birth_date, gender m/f, class_id?, student_code **unique**, phone, address, photo_url, status, enrolled_at, notes |
| `guardians` | id, user_id?, full_name, relation, phone, email, telegram_chat_id? |
| `student_guardians` | student_id, guardian_id, is_primary; pk(student_id, guardian_id) |
| `schedule_slots` | id, class_id, subject_id, teacher_id?, weekday 1-6 (Mon-Sat), lesson_no 1-8, start_time, end_time, room; unique(class_id, weekday, lesson_no); partial unique `schedule_slots_room_uq` (weekday, lesson_no, lower(btrim(room)) where room not blank) and `schedule_slots_teacher_uq` (teacher_id, weekday, lesson_no where teacher_id not null) |
| `lessons` | id, slot_id?, class_id, subject_id, teacher_id?, date, lesson_no, topic, homework; unique(class_id, date, lesson_no) |
| `attendance` | id, student_id, class_id, date, lesson_no? (**null = daily mode**), status, minutes_late, note, marked_by, marked_at; **unique(student_id, date, coalesce(lesson_no,0))** |
| `grade_entries` | id, student_id, class_id, subject_id, term_id, date, kind, score numeric(3,1) **1..5**, max_score (5), percent? (optional 0..100 mode), weight, comment, teacher_id, created_at |
| `term_grades` | pk(student_id, subject_id, term_id), class_id, value 1-5 (teacher-confirmed, null = not confirmed), suggested numeric(3,2), is_confirmed, confirmed_by, **override_reason** text<=300 (why the value differs from the suggestion), updated_at |
| `school_notification_prefs` | pk user_id (auth.users), telegram, email, absence, low_grade, announcements (all boolean default true), updated_at. RLS: own row only (select/insert/update; directors included - no cross-user reads) |
| `announcements` | id, audience, class_id?, title, body, author_id, publish_at, pinned |
| `notifications` | id, user_id, type, payload jsonb, read_at, created_at |
| `behavior_notes` | id, student_id, class_id?, teacher_id?, date, kind positive/negative/neutral, text |

Audit: every mutation writes `audit_log` (service layer: `db.audit`; RPCs: inside the function). Year grade is **computed**, not stored.

### Enums / allowed values

* attendance `status`: `present | absent | late | excused | sick` (`minutes_late` only kept for `late`)
* student `status`: `active | transferred | graduated | expelled`; teacher `status`: `active | inactive`
* grade `kind`: `daily | quiz | test | exam | homework | term | year`
* announcement `audience`: `all | teachers | parents | students | class` (`class_id` required exactly for `class`)
* guardian `relation`: `mother | father | guardian | parent | other`

## 4. Grading rules (`lib/school/grading.ts`, configurable through `school_years.grading_rules`)

* Scale: 5 points (1..5, halves allowed, e.g. 4.5). Optional `percent` field for percent-mode entries.
* Entry weight defaults by kind when the client omits `weight`: daily 1, quiz 1, homework 0.5, test 2, exam 3.
* Average = sum(score x weight) / sum(weight) over entries; kinds `term` and `year` are excluded. Displayed with 2 decimals (half up).
* **Term grade suggestion** = weighted average rounded **half up** to an integer 1..5 (3.5 -> 4, 3.49 -> 3); `null` below `minEntries` (3) counted entries. The teacher confirms it via `POST /grades/term` (value may differ from the suggestion).
* **Year grade** = mean of the term values (confirmed value, else suggestion), half up. **GPA** = mean of the subjects' year grades (2 decimals). **Percent** = average / 5 x 100.
* **Class rank**: competition ranking (1,2,2,4) by the weighted average of the year to date.
* Attendance percent = (present + late) / total records x 100. Excused and sick count as non-attendance but are reported separately.
* **Risk flags** (`RiskFlag`): `low_attendance` (< 85% and >= 5 records), `low_average` (< 3.0 and >= 3 grades), `absence_streak` (>= 3 trailing school days with status `absent`, unexcused). Thresholds: `attendanceRiskPct`, `averageRisk`, `absenceStreak`.
* **Locked terms**: `terms.is_locked = true` rejects all grade writes by teachers (`term_locked`); directors may still write. Teachers may mark attendance for today and up to 14 days back (`edit_window_closed`), never in the future (`invalid_date`).

## 5. API

Base `/api/school`. All JSON. Success: `{ "ok": true, ...fields }`. Error: `{ "ok": false, "error": "<code>", "fields"?: string[] }` (never raw messages).
Every request needs the session cookie (login first) except `auth/login`. Non-GET: same-origin only (`Origin` must match host, else 403) and
`Content-Type: application/json` (else 415; the import upload uses multipart). Rate limits: 300 reads/min, 120 writes/min per user, login 10 / 10 min per IP (429).
Client helpers: `lib/school/client.ts` (`sget/spost/spatch/sdelete/supload`, throws `ApiError{code,status}`).

Error codes: `unauthorized` 401, `forbidden` 403, `not_found` 404, `validation` 422 (+`fields`), `invalid_input` 422, `invalid_status`/`invalid_score`/`invalid_kind`/`invalid_date`/`date_out_of_term`/`term_not_in_year`/`student_not_in_class` 422,
`conflict` 409 (unique violation), `room_busy` 409 (schedule: room taken), `already_resolved` 409 (excuse already accepted), `term_locked` 409, `edit_window_closed` 409, `password_change_required` 403 (temporary password still active), `wrong_password` 403, `weak_password` 422, `invalid_token` 422 (reset link), `unsupported` 415, `payload_too_large` 413, `rate_limited` 429, `invalid_credentials` 401 (login), `not_configured` 501, `server_error` 500.

Roles: **D** = director, **T** = teacher, **P** = parent, **S** = student. "scoped" = the service filters by the role rules of section 2.

### Auth / session

| Method path | Roles | Request | Response |
|---|---|---|---|
| POST `/auth/login` | public | `{email, password}` | `{role, home, must_change_password}` + cookie. `home` = `/school/director|teacher|family` |
| POST `/auth/logout` | any | - | `{}` |
| POST `/auth/change-password` | any signed-in (also while `must_change_password`) | `{current_password, new_password}` | `{changed:true}`. Errors: 403 `wrong_password`, 422 `weak_password`, 429 (5 / 10 min). Rules (`lib/school/password.ts`): 8-72 chars, a letter and a digit, not a common password, not the e-mail name, different from the current one. Supabase: current password verified with a session-less anon client, then `auth.updateUser({password})` on the user's session (falls back to the admin API when "secure password change" asks for re-auth), then `profiles.must_change_password=false`. Demo: in-memory |
| POST `/auth/request-reset` | public | `{email}` | `{sent:true, demo}` - **identical for known and unknown addresses**. Supabase: `resetPasswordForEmail(email, {redirectTo: NEXT_PUBLIC_SITE_URL/school/reset-password})`. Demo: nothing is sent (simulated). Limits: 10 / 10 min per IP, 3 / 10 min per address |
| POST `/auth/complete-reset` | public (the e-mail link is the credential) | `{token_hash \| code, password}` (+ `email` in demo) | `{reset:true}`. `token_hash` works in any browser (custom e-mail template, see `docs/SUPABASE-GO-LIVE.md`), `code` (PKCE) only in the browser that asked for the reset. Errors: 422 `invalid_token` / `weak_password`. The user is signed out afterwards. Demo: `code="demo-reset"` |
| GET `/me` | all (also while `must_change_password`) | - | `{user:{id,email,name,role,teacherId,studentIds}, home, demo, must_change_password, today, year, term, terms, rules}` |
| GET / PUT `/me/prefs` | all (own row) | PUT `{telegram?, email?, absence?, low_grade?, announcements?}` (>= 1 key) | `{prefs:{telegram,email,absence,low_grade,announcements,updated_at}}`; no row = all `true`. Honoured: `absence` (in-app + Telegram), `low_grade` (in-app notice + Telegram with SCHOOL_NOTIFY_GRADES=on, for NEW grades <= 2), `telegram` (channel), `announcements` (in-app). **E-mail is not available**: `email` is always returned as `false`, the response carries `unavailable:["email"]` and `PUT {email:true}` answers 422 `channel_unavailable` |
| GET `/dashboard` | all | - | `{dashboard: DashboardData}` role-aware: D cards (students, teachers, classes, attendanceToday, absentToday, averageGrade, atRisk) + charts (attendanceByClass, attendanceTrend, gradeDistribution, subjectAverages) + risk top 8; T cards (myClasses, myStudents, hoursPerWeek, pendingAttendance, ...) + `pending[]` classes without attendance today; P/S `children[]` with today's status, average, attendance %, risk |

### People and structure

| Method path | Roles | Request | Response |
|---|---|---|---|
| GET `/students` | all (scoped) | `?class_id&status&q&with_stats=1&limit&offset` | `{total, students: StudentListItem[]}` (`class_name`; with stats: `attendance_percent`, `average`, `risk[]`) |
| POST `/students` | D | `{first_name,last_name,middle_name?,birth_date?,gender?,class_id?,student_code?,phone?,address?,photo_url?,status?,enrolled_at?,notes?}` (code auto `ST-YYYY-0001`) | `{student}` |
| GET `/students/:id` | scoped | - | `{student: StudentDetail}` (+`guardians[]` with `is_primary`; none for role S) |
| PATCH `/students/:id` | D | partial student body | `{student}` |
| DELETE `/students/:id` | D | - | `{}` (hard delete, cascades; prefer `status`) |
| GET `/classes` | all (scoped) | - | `{classes:[{...class, student_count (D), homeroom_teacher_name}]}` |
| POST `/classes`, PATCH/DELETE `/classes/:id` | D | `{grade, letter, homeroom_teacher_id?, room?, year_id?}` | `{class}` / `{}` |
| GET `/subjects` | all | - | `{subjects}` |
| POST `/subjects`, PATCH/DELETE `/subjects/:id` | D | `{name:{uz,ru,en}, short?, sort_order?}` | `{subject}` / `{}` |
| GET `/teachers` | D, T (self only) | - | `{teachers:[{...teacher, classes[], homeroom_of[], hours_per_week}]}` |
| POST `/teachers`, PATCH/DELETE `/teachers/:id` | D | `{full_name, phone?, email?, subjects?, hired_at?, status?}` | `{teacher}` / `{}` |
| GET `/assignments` | all (scoped) | `?class_id&teacher_id` | `{assignments}` |
| POST `/assignments`, PATCH/DELETE `/assignments/:id` | D | `{class_id, subject_id, teacher_id, hours_per_week?}` (409 if class already has the subject) | `{assignment}` / `{}` |
| GET `/schedule` | all (scoped) | `?class_id` or `?teacher_id` | `{slots:[{...slot, class_name}]}` sorted by weekday, lesson_no |
| POST `/schedule`, PATCH/DELETE `/schedule/:id` | D | `{class_id, subject_id, teacher_id?, weekday 1-6, lesson_no 1-8, start_time, end_time, room?}` (409 `conflict` if the class cell or the teacher is taken, **409 `room_busy`** if another class already uses the same room at that weekday + lesson; rooms compare case-insensitively, blank = no room; DB indexes `schedule_slots_room_uq` / `schedule_slots_teacher_uq` enforce both) | `{slot}` / `{}` |
| GET `/lessons` | all (scoped) | `?class_id&from&to` | `{lessons}` |
| POST `/lessons` | D, T (own subject+class) | `{class_id, subject_id, date, lesson_no, topic?, homework?}` upsert | `{lesson}` |
| GET `/guardians` | D all; T/P by student | `?student_id` | `{guardians:[{...guardian, student_ids[]}]}` (parents never see `telegram_chat_id` of others) |
| POST `/guardians`, PATCH/DELETE `/guardians/:id` | D | `{full_name, relation?, phone?, email?, telegram_chat_id?, student_id?, is_primary?}` | `{guardian}` / `{}` |
| POST / DELETE `/guardians/link` | D | `{student_id, guardian_id, is_primary?}` | `{}` |
| GET `/years-terms` | all | - | `{years, terms, current_year_id}` |
| POST `/years-terms`, PATCH `/years-terms/:id` | D | `{kind:"year", name,start_date,end_date,is_current?,grading_rules?}` or `{kind:"term", year_id,number,name,start_date,end_date}` | `{year}` / `{term}` |
| POST `/years-terms/lock` | D | `{term_id, locked}` | `{term_id, is_locked}` |
| POST `/teacher/excuse/reject` | D, teacher (homeroom) | `{notificationId, comment (3..300)}` | `{rejected:true, notified, student_id, date}`. Attendance stays `absent`; parent gets `excuse_resolved` with `payload.status:"rejected"` + `comment`; audit `excuse_reject`. Errors 403, 404, 409 `already_resolved` / `term_locked`, 422. `GET /family/excuse` now returns `status` (pending/accepted/rejected) and `comment`; a second explanation for the same day is 409 until the first is answered |
| POST `/accounts` | D | `{kind:"teacher"|"guardian"|"student", id, email, password?}` | `{account:{user_id,email,temp_password,demo,must_change_password:true}}` (password shown once; null in demo). The password is TEMPORARY: the account is flagged `profiles.must_change_password` |
| POST `/accounts/reset-password` | D | `{user_id, password?}` | `{reset:{temp_password,demo,must_change_password:true}}` (sets the flag again) |
| POST `/guardians/invite` | D | `{guardian_id? \| full_name + relation? + phone?, email, student_ids:[uuid] (<=10; >=1 when creating), is_primary?, password?}` | `{invite:{guardian, account:{...as /accounts}\|null, linked}}`. Creates the guardian if needed, links the children, provisions the `parent` login with a temporary password (shown once). A guardian that already has a login only gets the children linked (`account:null`). 409 `conflict` when the e-mail is taken (nothing is left half-created) |

**Temporary passwords / forced change.** Accounts created or reset by a director carry `must_change_password=true` (`SchoolSession.mustChangePassword`; trigger `protect_profile_privileged_cols` stops users from clearing it themselves). `api()` then answers **403 `password_change_required`** for every endpoint except `GET /me`, `POST /auth/change-password` and `POST /auth/logout`. The UI reads `must_change_password` from `/auth/login` or `/me` and sends the user to the change-password screen.

### Attendance

| Method path | Roles | Request | Response |
|---|---|---|---|
| GET `/attendance` | D, T (own class) | `?class_id&date[&lesson_no]` | `{day:{class_id,date,lesson_no,locked_for_you,rows:[{student_id,last_name,first_name,status|null,minutes_late,note,marked_at}]}}` |
| GET `/attendance` | scoped | `?student_id[&from&to]` | `{history:{rows[],summary:{counts,percent,streak},days:[{date,status}]}}` |
| POST `/attendance/bulk` | D, T (own class) | `{class_id, date, lesson_no: null|1-8, records:[{student_id,status,minutes_late?,note?}] (1..100)}` | `{saved, newly_absent:[{student_id,class_id,date}]}` upsert, all-or-nothing |
| GET `/attendance/summary` | scoped by class | `?class_id[&from&to]` (default: year to date) | `{summary:{rows:[AttendanceSummaryRow],totals}}` |
| GET `/attendance/sheet` | D, T | `?class_id&from&to` (<= 62 days) | `{sheet:{dates[], students:[{student_id,last_name,first_name,cells:(status|null)[]}]}}` |

Marking an absence creates an in-app `absence` notification for guardians that have an account, and (if `SCHOOL_NOTIFY_ABSENCE=on`, `TELEGRAM_BOT_TOKEN` set, Supabase mode) a Telegram message to each guardian's `telegram_chat_id` via `after()` (`lib/school/notify.ts`, never blocks, never throws).

### Grades

| Method path | Roles | Request | Response |
|---|---|---|---|
| GET `/grades` | scoped | `?student_id` or `?class_id` `[&subject_id&term_id]` | `{grades: GradeEntry[]}` |
| GET `/grades/gradebook` | D, T | `?class_id&subject_id&term_id` | `{gradebook:{term_locked, can_edit, class_average, rows:[{student_id,last_name,first_name,entries[],average,suggested,term_grade}]}}` |
| POST `/grades/bulk` | D, T (own subject in class) | `{class_id, subject_id, term_id, entries:[{id?, delete?, student_id, date, kind?, score 1..5, weight?, comment?}] (1..300)}` | `{saved, deleted}` insert / update (`id`) / delete (`id`+`delete:true`), all-or-nothing; date inside the term and not future |
| GET `/grades/term` | D, T | `?class_id&subject_id&term_id` | `{table:{term_locked,can_edit,rows:[{student_id,last_name,first_name,average,entry_count,suggested,value,is_confirmed,override_reason}]}}` |
| POST `/grades/term` | D, T (own subject) | `{class_id,subject_id,term_id, rows:[{student_id, value:1..5|null, override_reason?: string<=300}]}` | `{saved}` confirms the term (chorak) grade; `null` clears it (and drops the reason). `override_reason` = why the value differs from the suggestion; stored in `term_grades.override_reason` |
| POST `/teacher/term-grades` | T | same as `/grades/term` plus legacy `reasons?: {student_id: text}` (merged into `rows[].override_reason`) | `{saved}`; overrides are also mirrored to `audit_log` (`term_grade_override`) |

### Reports / analytics

| Method path | Roles | Request | Response |
|---|---|---|---|
| GET `/reports/student-performance` | scoped | `?student_id` | `{performance:{overall_average,gpa,percent,rank_in_class,class_size,trend:[per term],subjects:[{average,count,term_values[4],year_value}],attendance,risk[]}}` |
| GET `/reports/report-card` | scoped | `?student_id[&term_id]` (no term = whole year) | `{report:{student,year,term,subjects:[{subject,teacher,average,term_grade,year_grade}],gpa,rank_in_class,class_size,attendance,homeroom_teacher}}` |
| GET `/reports/class-performance` | D, T | `?class_id[&term_id]` | `{report:{students:[{average,rank,attendance_percent,streak,risk}],class_average,distribution[5],subject_averages[]}}` |
| GET `/reports/class-attendance` | D, T | `?class_id&from&to` | same shape as `attendance/sheet` (printable class sheet) |
| GET `/reports/risk` | D, T | `?class_id&limit` | `{risk:[{student_id,name,class_name,flags[],attendance_percent,average,streak}]}` |

### Communication

| Method path | Roles | Request | Response |
|---|---|---|---|
| GET `/announcements` | all (visible ones, pinned first) | `?limit` | `{announcements}` |
| POST `/announcements` | D (any audience), T (`audience=class`, own class, not pinned) | `{audience, class_id?, title, body?, publish_at?, pinned?}` | `{announcement}` (also creates in-app notifications) |
| PATCH / DELETE `/announcements/:id` | D, or the author | full body / - | `{announcement}` / `{}` |
| GET `/notifications` | all (own) | `?unread=1&limit` | `{unread, items}` |
| POST `/notifications` | all (own) | `{ids?: uuid[], all?: true}` | `{marked}` |

### Family / excuse flow

| Method path | Roles | Request | Response |
|---|---|---|---|
| POST `/family/excuse` | P | `{student_id, date, reason:"sick"\|"family"\|"other", note?}` | `{sent, delivered}`. Notification `absence_excuse` to the homeroom teacher (payload includes `parent_user_id`) + `excuse_sent` copy for the parent |
| GET `/family/excuse?student_id` | P | - | `{excuses:[{date,reason,note,created_at, resolved, resolved_at, resolved_by}]}` - `resolved:true` once the teacher accepted |
| POST `/teacher/excuse/accept` | T (homeroom of the pupil's class, addressee of the notification), D | `{notificationId}` | `{excused, notified, student_id, date}`. The pupil's `absent` record(s) of that date become `excused` (note keeps `excuse: <reason> - <note>` when empty), the notification is marked read, audit `excuse_accept`, and the parent gets an `excuse_resolved` notification (`payload:{student_id,student_name,class_name,date,reason,status:"accepted",by}`). Errors: 403 `forbidden` (not the addressee / not the homeroom teacher), 404, 409 `term_locked` (teachers; directors may still accept), 409 `edit_window_closed` (teachers, > 14 days), 409 `already_resolved`, 422 `invalid_input` (not an `absence_excuse` notification) |
| GET `/family/class-average?student=<uuid>[&term=<uuid>]` | P (own child), S (self) | - | `{student_id, class_id, term_id, min_students:5, subjects:[{subject_id, average:number\|null}]}`. `average` = mean of the class pupils' subject averages in the term, published **only when >= 5 pupils of the class have counted grades in that subject**, else `null`. No individual values, ids or counts. `term` defaults to the current term |

### Import

`POST /import/students` (D). Two modes by content type:
1. `multipart/form-data` with `file` (.xlsx / .xls / .csv, <= 2 MB, <= 1000 rows) -> `{preview:{total,valid,duplicates,invalid,rows:[{row,ok,errors[],duplicate:"none"|"student_code"|"name_birth",action:"create"|"skip"|"invalid",data}]}}`. Nothing is written. Headers may be uz / ru / en (`Familiya`, `Фамилия`, `last_name`, ...; sinf/класс/class, tug'ilgan sana/дата рождения/birth_date, jins/пол/gender, student_code, phone, address, guardian_name, guardian_phone). Dates: `YYYY-MM-DD`, `DD.MM.YYYY`, Excel serials.
2. `application/json` `{rows:[{first_name,last_name,middle_name?,birth_date?,gender?,class_name?,student_code?,phone?,address?,guardian_name?,guardian_phone?}], on_duplicate:"skip"|"update"}` -> `{result:{created,updated,skipped,invalid,errors[]}}` (rows are re-validated on the server; duplicate = same `student_code` or same last+first name + birth date, also inside the file).

## 6. RPCs (SQL, `authenticated` + `service_role` only)

`mark_attendance_bulk(class, date, lesson_no, records jsonb)`, `save_grades_bulk(class, subject, term, entries jsonb)`, `save_term_grades_bulk(class, subject, term, rows jsonb)` (rows: `{student_id, value|null, suggested?, override_reason?}`),
`lock_term(term, locked)`, `attendance_summary(class, from, to)`, `student_performance(student, year)`, `class_journal(class, subject, term)`, `school_today()` (Asia/Tashkent).
Errors are raised as stable codes (`forbidden`, `invalid_status`, `invalid_score`, `invalid_kind`, `invalid_date`, `date_out_of_term`, `term_not_in_year`, `student_not_in_class`, `term_locked`, `edit_window_closed`, `not_found`, `invalid_input`).
Verified by `npm run db:check` (RLS per role, anon nothing, bulk validation, locked term).

## 7. Demo mode and credentials

Available when Supabase is not configured and (`NODE_ENV != production` or `ALLOW_ADMIN_DEMO=true`) and not on Vercel. HMAC-signed httpOnly cookie `school_demo_session`.
Data lives in `globalThis` (resets on server restart); `lib/school/demo-store.ts` mirrors the SQL rules (unique attendance, locked terms, ownership, audit).
Generated deterministically (hash based): 1 year, 4 terms, 14 classes (1A 1B 2A 2B 3A 3B 4A 5A 6A 7A 8A 9A 10A 11A), 12 subjects, 25 teachers, 300 students, ~450 guardians, schedule, 8 weeks of daily attendance (~93% present, chronic absentees, sick blocks, 6 students with a fresh absence streak), ~15k grades (3-5 mostly, per-student ability and per-subject affinity), confirmed term grades for finished terms (locked), announcements, notifications.
**Today is intentionally not pre-marked** so teachers can demo marking.

| Role | Email | Password | Opens |
|---|---|---|---|
| Director (`school_admin`) | `director@demo.uz` | `demo1234` | `/school/director` |
| Teacher (Dilnoza Karimova, homeroom of 1A 2B 4A 7A 10A, teaches Ona tili) | `teacher@demo.uz` | `demo1234` | `/school/teacher` |
| Parent (Gulnora Rahimova, 2 children: 3A and 7A) | `parent@demo.uz` | `demo1234` | `/school/family` |
| Student (Sardor Demo, 9A) | `student@demo.uz` | `demo1234` | `/school/family` |

Supabase mode: create users in the director UI (`POST /accounts`) or Supabase Auth, set `profiles.role`, link `teachers.user_id` / `guardians.user_id` / `students.user_id`.

## 8. Environment

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (accounts, table access), `ALLOW_ADMIN_DEMO`, `SCHOOL_NOTIFY_ABSENCE=on`, `TELEGRAM_BOT_TOKEN`.

## 9. Folder ownership for phase 2

| Agent | Owns |
|---|---|
| A - director/admin | `app/school/(portal)/director/**`, `components/school/director/**` |
| B - teachers | `app/school/(portal)/teacher/**`, `components/school/teacher/**` |
| C - parents/students | `app/school/(portal)/family/**`, `components/school/family/**` |
| shared (change only additively, tell the others) | `components/school/ui/**`, `lib/school/**`, `app/api/school/**` |
| phase 1 owner | `supabase/**`, `scripts/db/**`, `docs/SIS.md`, `app/school/{layout,page}.tsx`, `app/school/login/**`, `app/school/(portal)/layout.tsx` |

Each area has `layout.tsx` (role guard, keep it) and `[[...slug]]/page.tsx` (placeholder). A real page such as `director/students/page.tsx` takes precedence; delete nothing else.
Sidebar items per role: `lib/school/nav.ts` (`NAV`). If you add a page, add it to `NAV` and to `lib/school/i18n.ts` (nav label) - or add a label key in your own dictionary.
Feature strings go in your own `components/school/<area>/i18n.ts` (same `{uz,ru,en}` shape as `lib/school/i18n.ts`).

## 10. UI conventions

* Own layout like `/admin` (`app/school/layout.tsx` -> `RootHtml`, noindex). No public header/footer.
* Wrap pages with the provided `SchoolProvider` (already done by `(portal)/layout.tsx`). `useSchool()` gives `{session, lang, setLang, t(key), L({uz,ru,en})}`. Language UZ/RU/EN toggle in the top bar, persisted in `localStorage["school-lang"]`, default UZ. Never use the `next-intl` locale routing here.
* Light/dark: Tailwind `dark:` classes (class strategy), toggle in the top bar (`useTheme()` from `components/layout/ThemeProvider`). No hard-coded dark-only pages.
* Navy theme tokens come from `app/globals.css`: `indigo-*` = navy (#1d3557, primary buttons/active nav), `violet-*`/`purple-*` = steel blue, `fuchsia-*`/`pink-*` = gold accent (`fuchsia-400` #f4b942). Use `slate-*` for neutrals, `emerald/amber/red/sky` for status. Components: `components/school/ui/kit.tsx` (`Button`, `Badge`, `Card`, `inputCls`, `STATUS_TONE`, `gradeTone`).
* Data: call the API with `lib/school/client.ts`; show `ApiError.code` through a translated message, never raw text. Mobile first: the shell has a drawer sidebar below `lg`.
* Charts: recharts (already installed). Dates are plain `YYYY-MM-DD`; "today" comes from `/me` (`today`, Asia/Tashkent).

## 11. Tests

`tests/school-*.test.ts` (vitest): permissions, grading rules (half-up, suggestion, year grade, GPA, rank), risk flags, import validation + workbook parsing, demo generator + demo store invariants (unique attendance, locked term, ownership, atomic bulk), service flows per role.
`npm run db:check` (PGlite) covers the SQL: anon nothing, teacher only own class, parent only own child, bulk RPC validation, locked terms, announcement visibility, `override_reason`, room/teacher unique indexes, notification-prefs RLS, `must_change_password` protection.
`tests/school-v2.test.ts` (demo mode): password rules, change/reset flows, guardian invite, preferences gating, class average (>= 5), excuse acceptance, room clash, override reasons.

### Supabase-mode verification without a Supabase project

| Tool | What it proves |
|---|---|
| `npm run db:refs` (`scripts/db/check-refs.mjs`) | TypeScript-AST + type-checker scan of `lib/**`, `app/**`, `components/**` against the real schema (PGlite): every `.from('t')`, `.select('a,b,c(d)')` (columns + embedded FK relations), `.insert/.update/.upsert` keys (column exists, enum / CHECK literal legal, NOT NULL columns present, `onConflict` matches a real non-partial unique index), filters (`eq/in/order/or/...`), `.rpc('fn', {args})` (function exists, argument names/types/required ones match `pg_proc`, executable), `c.db.select/update/...("table", {eq, in, order})` call sites of `SchoolDb`, the typed layers (`lib/school/types.ts` `TableRows`, `lib/supabase/database.types.ts` rows / functions / enums) and the CMS resource registry (fields, list columns, sort, search). Dynamic table names are resolved through literal types, the registry, or wrapper-function call sites; the rest is listed as warnings (`--verbose`). Runs in CI |
| `tests/supabase-sim.test.ts` + `tests/helpers/pglite-supabase.ts` | A supabase-js compatible client over PGlite: each request is one transaction with `set local role anon/authenticated/service_role` and `request.jwt.claims`, results are Postgres JSON (like PostgREST), errors carry SQLSTATE. With `@/lib/admin/supabase` mocked, the **real** `db-supabase.ts`, `auth.ts` (session loader), `provision.ts`, `account.ts`, the service layer and the **API route handlers** run against the real `schema.sql`: anon denied everywhere, RLS per role, RPCs (attendance / grades / term grades / lock / summary / performance / journal), prefs, excuse flow, class average, room clash (incl. DB index -> `room_busy`), guardian invite, forced password change, change/reset password |
| `npm run smoke` (`scripts/supabase-smoke.mjs`) | The same assumptions against a **real** Supabase project + deployment (PASS/FAIL table); see `docs/SUPABASE-GO-LIVE.md` |

Not covered without a real project: network behaviour and PostgREST edge cases (embedded resources are not used by the SIS), GoTrue (real e-mail delivery, its password policy and rate limits), Storage, Vercel cookies/domains.

## 12. Deferred / notes

* SQL has reference seed only (year, 4 terms, 12 subjects, 14 classes). People/attendance/grades demo data is generated by `lib/school/demo-data.ts` (demo mode); in Supabase mode import students with `/import/students` and create the rest in the director UI.
* Per-lesson attendance (`lesson_no`) is supported by API and DB; the demo data uses daily mode.
* Accounts are still provisioned by the director (no self-registration), but every user can now change the password (`/auth/change-password`), reset it by e-mail (`/auth/request-reset` + `/auth/complete-reset`, needs SMTP, see `docs/SUPABASE-GO-LIVE.md`) and must change a temporary password at first login.
* There is no e-mail notification channel (reported as unavailable by the API). Telegram is the only external channel. Account management (reset password / activate) is limited to teacher, parent and student logins; only a super_admin may manage a school_admin, nobody manages a super_admin or themselves.
* Rate limiting of reads uses the in-process store (per instance); writes use `rate_limit_hit()` when Supabase is configured.

## 13. UI TODO (phase 3)

Backend is done and documented above; these screens/handlers are still missing or need wiring (components/school/**, app/school/**):

1. **Forced password change**: after `POST /auth/login` (`must_change_password`) or on `GET /me` with `must_change_password:true`, redirect everything to a change-password screen (`POST /auth/change-password`). Show `wrong_password`, `weak_password` (list the rules: 8-72 chars, letter + digit, not common / e-mail name / same as current) and `rate_limited`. Treat `403 password_change_required` from any API call the same way (portal layout guard).
2. **Account page** (all roles): change password; **notification preferences** (`GET/PUT /me/prefs`: absence, announcements, telegram, e-mail, low grade; explain that e-mail and low-grade notices are not sent yet).
3. **Login page**: "Forgot password" -> `POST /auth/request-reset` (always show the same neutral message; in demo mode say that nothing is sent). New public page **`/school/reset-password`** (the Supabase redirect target; read `token_hash` or `code` from the query string, ask for the new password twice, `POST /auth/complete-reset`, then send the user to `/school/login`; demo: code `demo-reset`).
4. **Director - invite guardian** (student profile / guardians list): form for e-mail + name + children -> `POST /guardians/invite`; show the temporary password ONCE with a copy button and the "must change at first login" note. Same for `POST /accounts` / `/accounts/reset-password` responses (`must_change_password` is now returned).
5. **Director - schedule editor**: translate the new `room_busy` error (409) next to `conflict`.
6. **Teacher - term grades**: send `override_reason` in `rows[]` (replace the legacy `reasons` map), show the stored `override_reason` from `GET /grades/term` (and `GET /grades/gradebook` -> `term_grade.override_reason`) as a tooltip/badge on overridden grades.
7. **Teacher - excuses**: notifications of type `absence_excuse` need an "Accept" button -> `POST /teacher/excuse/accept {notificationId}` (handle `already_resolved`, `term_locked`, `edit_window_closed`, `forbidden`), then refresh the attendance sheet (the absence is now `excused`).
8. **Family - excuses/notifications**: show `resolved` / `resolved_at` / `resolved_by` from `GET /family/excuse` next to each explanation; render the new notification type `excuse_resolved` (payload `student_name`, `date`, `by`, `status:"accepted"`).
9. **Family - progress/report card**: optional "class average" column from `GET /family/class-average?student&term` (`average:null` = hidden because fewer than 5 pupils have grades; show "-", never an error).
10. i18n for every new error code: `room_busy`, `password_change_required`, `wrong_password`, `weak_password`, `invalid_token`, `already_resolved` (uz/ru/en).
