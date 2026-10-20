// Loads supabase/schema.sql into an in-memory PostgreSQL (PGlite) with Supabase stubs and runs
// behavioural assertions: RPC flows, RLS per role, grants. Usage: npm run db:check
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const schema = read("supabase/schema.sql");
const stubs = read("scripts/db/stubs.sql");

const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = {
  super: "11111111-1111-4111-8111-111111111111",
  meth: "22222222-2222-4222-8222-222222222222",
  psy: "33333333-3333-4333-8333-333333333333",
  student: "44444444-4444-4444-8444-444444444444",
  inactive: "55555555-5555-4555-8555-555555555555",
};

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}
const assert = (c, msg) => {
  if (!c) throw new Error(msg || "assertion failed");
};
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg ?? "eq"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/** Run fn with the given DB role and JWT subject, then restore the superuser session. */
async function as(role, uid, fn) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.query("select set_config('request.jwt.claim.role', '', false)");
  }
}
const anon = (fn) => as("anon", null, fn);
const user = (uid, fn) => as("authenticated", uid, fn);
// register_olympiad / submit_quiz_attempt / submit_psych_test are service_role only (API routes call them after rate limit + CSRF)
const svcRpc = (fn) => as("service_role", null, fn);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const rpc = async (fn, args = []) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(",");
  return (await one(`select public.${fn}(${ph}) as r`, args)).r;
};
async function fails(re, fn) {
  try {
    await fn();
  } catch (e) {
    assert(re.test(e.message), `error "${e.message}" does not match ${re}`);
    return;
  }
  throw new Error(`expected failure matching ${re}, but it succeeded`);
}
/** Statement that must either error with a permission/RLS message or affect/return zero rows. */
async function denied(sql, params) {
  try {
    const r = await db.query(sql, params);
    const n = r.rows.length || r.affectedRows || 0;
    assert(n === 0, `expected denial, got ${n} row(s)`);
  } catch (e) {
    assert(/permission denied|row-level security|forbidden/i.test(e.message), `unexpected error: ${e.message}`);
  }
}
const ok = async (sql, params) => db.query(sql, params);

// ---------------------------------------------------------------------------
console.log("Loading stubs + schema.sql (twice, to prove idempotency)...");
await db.exec(stubs);
await db.exec(schema);
await db.exec(schema);

// Users -> profiles (trigger) -> roles
for (const [k, uid] of Object.entries(U)) {
  await q("insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)", [uid, `${k}@test.uz`, JSON.stringify({ full_name: k })]);
}
await q("update public.profiles set role='super_admin' where id=$1", [U.super]);
await q("update public.profiles set role='methodist' where id=$1", [U.meth]);
await q("update public.profiles set role='psychologist' where id=$1", [U.psy]);
await q("update public.profiles set role='super_admin', is_active=false where id=$1", [U.inactive]);

const OLY = id(41);
// PGlite needs explicit casts for typed RPC params
async function register(over = {}) {
  const a = { oly: OLY, name: "Ali Valiyev", birth: "2014-03-02", school: "School 5", grade: 5, subject: "math", phone: "+998901112233", extra: null, ...over };
  return (
    await one("select public.register_olympiad($1::uuid,$2::text,$3::date,$4::text,$5::int,$6::text,$7::text,$8::text) as r", [
      a.oly, a.name, a.birth, a.school, a.grade, a.subject, a.phone, a.extra,
    ])
  ).r;
}

console.log("\nSchema / seed");
await test("seed counts", async () => {
  const c = async (t) => Number((await one(`select count(*)::int n from public.${t}`)).n);
  eq(await c("programs"), 3, "programs");
  eq(await c("campus_life"), 4, "campus_life");
  eq(await c("staff_members"), 6, "staff");
  eq(await c("student_achievements"), 4, "achievements");
  eq(await c("olympiads"), 1, "olympiads");
  eq(await c("academic_quizzes"), 2, "quizzes");
  eq(await c("academic_questions"), 10, "questions");
  eq(await c("psych_tests"), 2, "psych_tests");
  eq(await c("psych_result_scales"), 6, "scales");
  eq(await c("brain_games"), 8, "games");
  eq(await c("game_leaderboard"), 6, "leaderboard");
});
await test("psych_tests audience/topic constraints", async () => {
  const t = await q("select target_audience, topic from public.psych_tests order by id");
  assert(t.every((x) => ["kids", "teens", "older", "parents"].includes(x.target_audience)), "audience seeded");
  assert(t.every((x) => ["interests", "temperament", "career", "readiness", "emotional"].includes(x.topic)), "topic seeded");
  await fails(/psych_tests_audience_chk/, () => q("update public.psych_tests set target_audience='student' where id=$1", [id(61)]));
  await fails(/psych_tests_topic_chk/, () => q("update public.psych_tests set topic='nope' where id=$1", [id(61)]));
  const d = await one("select column_default from information_schema.columns where table_name='psych_tests' and column_name='target_audience'");
  assert(/kids/.test(d.column_default), "default kids");
});
await test("updated_at trigger", async () => {
  const before = await one("select updated_at from public.programs where id=$1", [id(1)]);
  await new Promise((r) => setTimeout(r, 15));
  await q("update public.programs set sort_order = sort_order where id=$1", [id(1)]);
  const after = await one("select updated_at from public.programs where id=$1", [id(1)]);
  assert(new Date(after.updated_at) > new Date(before.updated_at), "updated_at not bumped");
});

console.log("\nRPC: olympiad");
let ticket;
await test("register_olympiad (anon) returns ticket + qr + olympiad", async () => {
  const r = await svcRpc(() => register());
  assert(/^OLY-\d{4}-[0-9A-F]{10}$/.test(r.ticket_number), `ticket ${r.ticket_number}`);
  eq(r.qr_code_payload, r.ticket_number, "qr");
  eq(r.olympiad.id, OLY, "olympiad id");
  eq(r.status, "pending", "status");
  ticket = r.ticket_number;
});
await test("register_olympiad duplicate -> already_registered", () => fails(/already_registered/, () => svcRpc(() => register({ name: "  ali valiyev " }))));
await test("register_olympiad invalid subject / input / not_found", async () => {
  await fails(/invalid_subject/, () => svcRpc(() => register({ subject: "chess" })));
  await fails(/invalid_input/, () => svcRpc(() => register({ name: "A" })));
  await fails(/invalid_input/, () => svcRpc(() => register({ grade: 12 })));
  await fails(/invalid_input/, () => svcRpc(() => register({ birth: "2999-01-01" })));
  await fails(/not_found/, () => svcRpc(() => register({ oly: id(999) })));
});
await test("register_olympiad closed (flag and deadline)", async () => {
  await q("update public.olympiads set is_registration_open=false where id=$1", [OLY]);
  await fails(/registration_closed/, () => svcRpc(() => register({ name: "Closed Flag" })));
  await q("update public.olympiads set is_registration_open=true, registration_deadline=now()-interval '1 hour' where id=$1", [OLY]);
  await fails(/registration_closed/, () => svcRpc(() => register({ name: "Closed Deadline" })));
  await q("update public.olympiads set registration_deadline=now()+interval '10 days' where id=$1", [OLY]);
});
await test("register_olympiad ineligible grade", async () => {
  await q("update public.olympiads set eligible_grades='{5,6}' where id=$1", [OLY]);
  await fails(/grade_not_eligible/, () => svcRpc(() => register({ name: "Grade Seven", grade: 7 })));
  await q("update public.olympiads set eligible_grades='{1,2,3,4,5,6,7,8,9,10,11}' where id=$1", [OLY]);
});
await test("register_olympiad per-phone daily cap (8) incl. across olympiads", async () => {
  for (let i = 0; i < 8; i++) await svcRpc(() => register({ name: `Cap Student ${i}`, phone: "+998933334455" }));
  await fails(/too_many_registrations/, () => svcRpc(() => register({ name: "Cap Student X", phone: "+998933334455" })));
});
// check_olympiad_result / olympiad_leaderboard are service-role only (called by the rate-limited API route).
const svc = (fn) => as("service_role", null, fn);
await test("check_olympiad_result / olympiad_leaderboard: anon + authenticated EXECUTE denied", async () => {
  await anon(() => denied("select public.check_olympiad_result('OLY-2026-0000000000')"));
  await user(U.super, () => denied("select public.check_olympiad_result('OLY-2026-0000000000')"));
  await anon(() => denied("select public.olympiad_leaderboard('" + OLY + "')"));
  await user(U.super, () => denied("select public.olympiad_leaderboard('" + OLY + "')"));
  await anon(() => denied("select public._short_name('A B')"));
});
await test("check_olympiad_result: null while unpublished (same as unknown ticket)", async () => {
  await q("update public.olympiad_registrations set score=87, rank_place=2 where ticket_number=$1", [ticket]);
  eq(await svc(async () => (await one("select public.check_olympiad_result($1) r", [ticket])).r), null, "unpublished");
  eq(await svc(async () => (await one("select public.check_olympiad_result('OLY-2000-ABCDEF0123') r")).r), null, "unknown");
});
await test("check_olympiad_result shows whitelisted fields + short name once published", async () => {
  await q("update public.olympiads set is_results_published=true where id=$1", [OLY]);
  const r = await svc(async () => (await one("select public.check_olympiad_result($1) r", [ticket.toLowerCase()])).r);
  eq(Number(r.score), 87, "score");
  eq(r.rank_place, 2, "rank");
  eq(r.student_full_name, "Ali V.", "name shortened in SQL");
  eq(Object.keys(r).sort(), ["grade", "max_score", "olympiad_title", "rank_place", "results_published", "score", "status", "student_full_name", "subject_key", "ticket_number"], "whitelist");
});
await test("olympiad_leaderboard only when published; shortened names", async () => {
  const pub = await svc(() => rpc("olympiad_leaderboard", [OLY]));
  eq(pub.length, 1, "rows");
  assert(!("parent_phone" in pub[0]), "no phone");
  eq(pub[0].student_full_name, "Ali V.", "short name");
  await q("update public.olympiads set is_results_published=false where id=$1", [OLY]);
  eq(await svc(() => rpc("olympiad_leaderboard", [OLY])), [], "hidden when unpublished");
});

console.log("\nRPC: quiz");
await test("list_quizzes has question_count", async () => {
  const l = await anon(() => rpc("list_quizzes"));
  eq(l.length, 2, "count");
  assert(l.every((x) => x.question_count === 5), "question_count");
  await q("update public.academic_quizzes set is_active=false where id=$1", [id(52)]);
  eq((await anon(() => rpc("list_quizzes"))).length, 1, "inactive hidden");
  await q("update public.academic_quizzes set is_active=true where id=$1", [id(52)]);
});
await test("get_quiz_questions has no answers", async () => {
  const qs = await anon(() => rpc("get_quiz_questions", [id(51)]));
  eq(qs.length, 5, "5 questions");
  const s = JSON.stringify(qs);
  assert(!/correct/i.test(s) && !/explanation/i.test(s), "answer leakage");
  eq(qs.map((x) => x.sort_order), [1, 2, 3, 4, 5], "order");
});
await test("get_quiz_questions inactive -> []", async () => {
  await q("update public.academic_quizzes set is_active=false where id=$1", [id(51)]);
  eq(await anon(() => rpc("get_quiz_questions", [id(51)])), [], "inactive");
  await q("update public.academic_quizzes set is_active=true where id=$1", [id(51)]);
});
const submitQuiz = (quiz, answers, name = "Test Kid") =>
  svcRpc(async () => (await one("select public.submit_quiz_attempt($1::uuid,$2::jsonb,$3,$4::int,$5,$6::int) r", [quiz, JSON.stringify(answers), name, 5, "+998901234567", 120])).r);
await test("submit_quiz_attempt scoring (100 / 60 / 0)", async () => {
  const correct = { [id(101)]: "B", [id(102)]: "C", [id(103)]: "C", [id(104)]: "C", [id(105)]: "C" };
  let r = await submitQuiz(id(51), correct);
  eq([r.correct, r.total, Number(r.score_percent), r.passed], [5, 5, 100, true], "perfect");
  assert(r.results.every((x) => x.correct && x.correct_option_id), "results detail");
  r = await submitQuiz(id(51), { ...correct, [id(101)]: "A", [id(102)]: "A" });
  eq([r.correct, Number(r.score_percent), r.passed], [3, 60, true], "60%");
  r = await submitQuiz(id(51), { [id(101)]: "A", bogus: "Z" });
  eq([r.correct, Number(r.score_percent), r.passed], [0, 0, false], "0%");
  eq(r.results.find((x) => x.question_id === id(103)).selected_option_id, null, "unanswered");
  eq(Number((await one("select count(*)::int n from public.academic_quiz_attempts")).n), 3, "attempts stored");
});
await test("submit_quiz_attempt: percent is an integer and `passed` uses that same value", async () => {
  const origPass = (await one("select passing_score_percent p from public.academic_quizzes where id=$1", [id(51)])).p;
  await q("update public.academic_questions set points=3 where id=$1", [id(101)]);
  const r =await submitQuiz(id(51), { [id(101)]: "B" }); // 3 of 7 points = 42.857 -> 43
  eq(Number(r.score_percent), 43, "integer percent");
  await q("update public.academic_quizzes set passing_score_percent=43 where id=$1", [id(51)]);
  const r2 = await submitQuiz(id(51), { [id(101)]: "B" });
  eq([Number(r2.score_percent), r2.passed], [43, true], "pass decided on the returned (rounded) value");
  await q("update public.academic_quizzes set passing_score_percent=$2 where id=$1", [id(51), origPass]);
  await q("update public.academic_questions set points=1 where id=$1", [id(101)]);
});
await test("submit_quiz_attempt validation", async () => {
  await fails(/invalid_input/, () => submitQuiz(id(51), {}, "   "));
  await fails(/not_found/, () => submitQuiz(id(999), {}));
  await fails(/invalid_input/, () => svcRpc(() => one("select public.submit_quiz_attempt($1::uuid,'[]'::jsonb,'x') r", [id(51)])));
  await fails(/invalid_input|log_size/, () => submitQuiz(id(51), { big: "x".repeat(30000) }));
});

console.log("\nRPC: psych");
const submitPsych = (test, answers, name = "Kid") =>
  svcRpc(async () => (await one("select public.submit_psych_test($1::uuid,$2::jsonb,$3::text) r", [test, JSON.stringify(answers), name])).r);
