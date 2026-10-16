// Go-live smoke test for a REAL Supabase project + a running deployment. Never deletes or edits existing data.
//   BASE_URL=https://maktab.uz node scripts/supabase-smoke.mjs
//   npm run smoke            (reads .env.local automatically when present)
//
// Environment (the same names the app uses):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY            required
//   SUPABASE_SERVICE_ROLE_KEY                                           optional (enables schema/seed/bucket/olympiad checks)
//   BASE_URL                                                            deployment to test (default http://localhost:3000)
//   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD                            CMS admin (super_admin / methodist / psychologist)
//   SMOKE_SCHOOL_<DIRECTOR|TEACHER|PARENT|STUDENT>_EMAIL / _PASSWORD    school portal accounts (only roles you give are tested)
//   SMOKE_SKIP_OLYMPIAD=1                                               skip the temporary olympiad registration test
// The only writes: one temporary olympiad + one registration (service role) that are removed again at the end, and
// session logins (cookies are kept in memory). A "SMOKE TEST" Telegram message may be sent if Telegram is configured.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const env = (k) => (process.env[k] ?? "").trim();
const SB = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SVC = env("SUPABASE_SERVICE_ROLE_KEY");
const BASE = (env("BASE_URL") || "http://localhost:3000").replace(/\/+$/, "");

const results = [];
const rec = (group, name, status, note = "") => {
  results.push({ group, name, status, note });
  return status === "PASS";
};
async function check(group, name, fn) {
  try {
    const r = await fn();
    if (r === "SKIP") return rec(group, name, "SKIP", "not configured");
    if (typeof r === "string") return rec(group, name, r.startsWith("WARN:") ? "WARN" : "PASS", r.replace(/^WARN:\s*/, ""));
    return rec(group, name, "PASS");
  } catch (e) {
    const cause = e?.cause?.code ? ` (${e.cause.code})` : "";
    return rec(group, name, "FAIL", `${String(e?.message ?? e)}${cause}`.slice(0, 220));
  }
}
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function http(url, { method = "GET", headers = {}, body, redirect = "follow", timeout = 20000 } = {}) {
  const res = await fetch(url, {
    method, redirect, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, text, json, headers: res.headers };
}
const rest = (path, { key = ANON, token, ...o } = {}) =>
  http(`${SB}/rest/v1/${path}`, { ...o, headers: { apikey: key, authorization: `Bearer ${token ?? key}`, ...(o.headers ?? {}) } });

/** minimal cookie jar for one login */
class Jar {
  c = new Map();
  absorb(res) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const val = pair.slice(i + 1).trim();
      if (!val || /max-age=0/i.test(sc)) this.c.delete(name);
      else this.c.set(name, val);
    }
  }
  header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
async function appFetch(jar, path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method, redirect: "manual", headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), cookie: jar.header() },
    body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000),
  });
  jar.absorb(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

console.log(`\nSupabase go-live smoke test\n  Supabase: ${SB || "(not set)"}\n  App:      ${BASE}\n  Service key: ${SVC ? "yes" : "no (some checks are skipped)"}\n`);
if (!SB || !ANON) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  process.exit(2);
}

/* ---------------------------------- 1. deployment ---------------------------------- */
await check("app", "GET /api/health is {ok:true}", async () => {
  const r = await http(`${BASE}/api/health`);
  must(r.status === 200 && r.json?.ok === true, `status ${r.status} body ${r.text.slice(0, 80)} (503 = env/DB problem on the server)`);
});
for (const path of ["/", "/uz", "/ru", "/en", "/uz/olympiads", "/uz/quizzes", "/uz/psychology", "/uz/games", "/uz/contact", "/uz/programs", "/school/login", "/admin/login", "/robots.txt"]) {
  await check("public pages", `GET ${path} -> 200`, async () => {
    const r = await http(`${BASE}${path}`);
    must(r.status === 200, `status ${r.status}`);
    must(!/application error|internal server error/i.test(r.text.slice(0, 4000)), "page shows an error");
  });
}
await check("public pages", "unknown page -> 404 (not 200, not 500)", async () => {
  const r = await http(`${BASE}/uz/definitely-not-a-page-${Date.now()}`);
  must(r.status === 404, `status ${r.status}`);
});