const allAns = async (testId, opt) => Object.fromEntries((await q("select id from public.psych_questions where psych_test_id=$1", [testId])).map((r) => [r.id, opt]));
await test("get/list psych: no scores, audience+topic present", async () => {
  const t = await anon(() => rpc("get_psych_test", [id(61)]));
  eq([t.target_audience, t.topic, t.questions.length], ["kids", "emotional", 4], "test");
  assert(!/score/.test(JSON.stringify(t)), "score leakage");
  const l = await anon(() => rpc("list_psych_tests"));
  eq(l.length, 2, "list");
  assert(!/"score"/.test(JSON.stringify(l)), "score leakage in list");
  assert((await anon(() => rpc("get_psych_questions", [id(61)]))).length === 4, "questions array");
  eq(await anon(() => rpc("get_psych_test", [id(999)])), null, "unknown");
});
await test("submit_psych_test scale matching", async () => {
  let r = await submitPsych(id(61), await allAns(id(61), "A"));
  eq([Number(r.total_score), Number(r.max_score), r.scale.result_title.en], [0, 12, "Low anxiety"], "low");
  eq([r.target_audience, r.topic], ["kids", "emotional"], "meta");
  const mid = await allAns(id(61), "B"); // 4 -> moderate
  r = await submitPsych(id(61), mid);
  eq(r.scale.result_title.en, "Moderate anxiety", "moderate");
  r = await submitPsych(id(61), await allAns(id(61), "D"));
  eq([Number(r.total_score), r.scale.result_title.en, r.scale.badge_color], [12, "High anxiety", "#ef4444"], "high");
  r = await submitPsych(id(62), await allAns(id(62), "C"));
  eq([Number(r.total_score), r.scale.result_title.en], [12, "High motivation"], "motivation high");
  r = await submitPsych(id(62), await allAns(id(62), "A"));
  eq([Number(r.total_score), r.scale.result_title.en], [4, "Low motivation"], "motivation low");
});
await test("submit_psych_test anonymous + validation", async () => {
  const payload = JSON.stringify(await allAns(id(61), "A"));
  const r = await svcRpc(async () => (await one("select public.submit_psych_test($1::uuid,$2::jsonb) r", [id(61), payload])).r);
  eq(Number(r.total_score), 0, "all answered");
  eq((await one("select student_name from public.psych_test_submissions order by created_at desc limit 1")).student_name, "Anonymous", "anon name");
  await fails(/not_found/, () => submitPsych(id(999), {}));
  await fails(/invalid_input/, () => svcRpc(() => one("select public.submit_psych_test($1::uuid,'[]'::jsonb) r", [id(61)])));
});
await test("submit_psych_test rejects missing / unknown answers BEFORE inserting", async () => {
  const before = Number((await one("select count(*)::int n from public.psych_test_submissions")).n);
  await fails(/incomplete_answers/, () => submitPsych(id(61), {}));
  const partial = await allAns(id(61), "A");
  delete partial[Object.keys(partial)[0]];
  await fails(/incomplete_answers/, () => submitPsych(id(61), partial));
  const bogus = await allAns(id(61), "ZZ");
  await fails(/incomplete_answers/, () => submitPsych(id(61), bogus));
  eq(Number((await one("select count(*)::int n from public.psych_test_submissions")).n), before, "nothing stored");
});
await test("submit_psych_test: gap between scales -> nearest scale; no scales -> no_matching_scale", async () => {
  // test 61 scales cover 0..?; open a gap by narrowing the lowest scale, then score inside the gap
  const sc = await q("select id, min_score, max_score from public.psych_result_scales where psych_test_id=$1 order by min_score", [id(61)]);
  assert(sc.length >= 2, "scales");
  const lowId = sc[0].id;
  const origMax = sc[0].max_score;
  const mid = await allAns(id(61), "B"); // total 4 (see scale matching test)
  await q("update public.psych_result_scales set max_score = min_score where id=$1", [lowId]);
  await q("update public.psych_result_scales set min_score = min_score + 2 where id=$1", [sc[1].id]);
  const r = await submitPsych(id(61), mid);
  assert(r.scale && r.scale.result_title, "nearest scale returned for a gap");
  await q("update public.psych_result_scales set max_score=$2 where id=$1", [lowId, origMax]);
  await q("update public.psych_result_scales set min_score = min_score - 2 where id=$1", [sc[1].id]);
  const saved = await q("select * from public.psych_result_scales where psych_test_id=$1", [id(62)]);
  await q("delete from public.psych_result_scales where psych_test_id=$1", [id(62)]);
  await fails(/no_matching_scale/, async () => submitPsych(id(62), await allAns(id(62), "A")));
  for (const s of saved) {
    await q("insert into public.psych_result_scales (id, psych_test_id, min_score, max_score, result_title, psychological_analysis, recommendations_for_parents, badge_color) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [s.id, s.psych_test_id, s.min_score, s.max_score, JSON.stringify(s.result_title), JSON.stringify(s.psychological_analysis), JSON.stringify(s.recommendations_for_parents), s.badge_color]);
  }
});

console.log("\nRPC: rate limiting");
await test("rate_limit_hit allows max then blocks (service_role)", async () => {
  const hit = (k, m = 3, w = 60) => as("service_role", null, async () => (await one("select public.rate_limit_hit($1::text,$2::int,$3::int) r", [k, m, w])).r);
  eq([await hit("k1"), await hit("k1"), await hit("k1"), await hit("k1")], [true, true, true, false], "sequence");
  eq(await hit("k2"), true, "other key independent");
  await fails(/invalid_input/, () => hit("k3", 0));
});
await test("rate_limit_hit / purge not callable by anon or authenticated", async () => {
  await anon(() => denied("select public.rate_limit_hit('x',1,1)"));
  await user(U.super, () => denied("select public.rate_limit_hit('x',1,1)"));
  await anon(() => denied("select public.purge_old_data()"));
  await user(U.super, () => denied("select public.purge_old_data()"));
  const r = await as("service_role", null, async () => (await one("select public.purge_old_data() r")).r);
  assert("site_visits" in r, "purge result");
});

console.log("\nRLS: anonymous");
await test("anon cannot read sensitive tables", async () => {
  for (const t of [
    "olympiad_registrations", "academic_questions", "academic_quiz_attempts", "psych_questions",
    "psych_test_submissions", "psych_result_scales", "admission_applications", "site_visits", "profiles", "audit_log", "rate_limits",
  ]) {
    await anon(() => denied(`select * from public.${t} limit 1`));
  }
});
await test("anon can read public content; inactive rows hidden", async () => {
  eq(Number((await anon(() => one("select count(*)::int n from public.programs"))).n), 3, "programs");
  await q("update public.programs set is_active=false where id=$1", [id(3)]);
  eq(Number((await anon(() => one("select count(*)::int n from public.programs"))).n), 2, "inactive hidden");
  await q("update public.programs set is_active=true where id=$1", [id(3)]);
  assert(Number((await anon(() => one("select count(*)::int n from public.olympiads"))).n) === 1, "olympiads");
  assert(Number((await anon(() => one("select count(*)::int n from public.game_leaderboard"))).n) === 6, "leaderboard");
  assert(Number((await anon(() => one("select count(*)::int n from public.site_settings"))).n) === 1, "settings");
});
await test("anon cannot write content", async () => {
  await anon(() => denied("update public.programs set sort_order=99 returning id"));
  await anon(() => denied("delete from public.programs returning id"));
  await anon(() => denied("insert into public.programs (category) values ('primary') returning id"));
  await anon(() => denied("insert into public.olympiad_registrations (olympiad_id, student_full_name, birth_date, current_school, grade, subject_key, parent_phone) values ('" + OLY + "','Hack Er','2010-01-01','x',5,'math','+998900000000')"));
  await anon(() => denied("insert into public.academic_quiz_attempts (quiz_id, student_name) values ('" + id(51) + "','x')"));
  await anon(() => denied("insert into public.audit_log (action, resource) values ('x','y')"));
});
await test("anon can NOT insert applications / leaderboard rows / visits directly (API route + service role only)", async () => {
  await anon(() => denied("insert into public.admission_applications (parent_name, phone, message) values ('Parent One','+998901112233','hi') returning id"));
  await anon(() => denied("insert into public.game_leaderboard (game_id, player_name, difficulty, score, completion_time_ms, accuracy_percent) values ('" + id(71) + "','Zoya','easy',500,12000,90) returning id"));
  await anon(() => denied("insert into public.site_visits (path, locale) values ('/', 'uz') returning id"));
  for (const t of ["admission_applications", "game_leaderboard", "site_visits"]) {
    const g = await one("select has_table_privilege('anon', $1, 'insert') a, has_table_privilege('authenticated', $1, 'insert') b", [`public.${t}`]);
    assert(!g.a, `anon insert grant on ${t}`);
    const pol = await q("select 1 from pg_policies where schemaname='public' and tablename=$1 and cmd='INSERT'", [t]);
    eq(pol.length, 0, `no INSERT policy on ${t}`);
  }
  // an authenticated non-staff user is denied too
  await user(U.student, () => denied("insert into public.admission_applications (parent_name, phone) values ('P','+998901112233') returning id"));
  // the service role (the API routes) can insert, and the CHECK constraints still apply
  await svc(() => ok("insert into public.admission_applications (parent_name, phone, message) values ('Parent One','+998901112233','hi')"));
  await fails(/admission_applications_input_chk|violates check/, () => svc(() => ok("insert into public.admission_applications (parent_name, phone) values ('Parent','<script>')")));
  await svc(() => ok("insert into public.game_leaderboard (game_id, player_name, difficulty, score, completion_time_ms, accuracy_percent) values ($1,'Zoya','easy',500,12000,90)", [id(71)]));
  await fails(/game_leaderboard_input_chk/, () => svc(() => ok("insert into public.game_leaderboard (game_id, player_name, score) values ($1,'<b>x</b>',5)", [id(71)])));
  await svc(() => ok("insert into public.site_visits (path, locale) values ('/', 'uz')"));
  await q("delete from public.game_leaderboard where player_name='Zoya'");
  // (one application row stays: the staff-role tests below read it)
});
await test("get_leaderboard: deterministic tie-break (score desc, time asc, created_at asc, id)", async () => {
  const gid = id(71);
  const mk = (name, score, ms, at) =>
    q("insert into public.game_leaderboard (id, game_id, player_name, difficulty, score, completion_time_ms, created_at) values (gen_random_uuid(), $1,$2,'hard',$3,$4,$5)", [gid, name, score, ms, at]);
  await mk("TieB", 9000, 5000, "2026-01-02T00:00:00Z");
  await mk("TieA", 9000, 5000, "2026-01-01T00:00:00Z");
  await mk("TieFast", 9000, 4000, "2026-01-03T00:00:00Z");
  const slug = (await one("select game_slug from public.brain_games where id=$1", [gid])).game_slug;
  const list = await anon(() => q("select player_name from public.get_leaderboard($1,'hard',3)", [slug]));
  const names = list.map((x) => x.player_name);
  eq(names.slice(0, 3), ["TieFast", "TieA", "TieB"], "order");
  await q("delete from public.game_leaderboard where player_name like 'Tie%'");
});

console.log("\nRLS: roles");
const count = (uid, t, where = "true") => user(uid, async () => Number((await one(`select count(*)::int n from public.${t} where ${where}`)).n));
await test("plain authenticated user (student): no staff data", async () => {
  eq(await count(U.student, "olympiad_registrations"), 0, "registrations");
  eq(await count(U.student, "admission_applications"), 0, "applications");
  eq(await count(U.student, "academic_questions"), 0, "questions");
  eq(await count(U.student, "audit_log"), 0, "audit");
  eq(await count(U.student, "profiles"), 1, "only own profile");
  await user(U.student, () => denied("update public.programs set sort_order=1 returning id"));
  await user(U.student, () => denied("insert into storage.objects (bucket_id, name) values ('school-media','x') returning id"));
});
await test("profile privilege escalation blocked", async () => {
  await fails(/forbidden/, () => user(U.student, () => ok("update public.profiles set role='super_admin' where id=$1", [U.student])));
  await fails(/forbidden/, () => user(U.student, () => ok("update public.profiles set is_active=true, role='methodist' where id=$1", [U.student])));
  await user(U.student, () => ok("update public.profiles set full_name='New Name', grade=6 where id=$1", [U.student]));
  eq((await one("select full_name from public.profiles where id=$1", [U.student])).full_name, "New Name", "own profile update");
  await user(U.meth, () => denied("update public.profiles set role='super_admin' where id=$1 returning id", [U.meth]));
});
await test("inactive super_admin has no privileges", async () => {
  eq(await count(U.inactive, "olympiad_registrations"), 0, "registrations");
  eq(await count(U.inactive, "audit_log"), 0, "audit");
});
await test("super_admin: full access incl. audit_log read, no direct audit insert", async () => {
  assert((await count(U.super, "olympiad_registrations")) > 1, "registrations");
  assert((await count(U.super, "academic_questions")) === 10, "questions");
  assert((await count(U.super, "psych_questions")) === 8, "psych questions");
  await as("service_role", null, () => ok("insert into public.audit_log (user_id, user_email, action, resource, record_id, diff) values ($1,'a@b.c','update','programs','1','{\"a\":1}')", [U.super]));
  eq(await count(U.super, "audit_log"), 1, "audit visible to super_admin");
  eq(await count(U.meth, "audit_log"), 0, "audit hidden from methodist");
  eq(await count(U.psy, "audit_log"), 0, "audit hidden from psychologist");
  await fails(/permission denied|row-level security/, () => user(U.super, () => ok("insert into public.audit_log (action, resource) values ('x','y')")));
  await user(U.super, () => ok("update public.programs set sort_order = 5 where id=$1", [id(1)]));
  eq(await count(U.super, "profiles"), 5, "sees all profiles");
  await user(U.super, () => ok("update public.profiles set role='teacher' where id=$1", [U.student]));
  await q("update public.profiles set role='student' where id=$1", [U.student]);
});
await test("methodist: content/olympiads/quizzes yes, psych no", async () => {
  assert((await count(U.meth, "olympiad_registrations")) > 1, "registrations");
  assert((await count(U.meth, "academic_questions")) === 10, "questions");
  eq(await count(U.meth, "psych_questions"), 0, "psych questions hidden");
  eq(await count(U.meth, "psych_test_submissions"), 0, "psych submissions hidden");
  await user(U.meth, () => ok("insert into public.programs (category, grade_range) values ('primary','1-4')"));
  await fails(/row-level security/, () => user(U.meth, () => ok("insert into public.psych_tests (target_audience) values ('kids')")));
  assert((await count(U.meth, "admission_applications")) >= 1, "reads applications");
  await user(U.meth, () => ok("update public.admission_applications set status='contacted', admin_notes='called'"));
  await user(U.meth, () => denied("delete from public.admission_applications returning id"));
  await user(U.meth, () => ok("insert into storage.objects (bucket_id, name) values ('school-media','a.png')"));
});
await test("psychologist: psych yes, olympiad/quiz data no, applications read-only", async () => {
  eq(await count(U.psy, "olympiad_registrations"), 0, "registrations hidden");
  eq(await count(U.psy, "academic_questions"), 0, "quiz questions hidden");
  assert((await count(U.psy, "psych_questions")) === 8, "psych questions");
  assert((await count(U.psy, "psych_test_submissions")) >= 5, "psych submissions");
  await user(U.psy, () => ok("insert into public.psych_tests (target_audience, topic) values ('parents','career')"));
  await user(U.psy, () => ok("update public.psych_result_scales set badge_color='#000000' where id=$1", [id(301)]));
  await fails(/row-level security/, () => user(U.psy, () => ok("insert into public.programs (category) values ('high')")));
  assert((await count(U.psy, "admission_applications")) >= 1, "reads applications");
  await user(U.psy, () => denied("update public.admission_applications set status='accepted' returning id"));
  await user(U.psy, () => denied("update public.olympiads set is_results_published=true returning id"));
});
await test("storage: only staff write; anon lists content buckets but NOT certificates", async () => {
  assert(Number((await anon(() => one("select count(*)::int n from storage.objects"))).n) >= 1, "anon read");
  await q("insert into storage.objects (bucket_id, name) values ('certificates','quiz/x/secret.pdf')");
  eq(Number((await anon(() => one("select count(*)::int n from storage.objects where bucket_id='certificates'"))).n), 0, "anon cannot list certificates");
  eq(Number((await user(U.student, () => one("select count(*)::int n from storage.objects where bucket_id='certificates'"))).n), 0, "student cannot list certificates");
  eq(Number((await user(U.psy, () => one("select count(*)::int n from storage.objects where bucket_id='certificates'"))).n), 1, "staff can list certificates");
  await anon(() => denied("insert into storage.objects (bucket_id, name) values ('school-media','z') returning id"));
  eq(Number((await one("select file_size_limit from storage.buckets where id='school-media'")).file_size_limit), 8388608, "size limit");
});
await test("table grants: anon has no privileges on sensitive tables", async () => {
  for (const t of ["olympiad_registrations", "academic_questions", "psych_questions", "audit_log", "rate_limits", "profiles"]) {
    const r = await one("select has_table_privilege('anon', $1, 'select') s, has_table_privilege('authenticated', $1, 'truncate') t", [`public.${t}`]);
    assert(!r.s, `anon select on ${t}`);
    assert(!r.t, `authenticated truncate on ${t}`);
  }
  const rl = await one("select has_table_privilege('authenticated','public.rate_limits','select') s");
  assert(!rl.s, "authenticated select rate_limits");
});

// ---------------------------------------------------------------------------
console.log("\nSurveys");
const SVY_P = id(401);
const SVY_S = id(402);
const okAnswers = () => ({ [id(411)]: 4, [id(412)]: "B", [id(413)]: ["A", "C"], [id(414)]: 5, [id(415)]: "yes" });
const submitSvy = (survey, answers, token = "tok-aaaaaaaaaaaaaaaa", role = null, grade = null) =>
  svc(async () => (await one("select public.submit_survey_response($1::uuid,$2::jsonb,$3::text,$4::text,$5::int) r", [survey, JSON.stringify(answers), token, role, grade])).r);
const svyCount = async (sid = SVY_P) => Number((await one("select count(*)::int n from public.survey_responses where survey_id=$1", [sid])).n);
const stats = (fn, sid = SVY_P, from = null, to = null) =>
  fn(async () => (await one("select public.survey_stats($1::uuid,$2::timestamptz,$3::timestamptz) r", [sid, from, to])).r);

await test("surveys seed: 2 surveys, 11 questions, no responses", async () => {
  eq(Number((await one("select count(*)::int n from public.surveys")).n), 2, "surveys");
  eq(Number((await one("select count(*)::int n from public.survey_questions")).n), 11, "questions");
  eq(await svyCount(), 0, "responses");
  const t = await q("select distinct type from public.survey_questions order by type");
  eq(t.map((x) => x.type), ["multiple", "scale", "single", "text", "yesno"], "all question types seeded");
});
await test("anon has no table grants on surveys tables (select/insert/update/delete denied)", async () => {
  for (const t of ["surveys", "survey_questions", "survey_responses"]) {
    await anon(() => denied(`select * from public.${t} limit 1`));
    const g = await one("select has_table_privilege('anon', $1, 'select') s, has_table_privilege('anon', $1, 'insert') i, has_table_privilege('anon', $1, 'update') u, has_table_privilege('anon', $1, 'delete') d", [`public.${t}`]);
    assert(!g.s && !g.i && !g.u && !g.d, `anon privileges on ${t}`);
  }
  await anon(() => denied(`insert into public.survey_responses (survey_id, respondent_token_hash, answers) values ('${SVY_P}','aaaaaaaaaaaaaaaaaaaa','{}') returning id`));
  const a = await one("select has_table_privilege('authenticated','public.survey_responses','insert') i, has_table_privilege('authenticated','public.survey_responses','update') u");
  assert(!a.i && !a.u, "authenticated cannot insert/update responses directly");
});
await test("list_surveys / get_survey (anon): open surveys, questions without internals", async () => {
  const l = await anon(() => rpc("list_surveys"));
  eq(l.length, 2, "list");
  assert(l.every((x) => typeof x.question_count === "number" && !("questions" in x)), "question_count only");
  const s = await anon(() => rpc("get_survey", [SVY_P]));
  eq([s.audience, s.questions.length, s.is_anonymous], ["parents", 6, true], "survey");
  eq(s.questions.map((x) => x.sort_order), [1, 2, 3, 4, 5, 6], "ordered");
  assert(!/created_at|updated_at|respondent|survey_id/.test(JSON.stringify(s.questions)), "no internals in questions");
  eq(await anon(() => rpc("get_survey", [id(999)])), null, "unknown");
});
await test("submit_survey_response is service_role only (anon + authenticated denied)", async () => {
  const call = `select public.submit_survey_response('${SVY_P}'::uuid,'{}'::jsonb,'tok-aaaaaaaaaaaaaaaa')`;
  await anon(() => denied(call));
  await user(U.super, () => denied(call));
  await anon(() => denied(`select public.survey_stats('${SVY_P}'::uuid)`));
  await anon(() => denied(`select * from public._survey_filtered('${SVY_P}'::uuid, null, null)`));
});
await test("submit stores a valid response; only a hash of the token is kept", async () => {
  const r = await submitSvy(SVY_P, okAnswers(), "tok-aaaaaaaaaaaaaaaa", "parent");
  eq(r.ok, true, "ok");
  const row = await one("select * from public.survey_responses where survey_id=$1", [SVY_P]);
  eq([row.role_hint, row.answers[id(412)], row.answers[id(413)], row.answers[id(414)]], ["parent", "B", ["A", "C"], 5], "answers");
  assert(/^[0-9a-f]{64}$/.test(row.respondent_token_hash) && !row.respondent_token_hash.includes("tok-aaaa"), "hash stored, not the token");
  assert(!(id(416) in row.answers), "optional blank skipped");
});
await test("submit validation: required, option ids, types, lengths, token", async () => {
  const base = okAnswers();
  const tok = (n) => `tok-validation-${String(n).padStart(4, "0")}`;
  const noRequired = { ...base };
  delete noRequired[id(415)];
  await fails(/required_missing/, () => submitSvy(SVY_P, noRequired, tok(1)));
  await fails(/required_missing/, () => submitSvy(SVY_P, { ...base, [id(412)]: "   " }, tok(2)));
  await fails(/invalid_answer/, () => submitSvy(SVY_P, { ...base, [id(412)]: "Z" }, tok(3)));
  await fails(/invalid_answer/, () => submitSvy(SVY_P, { ...base, [id(413)]: ["A", "A"] }, tok(4)));
  await fails(/invalid_answer/, () => submitSvy(SVY_P, { ...base, [id(413)]: ["Q"] }, tok(5)));
  await fails(/invalid_answer/, () => submitSvy(SVY_P, { ...base, [id(411)]: 6 }, tok(6)));
  await fails(/invalid_answer/, () => submitSvy(SVY_P, { ...base, [id(411)]: 2.5 }, tok(7)));
  await fails(/invalid_answer/, () => submitSvy(SVY_P, { ...base, [id(411)]: "4" }, tok(8)));
  await fails(/invalid_answer/, () => submitSvy(SVY_P, { ...base, [id(415)]: "maybe" }, tok(9)));
  await fails(/invalid_answer/, () => submitSvy(SVY_P, { ...base, [id(416)]: "x".repeat(1001) }, tok(10)));
  await fails(/invalid_input/, () => submitSvy(SVY_P, base, "short"));
  await fails(/invalid_input/, () => submitSvy(SVY_P, base, "tok bad chars!!!!!!!!"));
  await fails(/invalid_input/, () => submitSvy(SVY_P, base, tok(11), "boss"));
  await fails(/invalid_input/, () => submitSvy(SVY_P, base, tok(12), "parent", 12));
  await fails(/invalid_input/, () => submitSvy(SVY_P, [1, 2], tok(13)));
  await fails(/not_found/, () => submitSvy(id(999), base, tok(14)));
  eq(await svyCount(), 1, "nothing extra stored");
  const hashOf = "encode(sha256(convert_to('survey:' || $1::text || ':' || $2::text, 'UTF8')), 'hex')";
  eq((await submitSvy(SVY_P, { ...base, [id(416)]: "y".repeat(1000) }, tok(15))).ok, true, "1000 chars accepted");
  eq((await submitSvy(SVY_P, { ...base, [id(416)]: "   hi   " }, tok(16))).ok, true, "padded text accepted");
  eq((await one(`select answers from public.survey_responses where respondent_token_hash = ${hashOf}`, [SVY_P, tok(15)])).answers[id(416)].length, 1000, "1000 stored");
  eq((await one(`select answers from public.survey_responses where respondent_token_hash = ${hashOf}`, [SVY_P, tok(16)])).answers[id(416)], "hi", "text trimmed");
  await q(`delete from public.survey_responses where respondent_token_hash in (${hashOf}, encode(sha256(convert_to('survey:' || $1::text || ':' || $3::text, 'UTF8')), 'hex'))`, [SVY_P, tok(15), tok(16)]);
});
await test("duplicate token blocked unless allow_multiple_responses", async () => {
  await fails(/already_responded/, () => submitSvy(SVY_P, okAnswers(), "tok-aaaaaaaaaaaaaaaa"));
  eq((await submitSvy(SVY_P, okAnswers(), "tok-bbbbbbbbbbbbbbbb")).ok, true, "other token ok");
  eq((await submitSvy(SVY_S, { [id(421)]: ["A"], [id(422)]: "A", [id(423)]: 3, [id(424)]: "no" }, "tok-aaaaaaaaaaaaaaaa", "student", 5)).ok, true, "same token, other survey ok");
  await q("update public.surveys set allow_multiple_responses=true where id=$1", [SVY_P]);
  eq((await submitSvy(SVY_P, okAnswers(), "tok-aaaaaaaaaaaaaaaa")).ok, true, "repeat allowed when enabled");
  await q("update public.surveys set allow_multiple_responses=false where id=$1", [SVY_P]);
  eq(await svyCount(), 3, "3 responses on the parents survey");
});
await test("non-anonymous survey requires a role", async () => {
  await q("update public.surveys set is_anonymous=false where id=$1", [SVY_S]);
  await fails(/invalid_input/, () => submitSvy(SVY_S, { [id(421)]: ["B"], [id(422)]: "B", [id(423)]: 2, [id(424)]: "yes" }, "tok-cccccccccccccccc"));
  eq((await submitSvy(SVY_S, { [id(421)]: ["B"], [id(422)]: "B", [id(423)]: 2, [id(424)]: "yes" }, "tok-cccccccccccccccc", "student")).ok, true, "with role");
  await q("update public.surveys set is_anonymous=true where id=$1", [SVY_S]);
});
await test("closed surveys are rejected and hidden (ended, not started, inactive)", async () => {
  const answers = { [id(421)]: ["A"], [id(422)]: "A", [id(423)]: 3, [id(424)]: "yes" };
  await q("update public.surveys set ends_at = now() - interval '1 hour' where id=$1", [SVY_S]);
  await fails(/survey_closed/, () => submitSvy(SVY_S, answers, "tok-dddddddddddddddd"));
  eq((await anon(() => rpc("list_surveys"))).length, 1, "ended survey hidden from list");
  eq(await anon(() => rpc("get_survey", [SVY_S])), null, "ended survey hidden from get_survey");
  await q("update public.surveys set ends_at = null, starts_at = now() + interval '1 day' where id=$1", [SVY_S]);
  await fails(/survey_closed/, () => submitSvy(SVY_S, answers, "tok-dddddddddddddddd"));
  eq((await anon(() => rpc("list_surveys"))).length, 1, "future survey hidden from list");
  await q("update public.surveys set starts_at = null, is_active = false where id=$1", [SVY_S]);
  await fails(/not_found/, () => submitSvy(SVY_S, answers, "tok-dddddddddddddddd"));
  eq(await anon(() => rpc("get_survey", [SVY_S])), null, "inactive hidden");
  await q("update public.surveys set is_active = true where id=$1", [SVY_S]);
  eq((await anon(() => rpc("list_surveys"))).length, 2, "reopened");
  await fails(/surveys_dates_chk/, () => q("update public.surveys set starts_at = now(), ends_at = now() - interval '1 day' where id=$1", [SVY_S]));
});
await test("survey_stats: staff only (anon denied, plain user forbidden), correct aggregates", async () => {
  await fails(/forbidden/, () => stats((f) => user(U.student, f)));
  await fails(/forbidden/, () => stats((f) => user(U.inactive, f)));
  for (const staff of [U.super, U.meth, U.psy]) {
    const s = await stats((f) => user(staff, f));
    eq(s.total, 3, "total");
    eq(s.questions.length, 6, "questions");
    const [scale, single, multi, scale2, yn, text] = s.questions;
    eq([scale.scale.avg, scale.scale.min, scale.scale.max], [4, 4, 4], "scale avg/min/max");
    eq(scale.scale.distribution.map((d) => d.count), [0, 0, 0, 3, 0], "scale distribution");
    eq(single.counts.map((c) => c.count), [0, 3, 0, 0], "single counts");
    eq(multi.counts.map((c) => c.count), [3, 0, 3, 0, 0, 0], "multiple counts");
    eq([scale2.answered, yn.counts], [3, [{ id: "yes", count: 3 }, { id: "no", count: 0 }]], "yes/no");
    eq([text.answered, text.texts], [0, []], "no text answers");
  }
  await fails(/not_found/, () => stats((f) => user(U.super, f), id(999)));
});
await test("survey_stats: text answers, date filter, roles", async () => {
  await submitSvy(SVY_P, { ...okAnswers(), [id(411)]: 2, [id(415)]: "no", [id(416)]: "More clubs please" }, "tok-eeeeeeeeeeeeeeee", "parent");
  let s = await stats((f) => user(U.psy, f));
  eq(s.total, 4, "total");
  eq(s.questions[5].texts.map((t) => t.text), ["More clubs please"], "text answers");
  eq([s.questions[0].scale.avg, s.questions[0].scale.min, s.questions[0].scale.max], [3.5, 2, 4], "avg after 2");
  eq(s.by_role.find((r) => r.role === "parent").count, 2, "by_role parent");
  eq(s.by_role.find((r) => r.role === "unknown").count, 2, "by_role unknown");
  assert(s.by_day.length === 1 && s.by_day[0].count === 4, "by_day");
  await q("update public.survey_responses set created_at = now() - interval '10 days' where respondent_token_hash = encode(sha256(convert_to('survey:' || $1::text || ':tok-bbbbbbbbbbbbbbbb', 'UTF8')), 'hex')", [SVY_P]);
  s = await stats((f) => user(U.meth, f), SVY_P, new Date(Date.now() - 3 * 86400000).toISOString());
  eq(s.total, 3, "from filter excludes the old response");
  s = await stats((f) => user(U.meth, f), SVY_P, null, new Date(Date.now() - 3 * 86400000).toISOString());
  eq(s.total, 1, "to filter keeps only the old response");
});
await test("RLS: staff read surveys, only super_admin/methodist write, plain users see nothing", async () => {
  eq(await count(U.student, "surveys"), 0, "student surveys");
  eq(await count(U.student, "survey_responses"), 0, "student responses");
  eq(await count(U.psy, "surveys"), 2, "psychologist reads surveys");
  assert((await count(U.psy, "survey_responses")) >= 4, "psychologist reads responses");
  await fails(/row-level security/, () => user(U.psy, () => ok("insert into public.surveys (audience) values ('all')")));
  await user(U.meth, () => ok("insert into public.surveys (audience, title) values ('teachers', '{\"uz\":\"T\",\"ru\":\"T\",\"en\":\"T\"}')"));
  await user(U.meth, () => ok("insert into public.survey_questions (survey_id, type, question_text) select id, 'text', '{}' from public.surveys where audience='teachers'"));
  await fails(/survey_surveys_audience_chk|surveys_audience_chk/, () => user(U.meth, () => ok("update public.surveys set audience='nobody' where audience='teachers'")));
  await fails(/survey_questions_scale_chk/, () => user(U.meth, () => ok("update public.survey_questions set scale_min=5, scale_max=5 where type='text'")));
  await fails(/survey_questions_type_chk/, () => user(U.meth, () => ok("update public.survey_questions set type='essay' where type='text'")));
  await user(U.psy, () => denied("delete from public.survey_responses returning id"));
  await user(U.meth, () => ok("delete from public.survey_responses where survey_id=$1", [SVY_S]));
  await user(U.super, () => ok("delete from public.surveys where audience='teachers'"));
  eq(Number((await one("select count(*)::int n from public.survey_questions where survey_id not in (select id from public.surveys)")).n), 0, "no orphan questions (cascade)");
});

// ---------------------------------------------------------------------------
console.log("\nContent games (game_content_sets, RPCs)");
const CS = (n) => `00000000-0000-4000-8000-00000000c00${n}`;
const L3 = (t) => ({ uz: t, ru: t, en: t });
const tfItems = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, statement: L3(`Statement ${i + 1}`), is_true: i % 2 === 0, explanation: i % 2 ? L3(`Why ${i + 1}`) : null }));
const quizItem = (i, over = {}) => ({ id: `q${i}`, question: L3(`Q${i}`), options: ["A", "B", "C", "D"].map((o) => ({ id: o, text: L3(`opt${o}`) })), correct_option_id: "C", explanation: L3("because"), ...over });
const quizItems = (n) => Array.from({ length: n }, (_, i) => quizItem(i + 1));
const pairItems = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, left: L3(`L${i + 1}`), right: L3(`R${i + 1}`) }));
const insertSet = (type, items, extra = {}) =>
  ok("insert into public.game_content_sets (game_type, title, items, is_active) values ($1, $2::jsonb, $3::jsonb, $4) returning id", [type, JSON.stringify(L3("T")), JSON.stringify(items), extra.active ?? true]);

await test("seed: 8 brain_games (3 content games) + 5 content sets across the 3 types", async () => {
  eq(Number((await one("select count(*)::int n from public.brain_games")).n), 8, "brain_games");
  eq((await q("select game_slug from public.brain_games where game_slug in ('matching-pairs','true-false','quiz-race') order by 1")).map((r) => r.game_slug), ["matching-pairs", "quiz-race", "true-false"], "slugs");
  const t = await q("select game_type, count(*)::int n from public.game_content_sets group by 1 order by 1");
  eq(t.map((r) => [r.game_type, r.n]), [["matching", 2], ["quiz_race", 2], ["true_false", 1]], "sets per type");
});
await test("anon has NO grants on game_content_sets (select/insert/update/delete denied)", async () => {
  const r = await one("select has_table_privilege('anon','public.game_content_sets','select') s, has_table_privilege('anon','public.game_content_sets','insert') i, has_table_privilege('anon','public.game_content_sets','update') u, has_table_privilege('anon','public.game_content_sets','delete') d");
  assert(!r.s && !r.i && !r.u && !r.d, "anon privileges on game_content_sets");
  await anon(() => denied("select items from public.game_content_sets"));
  await anon(() => denied("update public.game_content_sets set is_active=false returning id"));
});
await test("RLS: students/psychologists see and write nothing; methodist + super_admin manage", async () => {
  eq(Number((await user(U.student, () => one("select count(*)::int n from public.game_content_sets"))).n), 0, "student sees 0");
  await user(U.student, () => denied("insert into public.game_content_sets (game_type, title, items) values ('matching', '{\"uz\":\"x\"}'::jsonb, '[]'::jsonb) returning id"));
  eq(Number((await user(U.psy, () => one("select count(*)::int n from public.game_content_sets"))).n), 0, "psychologist sees 0");
  await user(U.psy, () => denied("update public.game_content_sets set sort_order=9 returning id"));
  eq(Number((await user(U.meth, () => one("select count(*)::int n from public.game_content_sets"))).n), 5, "methodist sees all");
  const created = await user(U.meth, () => insertSet("matching", pairItems(5)));
  assert(created.rows[0].id, "methodist insert");
  await user(U.super, () => ok("update public.game_content_sets set sort_order=50 where id=$1", [created.rows[0].id]));
  await user(U.super, () => ok("delete from public.game_content_sets where id=$1", [created.rows[0].id]));
});
await test("items validated per game type (CHECK constraint)", async () => {
  await fails(/game_content_sets_items_chk/, () => insertSet("matching", pairItems(3)));
  await fails(/game_content_sets_items_chk/, () => insertSet("true_false", tfItems(4)));
  await fails(/game_content_sets_items_chk/, () => insertSet("quiz_race", quizItems(4)));
  await fails(/game_content_sets_items_chk/, () => insertSet("matching", [...pairItems(4), { id: "p1", left: L3("a"), right: L3("b") }]));
  await fails(/game_content_sets_items_chk/, () => insertSet("true_false", [...tfItems(4), { id: "s9", statement: L3("x") }]));
  await fails(/game_content_sets_items_chk/, () => insertSet("quiz_race", [...quizItems(4), quizItem(9, { correct_option_id: "Z" })]));
  await fails(/game_content_sets_items_chk/, () => insertSet("quiz_race", [...quizItems(4), quizItem(9, { options: [{ id: "A", text: L3("only one") }] })]));
  await fails(/game_content_sets_items_chk/, () => insertSet("quiz_race", pairItems(6)));
  await fails(/game_content_sets_items_chk/, () => insertSet("matching", [...pairItems(4), { id: "p9", left: { uz: "", ru: "", en: "" }, right: L3("b") }]));
  await ok("select 1"); // server still healthy
});
await test("list_game_sets (anon): summaries only, active only, filtered by type", async () => {
  const hidden = (await insertSet("true_false", tfItems(5), { active: false })).rows[0].id;
  const all = await anon(() => rpc("list_game_sets", [null]));
  eq(all.length, 5, "5 active sets");
  const tf = await anon(() => rpc("list_game_sets", ["true_false"]));
  eq(tf.length, 1, "one true_false set (inactive hidden)");
  assert(!JSON.stringify(all).includes("is_true") && !JSON.stringify(all).includes("correct_option_id"), "no answers in the list");
  assert(!("items" in tf[0]) && tf[0].item_count === 10, "item_count, no items");
  await q("delete from public.game_content_sets where id=$1", [hidden]);
});
await test("get_game_set (anon): matching ships pairs, true_false / quiz_race never ship items", async () => {
  const m = await anon(() => one("select public.get_game_set($1::uuid) as r", [CS(1)]));
  eq(m.r.items.length, 10, "matching pairs");
  const t = await anon(() => one("select public.get_game_set($1::uuid) as r", [CS(3)]));
  assert(!("items" in t.r), "true_false has no items");
  const z = await anon(() => one("select public.get_game_set($1::uuid) as r", [CS(4)]));
  assert(!("items" in z.r) && !JSON.stringify(z.r).includes("correct"), "quiz_race has no items");
  eq((await anon(() => one("select public.get_game_set($1::uuid) as r", [id(999)]))).r, null, "unknown set");
});
await test("start_content_round (anon): random n items WITHOUT answers", async () => {
  const tf = await anon(() => one("select public.start_content_round($1::uuid, 6) as r", [CS(3)]));
  eq(tf.r.items.length, 6, "6 statements");
  const txt = JSON.stringify(tf.r);
  assert(!txt.includes("is_true") && !txt.includes("explanation"), "no is_true / explanation");
  assert(tf.r.items.every((i) => i.id && i.statement), "ids + statements");
  const quiz = await anon(() => one("select public.start_content_round($1::uuid, 5) as r", [CS(4)]));
  eq(quiz.r.items.length, 5, "5 questions");
  assert(!JSON.stringify(quiz.r).includes("correct_option_id") && !JSON.stringify(quiz.r).includes("explanation"), "no correct_option_id / explanation");
  assert(quiz.r.items.every((i) => i.options.length === 4), "options kept");
  const pairs = await anon(() => one("select public.start_content_round($1::uuid, 6) as r", [CS(1)]));
  eq(pairs.r.items.length, 6, "6 pairs");
  const big = await anon(() => one("select public.start_content_round($1::uuid, 999) as r", [CS(1)]));
  eq(big.r.items.length, 10, "n is capped to the set size");
  const seen = new Set();
  for (let i = 0; i < 8; i++) seen.add((await anon(() => one("select public.start_content_round($1::uuid, 3) as r", [CS(3)]))).r.items.map((x) => x.id).join(","));
  assert(seen.size > 1, "rounds are randomised");
});
await test("check_content_answer / content_fifty_fifty: service_role only", async () => {
  await anon(() => denied(`select public.check_content_answer('${CS(3)}'::uuid, 's1', 'true')`));
  await user(U.super, () => denied(`select public.check_content_answer('${CS(3)}'::uuid, 's1', 'true')`));
  await anon(() => denied(`select public.content_fifty_fifty('${CS(4)}'::uuid, 'q1')`));
  await user(U.meth, () => denied(`select public.content_fifty_fifty('${CS(4)}'::uuid, 'q1')`));
  // seed: s1 "Tashkent is the capital" is true (no explanation), s2 false with an explanation
  const a = await svc(() => one(`select public.check_content_answer('${CS(3)}'::uuid, 's1', 'true') as r`));
  eq([a.r.correct, a.r.explanation], [true, null], "true statement answered true");
  const b = await svc(() => one(`select public.check_content_answer('${CS(3)}'::uuid, 's2', 'true') as r`));
  eq(b.r.correct, false, "false statement answered true");
  assert(b.r.explanation && b.r.explanation.en, "explanation returned");
  const c = await svc(() => one(`select public.check_content_answer('${CS(4)}'::uuid, 'q1', 'A') as r`));
  eq([c.r.correct, c.r.correct_option_id], [true, "A"], "quiz correct");
  const d = await svc(() => one(`select public.check_content_answer('${CS(4)}'::uuid, 'q1', 'B') as r`));
  eq([d.r.correct, d.r.correct_option_id], [false, "A"], "quiz wrong reveals the right option");
  const e = await svc(() => one(`select public.check_content_answer('${CS(4)}'::uuid, 'q1', '') as r`));
  eq(e.r.correct, false, "timed-out answer is wrong");
  eq((await svc(() => one(`select public.check_content_answer('${CS(4)}'::uuid, 'nope', 'A') as r`))).r, null, "unknown item");
  eq((await svc(() => one(`select public.check_content_answer('${CS(1)}'::uuid, 'p1', 'A') as r`))).r, null, "matching is not server-checked");
  const f = await svc(() => one(`select public.content_fifty_fifty('${CS(4)}'::uuid, 'q1') as r`));
  assert(f.r.length === 2 && !f.r.includes("A") && new Set(f.r).size === 2, "two distinct wrong options");
});
await test("leaderboard works for the new game slugs", async () => {
  await svc(() => ok("insert into public.game_leaderboard (game_id, player_name, difficulty, score, completion_time_ms, accuracy_percent) values ('00000000-0000-4000-8000-00000000b003','Quizzer','easy',700,30000,90)"));
  const lb = await anon(() => q("select player_name from public.get_leaderboard('quiz-race','easy',5)"));
  eq(lb.map((r) => r.player_name), ["Quizzer"], "quiz-race leaderboard");
  await q("delete from public.game_leaderboard where player_name='Quizzer'");
});