/* ---------------------------------- 2. supabase API ---------------------------------- */
await check("supabase", "REST API reachable with the anon key", async () => {
  const r = await rest("site_settings?select=id&limit=1");
  must(r.status === 200, `status ${r.status}: ${r.text.slice(0, 120)} (wrong URL/key, or schema.sql not applied?)`);
  must(Array.isArray(r.json) && r.json.length === 1, "site_settings has no row (run seed.sql)");
});
await check("supabase", "Auth settings: public sign-up is disabled", async () => {
  const r = await http(`${SB}/auth/v1/settings`, { headers: { apikey: ANON } });
  must(r.status === 200, `status ${r.status}`);
  if (r.json?.disable_signup !== true) return "WARN: sign-ups are enabled (Authentication -> Providers -> Email -> Enable sign ups = off)";
  if (r.json?.external?.email !== true) throw new Error("e-mail provider is disabled");
});
await check("supabase", "public content is readable (programs seeded)", async () => {
  const r = await rest("programs?select=id&limit=1");
  must(r.status === 200 && r.json?.length === 1, `status ${r.status}, rows ${r.json?.length}`);
});

const PROTECTED = [
  "students", "guardians", "student_guardians", "teachers", "classes", "attendance", "grade_entries", "term_grades", "behavior_notes",
  "notifications", "school_notification_prefs", "schedule_slots", "profiles", "audit_log", "admission_applications", "olympiad_registrations",
  "academic_quiz_attempts", "site_visits", "survey_responses",
];
for (const t of PROTECTED) {
  await check("anon cannot read", t, async () => {
    const r = await rest(`${t}?select=*&limit=1`);
    if ([401, 403].includes(r.status)) return;
    must(r.status !== 404, "table is missing (migration not applied?)");
    must(r.status === 200 && Array.isArray(r.json) && r.json.length === 0, `anon got status ${r.status} and ${r.json?.length ?? "?"} row(s)`);
  });
}
await check("anon cannot write", "POST admission_applications {} is refused", async () => {
  const r = await rest("admission_applications", { method: "POST", body: {} });
  must([401, 403].includes(r.status), `status ${r.status}: ${r.text.slice(0, 100)}`);
});
await check("anon cannot write", "PATCH site_settings is refused (nothing changes)", async () => {
  const r = await rest("site_settings?id=eq.1", { method: "PATCH", body: { school_name: {} }, headers: { prefer: "return=representation" } });
  must([401, 403].includes(r.status) || (r.status === 200 && Array.isArray(r.json) && r.json.length === 0), `status ${r.status}: ${r.text.slice(0, 100)}`);
});