// ---------------------------------------------------------------------------
console.log("\nSchool management (SIS)");
const S = {
  dir: "a1111111-1111-4111-8111-111111111111",
  tA: "a2222222-2222-4222-8222-222222222222",
  tB: "a3333333-3333-4333-8333-333333333333",
  par: "a4444444-4444-4444-8444-444444444444",
  stu: "a5555555-5555-4555-8555-555555555555",
  par2: "a6666666-6666-4666-8666-666666666666",
};
const CLS_A = id(9201), CLS_B = id(9202), SUBJ_MATH = id(9104), SUBJ_PHYS = id(9105), TERM1 = id(9011), YEAR = id(9001);
const ST = { s1: id(9301), s2: id(9302), s3: id(9303) };
const TEA = id(9401), TEB = id(9402);
const GD = "2026-09-10"; // inside term 1 and in the past
const mark = (uid, cls, date, lesson, recs) =>
  user(uid, async () => (await one("select public.mark_attendance_bulk($1::uuid,$2::date,$3::int,$4::jsonb) r", [cls, date, lesson, JSON.stringify(recs)])).r);
const saveG = (uid, cls, subj, term, entries) =>
  user(uid, async () => (await one("select public.save_grades_bulk($1::uuid,$2::uuid,$3::uuid,$4::jsonb) r", [cls, subj, term, JSON.stringify(entries)])).r);
const tashkentNow = () => Date.now() + 5 * 3600e3; // school_today() is Asia/Tashkent
const today = new Date(tashkentNow()).toISOString().slice(0, 10);
const plusDays = (n) => new Date(tashkentNow() + n * 864e5).toISOString().slice(0, 10);

await test("sis seed: year, 4 terms, 12 subjects, 14 classes", async () => {
  const c = async (t) => Number((await one(`select count(*)::int n from public.${t}`)).n);
  eq([await c("school_years"), await c("terms"), await c("subjects"), await c("classes")], [1, 4, 12, 14], "counts");
  eq((await one("select count(*)::int n from public.school_years where is_current")).n, 1, "one current year");
});

for (const [k, uid] of Object.entries(S)) {
  await q("insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)", [uid, `sis_${k}@test.uz`, JSON.stringify({ full_name: `sis ${k}` })]);
}
await q("update public.profiles set role='school_admin' where id=$1", [S.dir]);
await q("update public.profiles set role='teacher' where id in ($1,$2)", [S.tA, S.tB]);
await q("update public.profiles set role='parent' where id in ($1,$2)", [S.par, S.par2]);
await q("update public.profiles set role='student' where id=$1", [S.stu]);
await q("insert into public.teachers (id, user_id, full_name) values ($1,$2,'Teacher A'),($3,$4,'Teacher B')", [TEA, S.tA, TEB, S.tB]);
await q("insert into public.teaching_assignments (class_id, subject_id, teacher_id) values ($1,$2,$3),($4,$2,$5)", [CLS_A, SUBJ_MATH, TEA, CLS_B, TEB]);
await q("insert into public.students (id, user_id, first_name, last_name, class_id, student_code) values ($1,null,'Ali','A',$4,'T1'),($2,$5,'Vali','B',$4,'T2'),($3,null,'Soli','C',$6,'T3')",
  [ST.s1, ST.s2, ST.s3, CLS_A, S.stu, CLS_B]);
const GU = id(9501), GU2 = id(9502);
await q("insert into public.guardians (id, user_id, full_name) values ($1,$2,'Parent One'),($3,$4,'Parent Two')", [GU, S.par, GU2, S.par2]);
await q("insert into public.student_guardians (student_id, guardian_id, is_primary) values ($1,$2,true),($3,$4,true)", [ST.s1, GU, ST.s3, GU2]);

const SIS_TABLES = ["school_years", "terms", "subjects", "teachers", "classes", "teaching_assignments", "students", "guardians", "student_guardians",
  "schedule_slots", "lessons", "attendance", "grade_entries", "term_grades", "announcements", "notifications", "behavior_notes", "school_notification_prefs"];
await test("sis RLS: anon has no grants and reads nothing", async () => {
  for (const t of SIS_TABLES) {
    await anon(() => denied(`select * from public.${t} limit 1`));
    const g = await one("select has_table_privilege('anon', $1, 'select') s, has_table_privilege('anon', $1, 'insert') i", [`public.${t}`]);
    assert(!g.s && !g.i, `anon privileges on ${t}`);
  }
  await anon(() => denied(`select public.mark_attendance_bulk('${CLS_A}'::uuid, current_date, null, '[]'::jsonb)`));
  await anon(() => denied("select public.is_school_director()"));
});
await test("sis RLS: row visibility per role (director all, teacher own class, parent own child, student self)", async () => {
  const n = (uid) => count(uid, "students");
  eq([await n(S.dir), await n(S.tA), await n(S.tB), await n(S.par), await n(S.par2), await n(S.stu)], [3, 2, 1, 1, 1, 1], "students");
  eq(await count(S.par, "students", `id='${ST.s2}'`), 0, "parent cannot see other children");
  eq(await count(S.stu, "guardians"), 0, "student sees no guardians");
  eq(await count(S.par, "guardians"), 1, "parent sees own guardian row");
  eq(await count(S.tA, "guardians"), 1, "teacher sees guardians of own class only");
  eq(await count(S.tA, "teachers"), 1, "teacher sees only self in teachers");
  eq(await count(S.dir, "teachers"), 2, "director sees all teachers");
  eq(await count(S.par, "teachers"), 0, "parent no teachers");
  eq(await count(S.stu, "classes"), 14, "classes readable");
  eq(await count(S.tA, "teaching_assignments"), 1, "assignments of own class only");
});
await test("sis RLS: only directors write reference data / people", async () => {
  await user(S.tA, () => denied("update public.students set notes='x' returning id"));
  await user(S.par, () => denied("update public.students set notes='x' returning id"));
  await user(S.tA, () => denied("insert into public.classes (year_id, grade, letter, name) values ('" + YEAR + "', 5, 'Z', '5Z') returning id"));
  await user(S.stu, () => denied("delete from public.subjects returning id"));
  await user(S.dir, () => ok("update public.students set notes='dir' where id=$1", [ST.s1]));
  await fails(/forbidden|permission denied/, () => user(S.tA, () => ok("select public.lock_term($1::uuid, true)", [TERM1])));
});
await test("mark_attendance_bulk: teacher can mark own class, not another class", async () => {
  const r = await mark(S.tA, CLS_A, today, null, [{ student_id: ST.s1, status: "absent", note: "ill" }, { student_id: ST.s2, status: "late", minutes_late: 10 }]);
  eq(r.saved, 2, "saved");
  eq(Number((await one("select minutes_late from public.attendance where student_id=$1", [ST.s2])).minutes_late), 10, "minutes_late kept for late");
  await fails(/forbidden/, () => mark(S.tA, CLS_B, today, null, [{ student_id: ST.s3, status: "present" }]));
  await fails(/forbidden/, () => mark(S.par, CLS_A, today, null, [{ student_id: ST.s1, status: "present" }]));
  await fails(/forbidden/, () => mark(S.stu, CLS_A, today, null, [{ student_id: ST.s2, status: "present" }]));
});
await test("mark_attendance_bulk: validation + unique per student/day/lesson (upsert)", async () => {
  await fails(/student_not_in_class/, () => mark(S.tA, CLS_A, today, null, [{ student_id: ST.s3, status: "present" }]));
  await fails(/invalid_status/, () => mark(S.tA, CLS_A, today, null, [{ student_id: ST.s1, status: "gone" }]));
  await fails(/invalid_date/, () => mark(S.tA, CLS_A, plusDays(2), null, [{ student_id: ST.s1, status: "present" }]));
  await fails(/edit_window_closed/, () => mark(S.tA, CLS_A, plusDays(-30), null, [{ student_id: ST.s1, status: "present" }]));
  await fails(/invalid_input/, () => mark(S.tA, CLS_A, today, 9, [{ student_id: ST.s1, status: "present" }]));
  await fails(/invalid_input/, () => mark(S.tA, CLS_A, today, null, []));
  await fails(/invalid_input/, () => mark(S.tA, CLS_A, today, null, [{ student_id: "nope", status: "present" }]));
  await mark(S.dir, CLS_A, plusDays(-30), null, [{ student_id: ST.s1, status: "present" }]); // director may edit history
  await mark(S.tA, CLS_A, today, null, [{ student_id: ST.s1, status: "present" }]);
  eq(Number((await one("select count(*)::int n from public.attendance where student_id=$1 and date=$2", [ST.s1, today])).n), 1, "one row per day");
  eq((await one("select status from public.attendance where student_id=$1 and date=$2", [ST.s1, today])).status, "present", "updated in place");
  await mark(S.tA, CLS_A, today, 1, [{ student_id: ST.s1, status: "absent" }]);
  eq(Number((await one("select count(*)::int n from public.attendance where student_id=$1 and date=$2", [ST.s1, today])).n), 2, "lesson rows are separate");
  await fails(/duplicate key|attendance_uq/, () => ok("insert into public.attendance (student_id, class_id, date, lesson_no, status) values ($1,$2,$3,null,'absent')", [ST.s1, CLS_A, today]));
  eq(Number((await one("select count(*)::int n from public.audit_log where action='attendance_bulk'")).n) >= 3, true, "audit rows written");
});
await test("sis RLS: direct attendance writes are scoped to own class", async () => {
  await user(S.tA, () => denied(`insert into public.attendance (student_id, class_id, date, status) values ('${ST.s3}','${CLS_B}','${today}','absent') returning id`));
  await user(S.tA, () => denied(`insert into public.attendance (student_id, class_id, date, status) values ('${ST.s3}','${CLS_A}','${plusDays(-1)}','absent') returning id`));
  await user(S.par, () => denied(`insert into public.attendance (student_id, class_id, date, status) values ('${ST.s1}','${CLS_A}','${plusDays(-1)}','absent') returning id`));
  await user(S.tA, () => ok(`insert into public.attendance (student_id, class_id, date, status) values ('${ST.s1}','${CLS_A}','${plusDays(-2)}','present')`));
  eq(await count(S.par, "attendance"), 4, "parent sees only own child's rows");
  eq(await count(S.par2, "attendance"), 0, "other parent sees none of them");
  eq(await count(S.tB, "attendance"), 0, "other teacher sees nothing");
  eq(await count(S.stu, "attendance"), 1, "student sees self");
});
await test("save_grades_bulk: ownership, ranges, term window", async () => {
  const r = await saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s1, date: GD, kind: "daily", score: 5 }, { student_id: ST.s2, date: GD, kind: "test", score: 3.5, weight: 2 }]);
  eq([r.saved, r.deleted], [2, 0], "saved");
  await fails(/forbidden/, () => saveG(S.tA, CLS_A, SUBJ_PHYS, TERM1, [{ student_id: ST.s1, date: GD, score: 4 }]));
  await fails(/forbidden/, () => saveG(S.tB, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s1, date: GD, score: 4 }]));
  await fails(/forbidden/, () => saveG(S.par, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s1, date: GD, score: 4 }]));
  await fails(/invalid_score/, () => saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s1, date: GD, score: 6 }]));
  await fails(/invalid_score/, () => saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s1, date: GD, score: 0 }]));
  await fails(/invalid_kind/, () => saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s1, date: GD, kind: "cheat", score: 4 }]));
  await fails(/date_out_of_term/, () => saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s1, date: "2026-07-01", score: 4 }]));
  await fails(/student_not_in_class/, () => saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s3, date: GD, score: 4 }]));
  await fails(/not_found/, () => saveG(S.tA, CLS_A, SUBJ_MATH, id(9999), [{ student_id: ST.s1, date: GD, score: 4 }]));
  eq(Number((await one("select count(*)::int n from public.grade_entries")).n), 2, "nothing extra stored (atomic)");
  const gid = (await one("select id from public.grade_entries where student_id=$1", [ST.s1])).id;
  const u = await saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ id: gid, student_id: ST.s1, date: GD, kind: "daily", score: 4 }]);
  eq(u.saved, 1, "update");
  eq(Number((await one("select score from public.grade_entries where id=$1", [gid])).score), 4, "score updated");
  eq((await saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ id: gid, delete: true }])).deleted, 1, "delete");
  await saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s1, date: GD, kind: "daily", score: 5 }]);
});
await test("grades: parent/student see only their own; direct writes blocked", async () => {
  eq(await count(S.par, "grade_entries"), 1, "parent sees own child's grades");
  eq(await count(S.par2, "grade_entries"), 0, "other parent none");
  eq(await count(S.stu, "grade_entries"), 1, "student sees own");
  eq(await count(S.tB, "grade_entries"), 0, "other teacher none");
  eq(await count(S.tA, "grade_entries"), 2, "teacher sees class grades");
  await user(S.par, () => denied(`insert into public.grade_entries (student_id, class_id, subject_id, term_id, date, score) values ('${ST.s1}','${CLS_A}','${SUBJ_MATH}','${TERM1}','${GD}',5) returning id`));
  await user(S.stu, () => denied("update public.grade_entries set score=5 returning id"));
  await user(S.tA, () => denied(`insert into public.grade_entries (student_id, class_id, subject_id, term_id, date, score, teacher_id) values ('${ST.s1}','${CLS_A}','${SUBJ_PHYS}','${TERM1}','${GD}',5,'${TEA}') returning id`));
});
await test("locked term: teachers rejected (RPC + direct), directors allowed, unlock restores", async () => {
  const lk = await user(S.dir, async () => (await one("select public.lock_term($1::uuid, true) r", [TERM1])).r);
  eq(lk.is_locked, true, "locked");
  await fails(/term_locked/, () => saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s2, date: GD, score: 4 }]));
  await fails(/term_locked/, () => user(S.tA, () => ok(`insert into public.grade_entries (student_id, class_id, subject_id, term_id, date, score, teacher_id) values ('${ST.s2}','${CLS_A}','${SUBJ_MATH}','${TERM1}','${GD}',4,'${TEA}')`)));
  await fails(/term_locked/, () => user(S.tA, () => ok("update public.grade_entries set score=2 where student_id=$1", [ST.s1])));
  eq((await saveG(S.dir, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s2, date: GD, score: 4 }])).saved, 1, "director override");
  await user(S.dir, () => ok("select public.lock_term($1::uuid, false)", [TERM1]));
  eq((await saveG(S.tA, CLS_A, SUBJ_MATH, TERM1, [{ student_id: ST.s2, date: GD, score: 4 }])).saved, 1, "teacher again");
});
await test("save_term_grades_bulk: ownership + lock", async () => {
  const sv = (uid, term, rows) => user(uid, async () => (await one("select public.save_term_grades_bulk($1::uuid,$2::uuid,$3::uuid,$4::jsonb) r", [CLS_A, SUBJ_MATH, term, JSON.stringify(rows)])).r);
  eq((await sv(S.tA, TERM1, [{ student_id: ST.s1, value: 5, suggested: 4.6 }])).saved, 1, "saved");
  const row = await one("select value, is_confirmed from public.term_grades where student_id=$1", [ST.s1]);
  eq([row.value, row.is_confirmed], [5, true], "confirmed");
  await fails(/forbidden/, () => sv(S.tB, TERM1, [{ student_id: ST.s1, value: 5 }]));
  await fails(/invalid_score/, () => sv(S.tA, TERM1, [{ student_id: ST.s1, value: 7 }]));
  eq(await count(S.par, "term_grades"), 1, "parent sees own child's term grade");
});
await test("attendance_summary / student_performance / class_journal permissions", async () => {
  const sum = await user(S.tA, async () => (await one("select public.attendance_summary($1::uuid,$2::date,$3::date) r", [CLS_A, plusDays(-60), today])).r);
  eq(sum.length, 2, "two students");
  const s1 = sum.find((x) => x.student_id === ST.s1);
  assert(s1.total >= 3 && s1.percent !== null, "counts");
  await fails(/forbidden/, () => user(S.tB, () => ok("select public.attendance_summary($1::uuid,$2::date,$3::date)", [CLS_A, plusDays(-60), today])));
  const perf = await user(S.par, async () => (await one("select public.student_performance($1::uuid,$2::uuid) r", [ST.s1, YEAR])).r);
  assert(Number(perf.overall_avg) > 0 && perf.terms.length === 4 && perf.attendance.total >= 3, "performance shape");
  await fails(/forbidden/, () => user(S.par, () => ok("select public.student_performance($1::uuid,$2::uuid)", [ST.s3, YEAR])));
  await fails(/forbidden/, () => user(S.par2, () => ok("select public.student_performance($1::uuid,$2::uuid)", [ST.s1, YEAR])));
  const j = await user(S.tA, async () => (await one("select public.class_journal($1::uuid,$2::uuid,$3::uuid) r", [CLS_A, SUBJ_MATH, TERM1])).r);
  eq(j.students.length, 2, "journal students");
  assert(j.entries.length >= 2, "journal entries");
  await fails(/forbidden/, () => user(S.tB, () => ok("select public.class_journal($1::uuid,$2::uuid,$3::uuid)", [CLS_A, SUBJ_MATH, TERM1])));
  await fails(/forbidden/, () => user(S.par, () => ok("select public.class_journal($1::uuid,$2::uuid,$3::uuid)", [CLS_A, SUBJ_MATH, TERM1])));
});
await test("announcements + notifications visibility", async () => {
  await q("insert into public.announcements (audience, title) values ('all','A'),('teachers','T'),('parents','P'),('students','S')");
  await q("insert into public.announcements (audience, title, publish_at) values ('all','Future', now() + interval '2 days')");
  await q("insert into public.announcements (audience, class_id, title) values ('class',$1,'ClassA')", [CLS_A]);
  const titles = async (uid) => (await user(uid, () => q("select title from public.announcements order by title"))).map((r) => r.title);
  eq(await titles(S.par), ["A", "ClassA", "P"], "parent of class A child");
  eq(await titles(S.par2), ["A", "P"], "parent of class B child");
  eq(await titles(S.stu), ["A", "ClassA", "S"], "student");
  eq(await titles(S.tB), ["A", "T"], "teacher B");
  eq((await titles(S.dir)).length, 6, "director sees all incl. future");
  await user(S.tA, () => ok("insert into public.announcements (audience, class_id, title, author_id) values ('class',$1,'by teacher',$2)", [CLS_A, S.tA]));
  await user(S.tA, () => denied("insert into public.announcements (audience, class_id, title, author_id) values ('class','" + CLS_B + "','nope','" + S.tA + "') returning id"));
  await user(S.tA, () => denied("insert into public.announcements (audience, title, author_id) values ('all','nope','" + S.tA + "') returning id"));
  await q("insert into public.notifications (user_id, type) values ($1,'absence'),($2,'absence')", [S.par, S.par2]);
  eq(await count(S.par, "notifications"), 1, "own notifications only");
  await user(S.par, () => ok("update public.notifications set read_at = now()"));
  eq(await count(S.par2, "notifications", "read_at is null"), 1, "other user's notification untouched");
  await user(S.par, () => denied("insert into public.notifications (user_id, type) values ('" + S.par + "','x') returning id"));
});
await test("sis: deactivated profile loses access", async () => {
  await q("update public.profiles set is_active=false where id=$1", [S.tA]);
  eq(await count(S.tA, "students"), 0, "inactive teacher sees nothing");
  await fails(/forbidden/, () => mark(S.tA, CLS_A, today, null, [{ student_id: ST.s1, status: "present" }]));
  await q("update public.profiles set is_active=true where id=$1", [S.tA]);
});