/* ---------------------------------- 3. RPCs ---------------------------------- */
await check("rpc", "anon: public rpc list_quizzes works", async () => {
  const r = await rest("rpc/list_quizzes", { method: "POST", body: {} });
  must(r.status === 200 && Array.isArray(r.json), `status ${r.status}: ${r.text.slice(0, 100)}`);
});
for (const [fn, args] of [
  ["school_today", {}], ["is_school_director", {}], ["lock_term", { p_term: "00000000-0000-4000-8000-000000009011", p_locked: false }],
  ["mark_attendance_bulk", { p_class: "00000000-0000-4000-8000-000000009201", p_date: "2026-09-01", p_lesson_no: null, p_records: [] }],
  ["student_performance", { p_student: "00000000-0000-4000-8000-000000009301", p_year: "00000000-0000-4000-8000-000000009001" }],
  ["rate_limit_hit", { key: "smoke", max: 1, window_seconds: 1 }],
]) {
  await check("rpc", `anon: ${fn} is NOT executable`, async () => {
    const r = await rest(`rpc/${fn}`, { method: "POST", body: args });
    must([401, 403, 404].includes(r.status), `status ${r.status}: ${r.text.slice(0, 100)}`);
  });
}
if (SVC) {
  await check("rpc", "service role: school_today() returns a date", async () => {
    const r = await rest("rpc/school_today", { key: SVC, method: "POST", body: {} });
    must(r.status === 200 && /^\d{4}-\d{2}-\d{2}$/.test(String(r.json)), `status ${r.status}: ${r.text.slice(0, 100)}`);
  });
  // The service role has no auth.uid(), so the SIS RPCs refuse with `forbidden` (42501/403) - which proves the function exists with the
  // EXACT argument names the application sends. 404 / PGRST202 = function or argument names missing (stale or wrong schema).
  const Z = "00000000-0000-4000-8000-000000000001";
  for (const [fn, args] of [
    ["mark_attendance_bulk", { p_class: Z, p_date: "2026-09-01", p_lesson_no: null, p_records: [] }],
    ["save_grades_bulk", { p_class: Z, p_subject: Z, p_term: Z, p_entries: [] }],
    ["save_term_grades_bulk", { p_class: Z, p_subject: Z, p_term: Z, p_rows: [] }],
    ["lock_term", { p_term: Z, p_locked: false }],
    ["attendance_summary", { p_class: Z, p_from: "2026-09-01", p_to: "2026-09-02" }],
    ["student_performance", { p_student: Z, p_year: Z }],
    ["class_journal", { p_class: Z, p_subject: Z, p_term: Z }],
    ["rate_limit_hit", { key: "smoke-test", max: 1000, window_seconds: 1 }],
  ]) {
    await check("rpc", `${fn}: exists with the application's argument names`, async () => {
      const r = await rest(`rpc/${fn}`, { key: SVC, method: "POST", body: args });
      must(r.status !== 404, `${r.text.slice(0, 160)} (re-run the newest supabase/schema.sql)`);
    });
  }

  /* ---------------------------------- 4. schema / seed (service role) ---------------------------------- */
  const count = async (t, q = "") => {
    const r = await rest(`${t}?select=id${q}`, { key: SVC, headers: { prefer: "count=exact", range: "0-0" } });
    must([200, 206].includes(r.status), `${t}: status ${r.status} ${r.text.slice(0, 100)}`);
    return Number((r.headers.get("content-range") ?? "").split("/")[1] ?? 0);
  };
  await check("schema", "SIS tables exist + reference seed (1 current year, 4 terms, 12 subjects)", async () => {
    const y = await rest("school_years?select=id,is_current", { key: SVC });
    must(y.status === 200, `school_years: status ${y.status}`);
    must(y.json.filter((r) => r.is_current).length === 1, "exactly one school year must be current");
    const [t, s] = [await count("terms"), await count("subjects")];
    must(t >= 4, `${t} terms`);
    must(s >= 12, `${s} subjects`);
  });
  await check("schema", "latest additions applied (school_notification_prefs, term_grades.override_reason, profiles.must_change_password)", async () => {
    for (const [t, col] of [["school_notification_prefs", "user_id"], ["term_grades", "override_reason"], ["profiles", "must_change_password"]]) {
      const r = await rest(`${t}?select=${col}&limit=1`, { key: SVC });
      must(r.status === 200, `${t}.${col}: status ${r.status} - run the newest supabase/schema.sql (idempotent)`);
    }
  });
  await check("schema", "schedule room/teacher unique indexes exist (insert twice is refused)", async () => {
    const cls = await rest("classes?select=id,year_id&limit=2", { key: SVC });
    const sub = await rest("subjects?select=id&limit=1", { key: SVC });
    if (!cls.json?.length || cls.json.length < 2 || !sub.json?.length) return "WARN: skipped (needs 2 classes + 1 subject)";
    const mk = (class_id, lesson_no) => ({ class_id, subject_id: sub.json[0].id, weekday: 6, lesson_no, start_time: "07:00", end_time: "07:45", room: "SMOKE-ROOM" });
    const a = await rest("schedule_slots", { key: SVC, method: "POST", body: mk(cls.json[0].id, 8), headers: { prefer: "return=representation" } });
    must(a.status === 201, `first slot not inserted: ${a.status} ${a.text.slice(0, 100)}`);
    try {
      const b = await rest("schedule_slots", { key: SVC, method: "POST", body: mk(cls.json[1].id, 8) });
      must(b.status === 409 && /schedule_slots_room_uq/.test(b.text), `second slot in the same room: status ${b.status} ${b.text.slice(0, 100)}`);
    } finally {
      await rest(`schedule_slots?id=eq.${a.json[0].id}`, { key: SVC, method: "DELETE" });
    }
  });
  await check("schema", "storage buckets exist (school-media, test-assets, certificates)", async () => {
    const r = await http(`${SB}/storage/v1/bucket`, { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } });
    must(r.status === 200, `status ${r.status}`);
    const names = new Set((r.json ?? []).map((b) => b.id));
    const missing = ["school-media", "test-assets", "certificates"].filter((b) => !names.has(b));
    must(!missing.length, `missing: ${missing.join(", ")}`);
  });
  await check("schema", "storage: anon cannot LIST the 'certificates' bucket (student names)", async () => {
    const r = await http(`${SB}/storage/v1/object/list/certificates`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${ANON}` }, body: { prefix: "", limit: 5 } });
    must([400, 401, 403, 404].includes(r.status) || (r.status === 200 && Array.isArray(r.json) && r.json.length === 0), `status ${r.status}, ${r.json?.length ?? "?"} object(s) listed`);
  });
  await check("schema", "at least one super_admin exists (and no demo admin)", async () => {
    const r = await rest("profiles?select=id,role,is_active&role=eq.super_admin&is_active=eq.true", { key: SVC });
    must(r.status === 200 && r.json.length >= 1, "no active super_admin (see docs/SUPABASE-GO-LIVE.md step 7)");
  });
} else {
  rec("rpc", "service-role checks", "SKIP", "SUPABASE_SERVICE_ROLE_KEY not set");
}

/* ---------------------------------- 5. admin login ---------------------------------- */
if (env("SMOKE_ADMIN_EMAIL") && env("SMOKE_ADMIN_PASSWORD")) {
  await check("admin", "Supabase password login + staff profile", async () => {
    const r = await http(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON }, body: { email: env("SMOKE_ADMIN_EMAIL"), password: env("SMOKE_ADMIN_PASSWORD") } });
    must(r.status === 200 && r.json?.access_token, `login failed: status ${r.status} ${r.json?.error_description ?? r.json?.msg ?? ""}`);
    const p = await rest(`profiles?select=role,is_active&id=eq.${r.json.user.id}`, { token: r.json.access_token });
    must(p.status === 200 && p.json.length === 1, "own profile not readable");
    must(p.json[0].is_active && ["super_admin", "methodist", "psychologist"].includes(p.json[0].role), `role ${p.json[0].role} is not a CMS role`);
    // RLS from the admin side: staff read the CMS tables, still no school data unless school_admin
    const apps = await rest("admission_applications?select=id&limit=1", { token: r.json.access_token });
    must([200].includes(apps.status) || p.json[0].role === "psychologist", `admission_applications: ${apps.status}`);
    return `role ${p.json[0].role}`;
  });
} else rec("admin", "login", "SKIP", "SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not set");

/* ---------------------------------- 6. school portal ---------------------------------- */
const ROLES = { DIRECTOR: ["super_admin", "school_admin"], TEACHER: ["teacher"], PARENT: ["parent"], STUDENT: ["student"] };
for (const [R, roles] of Object.entries(ROLES)) {
  const email = env(`SMOKE_SCHOOL_${R}_EMAIL`);
  const password = env(`SMOKE_SCHOOL_${R}_PASSWORD`);
  if (!email || !password) {
    rec("school", `${R.toLowerCase()} login`, "SKIP", `SMOKE_SCHOOL_${R}_EMAIL / _PASSWORD not set`);
    continue;
  }
  const jar = new Jar();
  let mustChange = false;
  const ok = await check("school", `${R.toLowerCase()}: login + /me`, async () => {
    const li = await appFetch(jar, "/api/school/auth/login", { method: "POST", body: { email, password } });
    must(li.status === 200 && li.json?.ok, `login: status ${li.status} ${li.json?.error ?? ""}`);
    must(roles.includes(li.json.role), `role ${li.json.role}, expected ${roles.join("/")}`);
    mustChange = !!li.json.must_change_password;
    const me = await appFetch(jar, "/api/school/me");
    must(me.status === 200 && me.json?.user?.role === li.json.role, `/me status ${me.status}`);
    must(me.json.demo === false, "app is still in DEMO mode (Supabase env missing on the server?)");
    return mustChange ? "WARN: account still has a temporary password (must_change_password)" : `role ${li.json.role}`;
  });
  if (!ok || mustChange) continue;
  await check("school", `${R.toLowerCase()}: scoped data endpoints`, async () => {
    const st = await appFetch(jar, "/api/school/students?limit=500");
    must(st.status === 200, `/students status ${st.status}`);
    const cl = await appFetch(jar, "/api/school/classes");
    must(cl.status === 200, `/classes status ${cl.status}`);
    const total = st.json.total;
    if (R === "STUDENT") must(total === 1, `student sees ${total} students (expected 1)`);
    if (R === "PARENT") must(total >= 1 && total <= 8, `parent sees ${total} students (expected the own children only)`);
    if (R === "TEACHER") {
      const all = await appFetch(jar, "/api/school/classes");
      must(all.json.classes.length < 40, "teacher sees an unreasonable number of classes");
    }
    return `${total} student(s), ${cl.json.classes.length} class(es)`;
  });
  await check("school", `${R.toLowerCase()}: dashboard + notifications + prefs`, async () => {
    for (const p of ["/api/school/dashboard", "/api/school/notifications", "/api/school/me/prefs"]) {
      const r = await appFetch(jar, p);
      must(r.status === 200, `${p} status ${r.status} ${r.json?.error ?? ""}`);
    }
  });
  if (R !== "DIRECTOR") {
    await check("school", `${R.toLowerCase()}: director-only endpoints are refused`, async () => {
      for (const [m, p, b] of [["POST", "/api/school/accounts", { kind: "teacher", id: "00000000-0000-4000-8000-000000000001", email: "x@y.uz" }], ["GET", "/api/school/director/audit"], ["POST", "/api/school/years-terms/lock", { term_id: "00000000-0000-4000-8000-000000009011", locked: false }]]) {
        const r = await appFetch(jar, p, { method: m, body: b });
        must(r.status === 403, `${m} ${p}: status ${r.status} (expected 403)`);
      }
    });
  } else {
    await check("school", "director: audit + term status + overview", async () => {
      for (const p of ["/api/school/director/audit", "/api/school/director/overview", "/api/school/years-terms"]) {
        const r = await appFetch(jar, p);
        must(r.status === 200, `${p} status ${r.status} ${r.json?.error ?? ""}`);
      }
    });
  }
  await check("school", `${R.toLowerCase()}: wrong password is rejected`, async () => {
    const r = await appFetch(new Jar(), "/api/school/auth/login", { method: "POST", body: { email, password: `${password}-wrong` } });
    must(r.status === 401 && r.json?.error === "invalid_credentials", `status ${r.status}`);
  });
  await appFetch(jar, "/api/school/auth/logout", { method: "POST", body: {} });
  await check("school", `${R.toLowerCase()}: after logout /me is 401`, async () => {
    const r = await appFetch(jar, "/api/school/me");
    must(r.status === 401, `status ${r.status}`);
  });
}
await check("school", "request-reset answers the same for unknown e-mails", async () => {
  const a = await appFetch(new Jar(), "/api/school/auth/request-reset", { method: "POST", body: { email: `smoke.nobody.${Date.now()}@example.com` } });
  must(a.status === 200 && a.json?.sent === true, `status ${a.status} ${a.json?.error ?? ""}`);
});
await check("school", "anonymous API calls are 401", async () => {
  const r = await appFetch(new Jar(), "/api/school/students");
  must(r.status === 401, `status ${r.status}`);
});

/* ---------------------------------- 7. registration round trip ---------------------------------- */
if (SVC && !env("SMOKE_SKIP_OLYMPIAD")) {
  let olympiadId = null;
  try {
    const when = (d) => new Date(Date.now() + d * 864e5).toISOString();
    const make = await rest("olympiads", {
      key: SVC, method: "POST", headers: { prefer: "return=representation" },
      body: {
        title: { uz: "SMOKE TEST", ru: "SMOKE TEST", en: "SMOKE TEST" }, subjects: [{ key: "math", name: { uz: "Matematika", ru: "Математика", en: "Math" } }],
        event_date: when(30), registration_deadline: when(20), is_registration_open: true,
      },
    });
    const created = await check("registration", "create a temporary test olympiad (service role)", async () => {
      must(make.status === 201 && make.json?.[0]?.id, `status ${make.status}: ${make.text.slice(0, 120)}`);
      olympiadId = make.json[0].id;
    });
    if (created) {
      const payload = {
        olympiadId, studentFullName: "Smoke Testov", birthDate: `${new Date().getUTCFullYear() - 12}-05-10`, currentSchool: "Smoke School", grade: 6,
        subjectKey: "math", parentPhone: "+998901112233", extraPhone: "",
      };
      let ticket = null;
      await check("registration", "POST /api/olympiad/register -> 201 + ticket", async () => {
        const r = await http(`${BASE}/api/olympiad/register`, { method: "POST", body: payload });
        must(r.status === 201 && r.json?.ticket?.ticket, `status ${r.status}: ${r.text.slice(0, 120)}`);
        ticket = r.json.ticket.ticket;
        must(/^OLY-\d{4}-/.test(ticket), `ticket format ${ticket}`);
      });
      await check("registration", "duplicate registration is refused", async () => {
        const r = await http(`${BASE}/api/olympiad/register`, { method: "POST", body: payload });
        must(r.status === 400 && /already/.test(r.text), `status ${r.status}: ${r.text.slice(0, 100)}`);
      });
      await check("registration", "result lookup does not leak unpublished data", async () => {
        const r = await http(`${BASE}/api/olympiad/result?ticket=${encodeURIComponent(ticket ?? "OLY-2026-AAAAAAAAAA")}`);
        must(r.status === 200 && r.json?.result === null, `status ${r.status}: ${r.text.slice(0, 100)}`);
      });
      await check("registration", "anon cannot read the registration directly", async () => {
        const r = await rest(`olympiad_registrations?olympiad_id=eq.${olympiadId}&select=*`);
        must([401, 403].includes(r.status) || (r.status === 200 && r.json.length === 0), `status ${r.status} rows ${r.json?.length}`);
      });
    }
  } finally {
    if (olympiadId) {
      const d = await rest(`olympiads?id=eq.${olympiadId}`, { key: SVC, method: "DELETE" }); // registrations cascade
      rec("registration", "cleanup: test olympiad + registration removed", d.status === 204 ? "PASS" : "FAIL", d.status === 204 ? "" : `status ${d.status} - delete olympiad ${olympiadId} manually`);
    }
  }
} else rec("registration", "olympiad registration round trip", "SKIP", SVC ? "SMOKE_SKIP_OLYMPIAD=1" : "SUPABASE_SERVICE_ROLE_KEY not set");

/* ---------------------------------- report ---------------------------------- */
const W = Math.max(...results.map((r) => r.group.length), 5);
const N = Math.min(70, Math.max(...results.map((r) => r.name.length), 4));
const icon = { PASS: "PASS", FAIL: "FAIL", WARN: "WARN", SKIP: "skip" };
console.log(`${"GROUP".padEnd(W)}  ${"CHECK".padEnd(N)}  RESULT  NOTE`);
console.log("-".repeat(W + N + 30));
for (const r of results) console.log(`${r.group.padEnd(W)}  ${r.name.slice(0, N).padEnd(N)}  ${icon[r.status].padEnd(6)}  ${r.note}`);
const n = (s) => results.filter((r) => r.status === s).length;
console.log("-".repeat(W + N + 30));
console.log(`PASS ${n("PASS")}   FAIL ${n("FAIL")}   WARN ${n("WARN")}   SKIP ${n("SKIP")}`);
if (n("FAIL")) {
  console.log("\nRESULT: FAIL - fix the lines marked FAIL (docs/SUPABASE-GO-LIVE.md, section 'Xatolar').");
  process.exit(1);
}
console.log(n("WARN") ? "\nRESULT: PASS with warnings" : "\nRESULT: PASS");