console.log("\nSIS additions (override_reason, room/teacher clash, notification prefs, must_change_password)");
await test("save_term_grades_bulk stores override_reason (trimmed, 300 max, dropped when the grade is cleared)", async () => {
  const sv = (uid, rows) => user(uid, async () => (await one("select public.save_term_grades_bulk($1::uuid,$2::uuid,$3::uuid,$4::jsonb) r", [CLS_A, SUBJ_MATH, TERM1, JSON.stringify(rows)])).r);
  await sv(S.tA, [{ student_id: ST.s1, value: 4, suggested: 4.6, override_reason: "  oral exam  " }, { student_id: ST.s2, value: 3, suggested: 3.1 }]);
  const r1 = await one("select override_reason from public.term_grades where student_id=$1", [ST.s1]);
  eq(r1.override_reason, "oral exam", "trimmed reason stored");
  eq((await one("select override_reason from public.term_grades where student_id=$1", [ST.s2])).override_reason, null, "no reason -> null");
  await sv(S.tA, [{ student_id: ST.s1, value: 4, override_reason: "x".repeat(500) }]);
  eq((await one("select char_length(override_reason) n from public.term_grades where student_id=$1", [ST.s1])).n, 300, "truncated to 300");
  await sv(S.tA, [{ student_id: ST.s1, value: null, override_reason: "stale" }]);
  eq((await one("select override_reason, is_confirmed from public.term_grades where student_id=$1", [ST.s1])).override_reason, null, "cleared grade drops the reason");
  eq(await count(S.par, "term_grades", "override_reason is null"), 1, "parent can read the column");
});
await test("schedule_slots: one class per room and one lesson per teacher at a weekday + lesson number", async () => {
  const slot = (cls, wd, no, teacher, room) =>
    ok("insert into public.schedule_slots (class_id, subject_id, teacher_id, weekday, lesson_no, start_time, end_time, room) values ($1,$2,$3,$4,$5,'08:00','08:45',$6)", [cls, SUBJ_MATH, teacher, wd, no, room]);
  await slot(CLS_A, 1, 1, TEA, "R1");
  await fails(/schedule_slots_room_uq/, () => slot(CLS_B, 1, 1, TEB, " r1 "));
  await fails(/schedule_slots_teacher_uq/, () => slot(CLS_B, 1, 1, TEA, "R2"));
  await slot(CLS_B, 1, 1, TEB, "R2"); // different room + teacher
  await slot(CLS_B, 1, 2, TEB, "R1"); // same room, another lesson
  await slot(CLS_A, 1, 2, null, null); // no teacher / room never clash
  await slot(CLS_B, 1, 3, null, null);
  await q("delete from public.schedule_slots");
});
await test("school_notification_prefs: own row only (RLS), defaults all on, anon nothing, no delete", async () => {
  await user(S.par, () => ok("insert into public.school_notification_prefs (user_id, absence) values ($1, false)", [S.par]));
  await user(S.par, () => denied("insert into public.school_notification_prefs (user_id) values ('" + S.par2 + "') returning user_id"));
  eq(await count(S.par, "school_notification_prefs"), 1, "own row visible");
  eq(await count(S.par2, "school_notification_prefs"), 0, "other user sees none");
  eq(await count(S.dir, "school_notification_prefs"), 0, "directors do not read personal preferences either");
  const row = await one("select telegram, email, absence, low_grade, announcements from public.school_notification_prefs where user_id=$1", [S.par]);
  eq([row.telegram, row.email, row.absence, row.low_grade, row.announcements], [true, true, false, true, true], "defaults + explicit");
  await user(S.par, () => ok("update public.school_notification_prefs set telegram=false where user_id=$1", [S.par]));
  await user(S.par2, () => denied("update public.school_notification_prefs set telegram=true where user_id='" + S.par + "' returning user_id"));
  await user(S.par, () => denied("delete from public.school_notification_prefs where user_id='" + S.par + "' returning user_id"));
  await anon(() => denied("select * from public.school_notification_prefs"));
  eq(Number((await one("select count(*)::int n from public.school_notification_prefs where telegram")).n), 0, "update applied");
});
await test("profiles.must_change_password: users cannot flip it, the service role can", async () => {
  await as("service_role", null, () => ok("update public.profiles set must_change_password=true where id=$1", [S.par]));
  eq((await one("select must_change_password m from public.profiles where id=$1", [S.par])).m, true, "service role sets it");
  await fails(/forbidden/, () => user(S.par, () => ok("update public.profiles set must_change_password=false where id=$1", [S.par])));
  await user(S.par, () => ok("update public.profiles set phone='+998901234567' where id=$1", [S.par])); // other columns stay editable
  await as("service_role", null, () => ok("update public.profiles set must_change_password=false where id=$1", [S.par]));
  eq((await one("select must_change_password m from public.profiles where id=$1", [S.par])).m, false, "service role clears it");
});

// ---------------------------------------------------------------------------
console.log("\nHardening (migration 0002): privileges, RLS, integrity, indexes, retention");
const PUBLIC_RPCS = ["get_leaderboard", "get_game_set", "get_psych_questions", "get_psych_test", "get_quiz_questions", "get_survey", "list_game_sets",
  "list_psych_tests", "list_quizzes", "list_surveys", "start_content_round"];
const SERVICE_ONLY_RPCS = ["register_olympiad(uuid,text,date,text,int,text,text,text)", "submit_quiz_attempt(uuid,jsonb,text,int,text,int)", "submit_psych_test(uuid,jsonb,text,int,text)"];
const ANON_TABLES = ["brain_games", "campus_life", "game_leaderboard", "olympiads", "academic_quizzes", "programs", "psych_tests", "site_settings",
  "staff_members", "student_achievements"];

await test("every public table has row level security enabled", async () => {
  const rows = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity`);
  eq(rows.map((r) => r.relname), [], "tables without RLS");
  assert((await q("select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')")).length >= 40, "table list sane");
});
await test("every function in public pins search_path; SECURITY DEFINER ones are schema-qualified-safe (public, pg_temp)", async () => {
  const bad = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c = 'search_path=public, pg_temp')`);
  eq(bad.map((r) => r.proname), [], "functions without search_path = public, pg_temp");
  const defs = await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef");
  assert(defs[0].n >= 30, "security definer functions exist");
});
await test("EXECUTE matrix: PUBLIC gets nothing, anon only the public RPCs, no function is executable by PUBLIC", async () => {
  const pub = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)`);
  eq(pub.map((r) => r.proname), [], "functions executable by PUBLIC");
  const an = await q(`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`);
  eq(an.map((r) => r.proname), [...PUBLIC_RPCS].sort(), "anon-executable functions");
  const sv = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not has_function_privilege('service_role', p.oid, 'execute')`);
  eq(sv.map((r) => r.proname), [], "service_role can execute everything");
  for (const sig of SERVICE_ONLY_RPCS) {
    const r = await one(`select has_function_privilege('anon', 'public.${sig}', 'execute') a, has_function_privilege('authenticated', 'public.${sig}', 'execute') u, has_function_privilege('service_role', 'public.${sig}', 'execute') s`);
    eq([r.a, r.u, r.s], [false, false, true], `${sig} executable only by service_role`);
  }
  for (const fn of ["rate_limit_hit", "purge_old_data", "check_olympiad_result", "olympiad_leaderboard", "submit_survey_response", "check_content_answer", "content_fifty_fifty", "generate_olympiad_ticket"]) {
    const r = await one(`select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) a from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
    assert(r.a === false, `authenticated must not execute ${fn}`);
  }
  await anon(() => denied("select public.has_role('super_admin')"));
  await anon(() => denied("select public.is_admin()"));
});
await test("table privileges: anon selects public content only; nobody but service_role touches rate_limits; no TRUNCATE/TRIGGER/REFERENCES for clients", async () => {
  const an = await q(`select table_name, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' group by 1 order by 1`);
  eq(an.map((r) => `${r.table_name}:${r.p}`), ANON_TABLES.slice().sort().map((t) => `${t}:SELECT`), "anon table grants");
  const au = await q(`select table_name from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public'
    and (table_name = 'rate_limits' or privilege_type in ('TRUNCATE','TRIGGER','REFERENCES'))`);
  eq(au, [], "authenticated: rate_limits / truncate / trigger / references");
  const seq = await q("select 1 from information_schema.role_usage_grants where grantee in ('anon','authenticated') and object_schema = 'public' and object_type = 'SEQUENCE'");
  eq(seq, [], "no sequence grants for clients");
  const colw = await q(`select column_name from information_schema.column_privileges where grantee = 'authenticated' and table_schema = 'public'
    and table_name = 'notifications' and privilege_type = 'UPDATE' order by 1`);
  eq(colw.map((r) => r.column_name), ["read_at"], "notifications: users may only update read_at");
});
await test("no views without security_invoker, no permissive write policies, INSERT policies carry WITH CHECK, anon policies only on public content", async () => {
  const views = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v','m') and not coalesce((select true from unnest(coalesce(c.reloptions, '{}'::text[])) o where o = 'security_invoker=true'), false)`);
  eq(views, [], "views without security_invoker");
  const open = await q(`select tablename, policyname from pg_policies where schemaname = 'public' and cmd <> 'SELECT' and (qual = 'true' or with_check = 'true')`);
  eq(open, [], "write policies with using(true)");
  const noCheck = await q(`select tablename, policyname from pg_policies where schemaname = 'public' and cmd = 'INSERT' and with_check is null`);
  eq(noCheck, [], "INSERT policies without WITH CHECK");
  const anonPol = await q(`select distinct tablename from pg_policies where schemaname = 'public' and 'anon' = any(roles) order by 1`);
  eq(anonPol.map((r) => r.tablename), ANON_TABLES.slice().sort(), "tables with anon policies");
  const sel = await q(`select tablename, policyname from pg_policies where schemaname = 'public' and qual = 'true' and 'anon' = any(roles) order by 1`);
  eq(sel.map((r) => r.tablename), ["game_leaderboard", "olympiads", "site_settings"], "public-read (using true) tables are intentional");
});
await test("policies use the (select auth.uid()) / (select fn()) initPlan pattern", async () => {
  const pol = await q(`select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as e from pg_policies where schemaname in ('public','storage')`);
  const raw = [];
  for (const p of pol) {
    if (/(?<!SELECT )auth\.uid\(\)/.test(p.e)) raw.push(`${p.tablename}.${p.policyname}: raw auth.uid()`);
    if (/(?<!SELECT )(public\.)?(has_role|is_admin|is_school_director|my_teacher_id)\(/.test(p.e)) raw.push(`${p.tablename}.${p.policyname}: unwrapped role helper`);
  }
  eq(raw, [], "policies calling per-row auth functions");
});
await test("role escalation is denied on profiles (self-promotion, reactivation, foreign rows, inserts)", async () => {
  await fails(/forbidden/, () => user(U.student, () => ok("update public.profiles set role='super_admin' where id=$1", [U.student])));
  await fails(/forbidden/, () => user(U.meth, () => ok("update public.profiles set role='super_admin' where id=$1", [U.meth])));
  await fails(/forbidden/, () => user(U.meth, () => ok("update public.profiles set is_active=true, role='psychologist' where id=$1", [U.meth])));
  await user(U.meth, () => denied("update public.profiles set full_name='hacked' where id='" + U.psy + "' returning id"));
  await user(U.meth, () => denied("insert into public.profiles (id, role) values (gen_random_uuid(), 'super_admin') returning id"));
  await user(U.meth, () => denied("delete from public.profiles where id='" + U.psy + "' returning id"));
  eq((await one("select role from public.profiles where id=$1", [U.meth])).role, "methodist", "role unchanged");
  await user(U.meth, () => ok("update public.profiles set full_name='Own Name', phone='+998901234567' where id=$1", [U.meth]));
  await fails(/profiles_text_len_chk/, () => user(U.meth, () => ok("update public.profiles set full_name=$2 where id=$1", [U.meth, "x".repeat(250)])));
  await fails(/profiles_avatar_url_url_chk/, () => user(U.meth, () => ok("update public.profiles set avatar_url='javascript:alert(1)' where id=$1", [U.meth])));
  await q("update public.profiles set full_name='methodist' where id=$1", [U.meth]);
});
await test("teachers cannot bypass the attendance edit window through direct table writes (future / older than 14 days denied)", async () => {
  const ins = (d) => `insert into public.attendance (student_id, class_id, date, lesson_no, status) values ('${ST.s1}','${CLS_A}','${d}',7,'present') returning id`;
  await user(S.tA, () => denied(ins(plusDays(2))));
  await user(S.tA, () => denied(ins(plusDays(-30))));
  await user(S.tA, () => ok(ins(today)));
  await q("insert into public.attendance (student_id, class_id, date, lesson_no, status) values ($1,$2,$3,7,'absent')", [ST.s2, CLS_A, plusDays(-40)]);
  await user(S.tA, () => denied(`update public.attendance set status = 'present' where student_id = '${ST.s2}' and date = '${plusDays(-40)}' returning id`));
  await q("delete from public.attendance where lesson_no = 7 and date in ($1,$2) and student_id in ($3,$4)", [today, plusDays(-40), ST.s1, ST.s2]);
});
await test("handle_new_user: new accounts are always students with a bounded name", async () => {
  const uid = "66666666-6666-4666-8666-666666666666";
  await q("insert into auth.users (id, email, raw_user_meta_data) values ($1,'newbie@test.uz',$2)", [uid, JSON.stringify({ full_name: " " + "N".repeat(400), role: "super_admin" })]);
  const p = await one("select role, char_length(full_name) n from public.profiles where id=$1", [uid]);
  eq([p.role, p.n], ["student", 120], "profile");
  await q("delete from auth.users where id=$1", [uid]);
});
await test("staff can insert a registration without a ticket (generator + trigger are SECURITY DEFINER)", async () => {
  const r = await user(U.meth, () => one(`insert into public.olympiad_registrations (olympiad_id, student_full_name, birth_date, current_school, grade, subject_key, parent_phone)
    values ($1,'Staff Entered','2013-05-05','School 1',5,'math','+998909998877') returning ticket_number, qr_code_payload`, [OLY]));
  assert(/^OLY-\d{4}-[0-9A-F]{10}$/.test(r.ticket_number) && r.qr_code_payload === r.ticket_number, "ticket generated");
  await q("delete from public.olympiad_registrations where student_full_name='Staff Entered'");
});

await test("CHECK constraints: olympiads, registrations, attempts, urls, jsonb shape, attendance, term grades", async () => {
  const oly = (over = {}) => {
    const a = { dl: "now() + interval '1 day'", ev: "now() + interval '2 days'", gr: "'{5,6}'", ...over };
    return ok(`insert into public.olympiads (title, event_date, registration_deadline, eligible_grades) values ('{}'::jsonb, ${a.ev}, ${a.dl}, ${a.gr}) returning id`);
  };
  await fails(/olympiads_dates_chk/, () => oly({ dl: "now() + interval '5 days'" }));
  await fails(/olympiads_grades_chk/, () => oly({ gr: "'{}'" }));
  await fails(/olympiads_grades_chk/, () => oly({ gr: "'{0,12}'" }));
  await oly();
  await q("delete from public.olympiads where title = '{}'::jsonb");
  await fails(/olympiad_registrations_score_chk/, () => ok("update public.olympiad_registrations set score = 150, max_score = 100 where olympiad_id=$1", [OLY]));
  await fails(/academic_quiz_attempts_counts_chk/, () => ok("insert into public.academic_quiz_attempts (quiz_id, student_name, total_questions, correct_answers) values ($1,'x',3,5)", [id(51)]));
  for (const u of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html;base64,AAAA", "https://" + "a".repeat(1100)]) {
    await fails(/programs_cover_image_url_url_chk/, () => ok("update public.programs set cover_image_url=$1 where id=$2", [u, id(1)]));
  }
  await ok("update public.programs set cover_image_url='https://cdn.example.com/a.png' where id=$1", [id(1)]);
  await fails(/programs_title_obj_chk/, () => ok("update public.programs set title='\"just a string\"'::jsonb where id=$1", [id(1)]));
  await fails(/olympiads_subjects_arr_chk/, () => ok("update public.olympiads set subjects='{}'::jsonb where id=$1", [OLY]));
  await fails(/brain_games_slug_chk/, () => ok("update public.brain_games set game_slug='Bad Slug!' where id=$1", [id(71)]));
  await fails(/attendance_late_chk/, () => ok("insert into public.attendance (student_id, class_id, date, status, minutes_late) values ($1,$2,'2026-09-02','present',10)", [ST.s1, CLS_A]));
  await fails(/term_grades_confirmed_chk/, () => ok("insert into public.term_grades (student_id, subject_id, term_id, class_id, value, is_confirmed) values ($1,$2,$3,$4,null,true)", [ST.s1, SUBJ_MATH, TERM1, CLS_A]));
  await fails(/survey_responses_answers_chk/, () => ok("insert into public.survey_responses (survey_id, respondent_token_hash, answers) values ($1,'aaaaaaaaaaaaaaaaaaaa','[]'::jsonb)", [SVY_P]));
});
await test("question option triggers: well-formed options, unique ids, existing correct answer, numeric psych scores, survey choices", async () => {
  const aq = (opts, correct) => ok("insert into public.academic_questions (quiz_id, options, correct_option_id) values ($1,$2::jsonb,$3)", [id(51), JSON.stringify(opts), correct]);
  const o = (...ids) => ids.map((i) => ({ id: i, text: { uz: i, ru: i, en: i } }));
  await fails(/correct_option_missing/, () => aq(o("A", "B"), "C"));
  await fails(/invalid_options/, () => aq(o("A", "A"), "A"));
  await fails(/invalid_options/, () => aq(o("A"), "A"));
  await fails(/invalid_options/, () => aq([{ text: "no id" }, { id: "B" }], "B"));
  await fails(/invalid_options/, () => ok("insert into public.academic_questions (quiz_id, options, correct_option_id) values ($1,'{}'::jsonb,'A')", [id(51)]));
  await aq(o("A", "B"), "B");
  await fails(/correct_option_missing/, () => ok("update public.academic_questions set correct_option_id='Z' where quiz_id=$1 and options = $2::jsonb", [id(51), JSON.stringify(o("A", "B"))]));
  await q("delete from public.academic_questions where options = $1::jsonb", [JSON.stringify(o("A", "B"))]);
  const pq = (opts) => ok("insert into public.psych_questions (psych_test_id, options) values ($1,$2::jsonb)", [id(61), JSON.stringify(opts)]);
  await fails(/invalid_option_score/, () => pq([{ id: "A", score: "lots" }, { id: "B", score: 1 }]));
  await fails(/invalid_options/, () => pq([{ id: "A", score: 1 }]));
  await pq([{ id: "A", score: 0 }, { id: "B", score: "2" }]);
  await q("delete from public.psych_questions where options @> '[{\"id\":\"B\",\"score\":\"2\"}]'::jsonb");
  const sq = (type, opts) => ok("insert into public.survey_questions (survey_id, type, options) values ($1,$2,$3::jsonb)", [SVY_P, type, JSON.stringify(opts)]);
  await fails(/invalid_options/, () => sq("single", o("A")));
  await fails(/invalid_options/, () => sq("multiple", []));
  await sq("text", []);
  await sq("single", o("A", "B"));
  await q("delete from public.survey_questions where sort_order = 0 and survey_id=$1 and question_text = '{}'::jsonb", [SVY_P]);
});
await test("SIS integrity: grade scope (term belongs to the class year, date inside the term), term inside its year, one primary guardian, unique class name / student identity", async () => {
  const y2 = id(9901), t2 = id(9911), c2 = id(9921);
  await q("insert into public.school_years (id, name, start_date, end_date) values ($1,'2030-2031','2030-09-01','2031-05-31')", [y2]);
  await fails(/term_outside_year/, () => ok("insert into public.terms (year_id, number, name, start_date, end_date) values ($1,1,'t','2030-08-01','2030-10-01')", [y2]));
  await q("insert into public.terms (id, year_id, number, name, start_date, end_date) values ($1,$2,1,'t1','2030-09-01','2030-11-01')", [t2, y2]);
  await q("insert into public.classes (id, year_id, grade, letter, name) values ($1,$2,5,'Z','5Z')", [c2, y2]);
  await fails(/classes_year_name_uq/, () => ok("insert into public.classes (year_id, grade, letter, name) values ($1,6,'Y','5z')", [y2]));
  const ge = (cls, term, date) => ok("insert into public.grade_entries (student_id, class_id, subject_id, term_id, date, score) values ($1,$2,$3,$4,$5,5)", [ST.s1, cls, SUBJ_MATH, term, date]);
  await fails(/term_not_in_year/, () => ge(CLS_A, t2, "2030-09-10"));
  await fails(/date_out_of_term/, () => ge(CLS_A, TERM1, "2026-12-30"));
  await fails(/term_not_in_year/, () => ok("insert into public.term_grades (student_id, subject_id, term_id, class_id, value, is_confirmed) values ($1,$2,$3,$4,4,true)", [ST.s1, SUBJ_MATH, t2, CLS_A]));
  await ge(CLS_A, TERM1, GD);
  await fails(/restrict|foreign key|violates/, () => ok("delete from public.subjects where id=$1", [SUBJ_MATH]));
  await fails(/restrict|foreign key|violates/, () => ok("delete from public.terms where id=$1", [TERM1]));
  await fails(/restrict|foreign key|violates/, () => ok("delete from public.classes where id=$1", [CLS_A]));
  await q("delete from public.grade_entries where student_id=$1", [ST.s1]);
  // primary guardian: one per student
  await q("insert into public.guardians (id, full_name) values ($1,'Second Guardian')", [id(9511)]);
  await fails(/student_guardians_one_primary_uq/, () => ok("insert into public.student_guardians (student_id, guardian_id, is_primary) values ($1,$2,true)", [ST.s1, id(9511)]));
  await ok("insert into public.student_guardians (student_id, guardian_id, is_primary) values ($1,$2,false)", [ST.s1, id(9511)]);
  await q("delete from public.guardians where id=$1", [id(9511)]);
  // student identity
  await q("insert into public.students (first_name, last_name, birth_date, student_code) values ('Dup','Student','2015-01-01','DUP1')");
  await fails(/students_identity_uq/, () => ok("insert into public.students (first_name, last_name, birth_date, student_code) values (' dup','STUDENT ','2015-01-01','DUP2')"));
  await q("delete from public.students where student_code = 'DUP1'");
  await q("delete from public.classes where id=$1", [c2]);
  await q("delete from public.school_years where id=$1", [y2]);
});
await test("user references are SET NULL: deleting an auth user keeps attendance / announcements / term grades", async () => {
  const uid = "77777777-7777-4777-8777-777777777777";
  await q("insert into auth.users (id, email) values ($1,'gone@test.uz')", [uid]);
  await q("insert into public.attendance (student_id, class_id, date, status, marked_by) values ($1,$2,'2026-09-03','present',$3)", [ST.s1, CLS_A, uid]);
  await q("insert into public.announcements (audience, title, author_id) values ('all','bye',$1)", [uid]);
  await q("delete from auth.users where id=$1", [uid]);
  eq((await one("select marked_by from public.attendance where date='2026-09-03' and student_id=$1", [ST.s1])).marked_by, null, "marked_by nulled");
  eq((await one("select author_id from public.announcements where title='bye'")).author_id, null, "author_id nulled");
  await q("delete from public.attendance where date='2026-09-03' and student_id=$1", [ST.s1]);
  await q("delete from public.announcements where title='bye'");
  const del = await q(`select conname, confdeltype from pg_constraint where conrelid in ('public.attendance'::regclass, 'public.announcements'::regclass, 'public.term_grades'::regclass)
    and contype = 'f' and confrelid = 'auth.users'::regclass order by 1`);
  eq(del.map((r) => r.confdeltype), ["n", "n", "n"], "ON DELETE SET NULL");
});
await test("audit_log is append-only; the site_settings singleton survives staff deletes; storage buckets restrict mime types", async () => {
  const row = await as("service_role", null, () => one("insert into public.audit_log (action, resource) values ('t','t') returning id"));
  await fails(/audit_log_immutable/, () => as("service_role", null, () => ok("update public.audit_log set action='x' where id=$1", [row.id])));
  await fails(/audit_log_immutable/, () => ok("update public.audit_log set action='x' where id=$1", [row.id]));
  await as("service_role", null, () => ok("delete from public.audit_log where id=$1", [row.id]));
  await fails(/forbidden/, () => user(U.super, () => ok("delete from public.site_settings")));
  eq(Number((await one("select count(*)::int n from public.site_settings")).n), 1, "singleton still there");
  const b = await q("select id, file_size_limit::int l, allowed_mime_types m from storage.buckets where id in ('school-media','test-assets','certificates') order by id");
  eq(b.length, 3, "buckets");
  for (const x of b) {
    eq(x.l, 8388608, `${x.id} size limit`);
    eq([...x.m].sort(), ["application/pdf", "image/gif", "image/jpeg", "image/png", "image/webp"], `${x.id} mime types`);
  }
});
await test("storage policies: update has WITH CHECK; anon cannot write", async () => {
  const p = await q("select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'maktab_%' order by 1");
  eq(p.length, 5, "five maktab_* storage policies");
  const upd = p.find((x) => x.cmd === 'UPDATE');
  assert(upd && upd.with_check, "UPDATE policy has WITH CHECK");
  await anon(() => denied("update storage.objects set name = 'x' returning id"));
  await anon(() => denied("delete from storage.objects returning id"));
});
await test("notifications: users mark their own as read but cannot rewrite them", async () => {
  await q("insert into public.notifications (user_id, type, payload) values ($1,'t','{\"a\":1}')", [S.par]);
  await user(S.par, () => ok("update public.notifications set read_at = now() where user_id=$1", [S.par]));
  await user(S.par, () => denied("update public.notifications set payload = '{}'::jsonb where user_id='" + S.par + "' returning id"));
  await q("delete from public.notifications where user_id=$1 and type='t'", [S.par]);
});

await test("indexes exist (pg_indexes) and the redundant ones are gone", async () => {
  const want = ["olympiad_registrations_created_idx", "olympiad_registrations_phone_recent_idx", "olympiad_registrations_olympiad_status_idx", "attendance_class_date_idx",
    "attendance_date_status_idx", "attendance_uq", "grade_entries_student_idx", "grade_entries_journal_idx", "grade_entries_term_idx", "grade_entries_subject_idx",
    "term_grades_journal_idx", "audit_log_created_idx", "audit_log_resource_idx", "audit_log_user_idx", "game_leaderboard_idx", "notifications_unread_idx",
    "students_name_idx", "teaching_assignments_subject_idx", "schedule_slots_subject_idx", "lessons_teacher_date_idx", "announcements_class_idx",
    "student_guardians_one_primary_uq", "students_identity_uq", "classes_year_name_uq", "psych_result_scales_test_min_uq", "site_visits_created_path_idx",
    "rate_limits_window_idx", "survey_responses_survey_idx"];
  const have = new Set((await q("select indexname from pg_indexes where schemaname = 'public'")).map((r) => r.indexname));
  eq(want.filter((n) => !have.has(n)), [], "missing indexes");
  eq(["olympiad_registrations_olympiad_idx", "site_visits_created_idx"].filter((n) => have.has(n)), [], "redundant indexes still present");
});
await test("every foreign key in public is backed by an index whose leading columns are the FK columns", async () => {
  const fks = await q(`select c.conname, c.conrelid::regclass::text tbl, c.conkey
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace where c.contype = 'f' and n.nspname = 'public'`);
  const missing = [];
  for (const fk of fks) {
    const r = await one(`select exists (select 1 from pg_index i where i.indrelid = $1::regclass and i.indisvalid
        and (i.indkey::int2[])[0:${fk.conkey.length - 1}] = $2::int2[]) ok`, [fk.tbl, fk.conkey]);
    if (!r.ok) missing.push(`${fk.tbl}.${fk.conname}`);
  }
  eq(missing, [], "unindexed foreign keys");
});
await test("updated_at triggers exist on every mutable public table that has the column", async () => {
  const rows = await q(`select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
      and c.table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
      and not exists (select 1 from pg_trigger t where t.tgrelid = ('public.' || c.table_name)::regclass and t.tgname = 'trg_' || c.table_name || '_updated_at')`);
  eq(rows, [], "tables without the updated_at trigger");
  const s = await one("select updated_at from public.schedule_slots limit 1");
  assert(s === undefined || s.updated_at, "schedule_slots.updated_at");
  const cols = await q("select table_name from information_schema.columns where table_schema='public' and column_name='updated_at' and table_name in ('schedule_slots','teaching_assignments')");
  eq(cols.length, 2, "updated_at added to schedule_slots + teaching_assignments");
});
await test("list RPCs are bounded", async () => {
  await q("insert into public.academic_quizzes (title, subject_key, grade) select '{}'::jsonb, 'bulk', 1 from generate_series(1, 520)");
  const l = await anon(() => rpc("list_quizzes"));
  eq(l.length, 500, "list_quizzes capped at 500");
  await q("delete from public.academic_quizzes where subject_key = 'bulk'");
});
await test("purge_old_data: retention for visits, audit, notifications, attempts, psych submissions, rate limits (batched)", async () => {
  await q("insert into public.site_visits (path, created_at) select '/old', now() - interval '500 days' from generate_series(1, 7)");
  await q("insert into public.site_visits (path) values ('/new')");
  await q("insert into public.audit_log (action, resource, created_at) select 'a', 'r', now() - interval '800 days' from generate_series(1, 3)");
  await q("insert into public.notifications (user_id, type, created_at) values ($1,'old', now() - interval '200 days'), ($1,'fresh', now())", [S.par]);
  await q("insert into public.academic_quiz_attempts (quiz_id, student_name, created_at) values ($1,'Old Kid', now() - interval '800 days'), ($1,'New Kid', now())", [id(51)]);
  await q("insert into public.psych_test_submissions (psych_test_id, student_name, created_at) values ($1,'Old Kid', now() - interval '800 days')", [id(61)]);
  await q("insert into public.rate_limits (key, window_start, hits) values ('old', now() - interval '3 days', 1), ('cur', now(), 1)");
  const r1 = await as("service_role", null, async () => (await one("select public.purge_old_data(400, 730, 180, 730, 100) r")).r);
  eq([r1.site_visits, r1.audit_log, r1.notifications, r1.quiz_attempts, r1.psych_submissions, r1.rate_limits], [7, 3, 1, 1, 1, 1], "deleted rows");
  eq(Number((await one("select count(*)::int n from public.site_visits where path='/new'")).n), 1, "recent visit kept");
  eq(Number((await one("select count(*)::int n from public.notifications where type='fresh'")).n), 1, "recent notification kept");
  eq(Number((await one("select count(*)::int n from public.academic_quiz_attempts where student_name='New Kid'")).n), 1, "recent attempt kept");
  await q("insert into public.site_visits (path, created_at) select '/old', now() - interval '500 days' from generate_series(1, 250)");
  const r2 = await as("service_role", null, async () => (await one("select public.purge_old_data(400, 730, 180, 730, 100) r")).r);
  eq(r2.site_visits, 100, "batch size bounds one call");
  await as("service_role", null, () => ok("select public.purge_old_data(400, 730, 180, 730, 100000)"));
  await q("delete from public.notifications where type='fresh'");
  await q("delete from public.academic_quiz_attempts where student_name='New Kid'");
  await q("delete from public.site_visits");
  await q("delete from public.rate_limits");
  const keep = await as("service_role", null, async () => (await one("select public.purge_old_data(400, 730, 180, null) r")).r);
  eq(keep.quiz_attempts, 0, "NULL p_attempt_days keeps attempts");
  await anon(() => denied("select public.purge_old_data(400, 730, 180, 730, 100)"));
  await user(U.super, () => denied("select public.purge_old_data(400, 730, 180, 730, 100)"));
});

console.log("\nMigrations");
const migFile = "supabase/migrations/0002_hardening.sql";
await test("migrations/0001_init.sql + 0002_hardening.sql + seed.sql are in sync and load cleanly", async () => {
  const { split } = await import("./split.mjs");
  const parts = split(schema);
  const norm = (t) => t.replace(/\r\n/g, "\n");
  eq(norm(read("supabase/migrations/0001_init.sql")), parts.migration, "0001_init.sql stale (run npm run db:split)");
  eq(norm(read(migFile)), parts.migrations[migFile], "0002_hardening.sql stale (run npm run db:split)");
  eq(norm(read("supabase/seed.sql")), parts.seed, "seed.sql stale (run npm run db:split)");
  const fresh = new PGlite();
  await fresh.exec(stubs);
  await fresh.exec(parts.migration);
  await fresh.exec(parts.migrations[migFile]); // a new project applies 0002 right after 0001: must be a no-op
  await fresh.exec(parts.seed);
  const n = (await fresh.query("select (select count(*) from public.programs)::int p, (select count(*) from public.brain_games)::int g")).rows[0];
  eq([n.p, n.g], [3, 8], "seed rows");
  // seed is safe to run again, even when the school already has a different current year
  await fresh.exec("delete from public.school_years where id = '" + id(9001) + "'");
  await fresh.exec("insert into public.school_years (name, start_date, end_date, is_current) values ('2027-2028','2027-09-01','2028-05-31', true)");
  await fresh.exec(parts.seed);
  await fresh.exec(parts.seed);
  const y = (await fresh.query("select (select count(*) from public.school_years where is_current)::int cur, (select count(*) from public.terms)::int t, (select count(*) from public.programs)::int p")).rows[0];
  eq([y.cur, y.p], [1, 3], "seed re-run: one current year, no duplicates");
  await fresh.close();
});
await test("upgrade path: a database created from the ORIGINAL 0001 receives 0002 (legacy rows survive, result is hardened, re-run is a no-op)", async () => {
  const { split } = await import("./split.mjs");
  const parts = split(schema);
  const m2 = parts.migrations[migFile];
  const old = new PGlite();
  await old.exec(stubs);
  await old.exec(read("scripts/db/fixtures/0001_legacy.sql"));
  await old.exec(parts.seed);
  const o = (sql, p) => old.query(sql, p).then((r) => r.rows);
  // pre-hardening state really is what we claim (guards the fixture)
  eq((await o("select count(*)::int n from pg_proc where proname = 'purge_old_data' and pronamespace = 'public'::regnamespace"))[0].n, 1, "legacy purge_old_data");
  assert((await o("select 1 from pg_indexes where indexname = 'site_visits_created_idx'")).length === 1, "legacy redundant index present");
  // legacy rows that violate the new rules, plus a duplicate primary guardian, must not abort the upgrade
  await old.exec("update public.programs set cover_image_url = 'javascript:alert(1)' where id = '" + id(1) + "'");
  await old.exec("insert into auth.users (id, email) values ('88888888-8888-4888-8888-888888888888','legacy@test.uz')");
  await old.exec(m2);
  await old.exec(m2); // idempotent
  eq((await o("select count(*)::int n from pg_proc where proname = 'purge_old_data' and pronamespace = 'public'::regnamespace"))[0].n, 1, "single purge_old_data overload after upgrade");
  eq((await o("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"))[0].n, 0, "RLS everywhere");
  eq((await o(`select count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and not exists (select 1 from unnest(coalesce(p.proconfig,'{}'::text[])) c where c='search_path=public, pg_temp')`))[0].n, 0, "search_path pinned");
  eq((await o(`select distinct p.proname from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon', p.oid, 'execute') order by 1`)).map((r) => r.proname), [...PUBLIC_RPCS].sort(), "anon EXECUTE matrix");
  eq((await o("select count(*)::int n from pg_indexes where indexname in ('site_visits_created_idx','olympiad_registrations_olympiad_idx')"))[0].n, 0, "redundant indexes dropped");
  assert((await o("select 1 from pg_indexes where indexname = 'attendance_date_status_idx'")).length === 1, "new index");
  eq((await o("select convalidated from pg_constraint where conname = 'programs_cover_image_url_url_chk'"))[0].convalidated, false, "NOT VALID constraint added without failing on the legacy row");
  assert((await o("select 1 from information_schema.columns where table_name='schedule_slots' and column_name='updated_at'")).length === 1, "updated_at added");
  eq((await o("select count(*)::int n from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'auth\\.uid\\(\\)' and (coalesce(qual,'')||coalesce(with_check,'')) !~ 'SELECT auth\\.uid\\(\\)'"))[0].n, 0, "wrapped auth.uid()");
  let err = "";
  try { await old.exec("update public.programs set cover_image_url = 'javascript:alert(2)' where id = '" + id(1) + "'"); } catch (e) { err = e.message; }
  assert(/programs_cover_image_url_url_chk/.test(err), "new writes are checked: " + err);
  await old.close();
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
await db.close();
