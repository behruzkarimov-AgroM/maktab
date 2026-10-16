import { describe, expect, it } from "vitest";
import { demoSurveyQuestions, demoSurveyResponses, DEMO_PARENTS_ID, DEMO_STUDENTS_ID } from "@/components/surveys/demo";
import { RESOURCE_MAP } from "@/lib/admin/resources";
import { createSurveyFromDraft, draftToRows, fillText, SurveyDraftError } from "@/lib/admin/surveys-create";
import type { SurveyDraft } from "@/lib/admin/survey-types";
import { loadSurveyResults, parseRange } from "@/lib/admin/surveys";
import { listRows } from "@/lib/admin/store";
import { buildSchema, normalize, toCsv } from "@/lib/admin/validation";
import { aggregateSurvey, filterResponses, responsesTable } from "@/lib/surveys/aggregate";
import { isOpenNow, normSurvey } from "@/lib/surveys/public";
import { getPublicSurvey, hashToken, listPublicSurveys, submitSurveyResponse } from "@/lib/surveys/server";
import { submitSchema, validateAnswers } from "@/lib/surveys/validate";
import { demoTable } from "@/lib/admin/demo-store";
import type { SurveyQuestionRow } from "@/lib/surveys/types";

const L = (s: string) => ({ uz: s, ru: s, en: s });
const questions = demoSurveyQuestions();
const parentQs = questions.filter((q) => q.survey_id === DEMO_PARENTS_ID);
const P = (n: number) => `${DEMO_PARENTS_ID}-q${n}`;
const okAnswers = () => ({ [P(1)]: 4, [P(2)]: "B", [P(3)]: ["A", "C"], [P(4)]: 5, [P(5)]: "yes" });

describe("validateAnswers", () => {
  it("accepts a complete valid answer map and drops optional blanks / unknown keys", () => {
    const r = validateAnswers(parentQs, { ...okAnswers(), [P(6)]: "   ", unknown: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.clean).sort()).toEqual([P(1), P(2), P(3), P(4), P(5)]);
    }
  });
  it("trims text answers", () => {
    const r = validateAnswers(parentQs, { ...okAnswers(), [P(6)]: "  hello  " });
    expect(r.ok && r.clean[P(6)]).toBe("hello");
  });
  it("rejects missing required answers", () => {
    const { [P(5)]: _x, ...rest } = okAnswers();
    void _x;
    expect(validateAnswers(parentQs, rest)).toEqual({ ok: false, code: "required_missing", questionId: P(5) });
    expect(validateAnswers(parentQs, { ...okAnswers(), [P(3)]: [] })).toMatchObject({ code: "required_missing" });
  });
  it.each([
    ["unknown option", { [P(2)]: "Z" }],
    ["option of wrong type", { [P(2)]: 3 }],
    ["duplicate multi option", { [P(3)]: ["A", "A"] }],
    ["multi with unknown option", { [P(3)]: ["A", "Q"] }],
    ["multi not an array", { [P(3)]: "A" }],
    ["scale above max", { [P(1)]: 6 }],
    ["scale below min", { [P(1)]: 0 }],
    ["scale decimal", { [P(1)]: 2.5 }],
    ["scale as string", { [P(1)]: "4" }],
    ["yes/no other value", { [P(5)]: "maybe" }],
    ["text too long", { [P(6)]: "x".repeat(1001) }],
    ["text not a string", { [P(6)]: 5 }],
  ])("rejects invalid answer: %s", (_name, patch) => {
    expect(validateAnswers(parentQs, { ...okAnswers(), ...patch })).toMatchObject({ ok: false, code: "invalid_answer" });
  });
  it("accepts exactly 1000 characters of text", () => {
    expect(validateAnswers(parentQs, { ...okAnswers(), [P(6)]: "y".repeat(1000) }).ok).toBe(true);
  });
  it("rejects non-object payloads", () => {
    for (const bad of [null, [], "x", 5]) expect(validateAnswers(parentQs, bad)).toMatchObject({ ok: false, code: "invalid_input" });
  });
});

describe("submitSchema", () => {
  const base = { surveyId: "svy-parents", answers: { a: 1 }, token: "0123456789abcdef-token" };
  it("accepts a normal body and rejects bad tokens / roles / grades / huge payloads", () => {
    expect(submitSchema.safeParse(base).success).toBe(true);
    expect(submitSchema.safeParse({ ...base, token: "short" }).success).toBe(false);
    expect(submitSchema.safeParse({ ...base, token: "has spaces in it!!!" }).success).toBe(false);
    expect(submitSchema.safeParse({ ...base, roleHint: "boss" }).success).toBe(false);
    expect(submitSchema.safeParse({ ...base, grade: 12 }).success).toBe(false);
    expect(submitSchema.safeParse({ ...base, answers: { a: "x".repeat(1001) } }).success).toBe(false);
    expect(submitSchema.safeParse({ ...base, answers: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`q${i}`, 1])) }).success).toBe(false);
  });
});

describe("aggregateSurvey", () => {
  const responses = demoSurveyResponses(questions);
  const parents = responses.filter((r) => r.survey_id === DEMO_PARENTS_ID);
  const stats = aggregateSurvey(DEMO_PARENTS_ID, parentQs, parents);

  it("counts responses and per-question totals", () => {
    expect(stats.total).toBe(parents.length);
    expect(stats.questions).toHaveLength(6);
    expect(stats.questions[0].answered).toBe(parents.length); // required
    const single = stats.questions[1].counts!;
    expect(single.reduce((a, c) => a + c.count, 0)).toBe(stats.questions[1].answered);
  });
  it("scale: avg/min/max/distribution are consistent", () => {
    const s = stats.questions[0].scale!;
    const vals = parents.map((r) => r.answers[P(1)] as number);
    expect(s.min).toBe(Math.min(...vals));
    expect(s.max).toBe(Math.max(...vals));
    expect(s.avg).toBeCloseTo(vals.reduce((a, b) => a + b, 0) / vals.length, 1);
    expect(s.distribution.map((d) => d.value)).toEqual([1, 2, 3, 4, 5]);
    expect(s.distribution.reduce((a, d) => a + d.count, 0)).toBe(parents.length);
  });
  it("multiple choice counts every selected option; yes/no counts add up", () => {
    const multi = stats.questions[2].counts!;
    const selections = parents.reduce((n, r) => n + ((r.answers[P(3)] as string[] | undefined)?.length ?? 0), 0);
    expect(multi.reduce((a, c) => a + c.count, 0)).toBe(selections);
    const yn = stats.questions[4].counts!;
    expect(yn.map((c) => c.id)).toEqual(["yes", "no"]);
    expect(yn[0].count + yn[1].count).toBe(stats.questions[4].answered);
  });
  it("text answers are newest first and capped", () => {
    const texts = stats.questions[5].texts!;
    expect(texts.length).toBe(stats.questions[5].answered);
    const times = texts.map((t) => t.created_at);
    expect([...times].sort().reverse()).toEqual(times);
  });
  it("by_role / by_day add up to the total", () => {
    expect(stats.by_role.reduce((a, r) => a + r.count, 0)).toBe(stats.total);
    expect(stats.by_day.reduce((a, d) => a + d.count, 0)).toBe(stats.total);
  });
  it("date range filter: from inclusive, to exclusive", () => {
    const rows = [
      { answers: { [P(1)]: 5 }, created_at: "2026-01-01T10:00:00.000Z", role_hint: null },
      { answers: { [P(1)]: 1 }, created_at: "2026-01-05T10:00:00.000Z", role_hint: null },
    ];
    expect(filterResponses(rows, { from: "2026-01-02T00:00:00.000Z" })).toHaveLength(1);
    expect(filterResponses(rows, { to: "2026-01-05T10:00:00.000Z" })).toHaveLength(1);
    const s = aggregateSurvey("x", [parentQs[0]], rows, { from: "2026-01-02T00:00:00.000Z" });
    expect([s.total, s.questions[0].scale!.avg]).toEqual([1, 1]);
    expect(aggregateSurvey("x", [parentQs[0]], [], {}).questions[0].scale).toMatchObject({ avg: null, min: null, max: null });
  });
});

describe("export table (formula injection safe)", () => {
  it("maps option ids to labels and neutralises =,+,-,@ cells in CSV", () => {
    const label = (v: unknown) => (v && typeof v === "object" ? ((v as { uz?: string }).uz ?? "") : String(v));
    const t = responsesTable(
      parentQs,
      [{ answers: { [P(1)]: 5, [P(2)]: "B", [P(3)]: ["A", "C"], [P(6)]: "=HYPERLINK(\"http://evil\")" }, created_at: "2026-01-01T00:00:00Z", role_hint: "parent", grade: null }],
      label,
      { date: "Date", role: "Role", grade: "Grade" },
    );
    expect(t.header.slice(0, 3)).toEqual(["Date", "Role", "Grade"]);
    expect(t.rows[0][4]).toBe("Ijtimoiy tarmoqlardan");
    expect(t.rows[0][5]).toBe("Sifatli ta'lim; Ovqatlanish");
    const csv = toCsv([t.header, ...t.rows]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/(^|,|\n)=HYPERLINK/);
  });
});

describe("admin validation (cross-field)", () => {
  const qRes = RESOURCE_MAP.survey_questions;
  const sRes = RESOURCE_MAP.surveys;
  const opts = (...ids: string[]) => ids.map((id) => ({ id, text: L(`opt ${id}`) }));
  const q = (o: Record<string, unknown>) => ({
    survey_id: "s1", type: "single", required: true, question_text: L("Q?"), options: opts("A", "B"),
    scale_min: 1, scale_max: 5, scale_min_label: L(""), scale_max_label: L(""), sort_order: 1, ...o,
  });
  const ok = (o: Record<string, unknown>) => buildSchema(qRes, "create").safeParse(q(o));

  it("accepts valid questions of every type", () => {
    expect(ok({}).success).toBe(true);
    expect(ok({ type: "multiple", options: opts("A", "B", "C") }).success).toBe(true);
    expect(ok({ type: "scale", options: [] }).success).toBe(true);
    expect(ok({ type: "text", options: [] }).success).toBe(true);
    expect(ok({ type: "yesno", options: [] }).success).toBe(true);
  });
  it("choice questions need at least two options", () => {
    expect(ok({ options: opts("A") }).success).toBe(false);
    expect(ok({ type: "multiple", options: [] }).success).toBe(false);
  });
  it("option ids must be unique and option text (uz) required", () => {
    expect(ok({ options: opts("A", "A") }).success).toBe(false);
    expect(ok({ options: [{ id: "A", text: L("x") }, { id: "B", text: L("") }] }).success).toBe(false);
    expect(ok({ options: Array.from({ length: 11 }, (_, i) => ({ id: `O${i}`, text: L("x") })) }).success).toBe(false);
  });
  it("scale_min must be below scale_max (and within 0..10) for scales", () => {
    expect(ok({ type: "scale", scale_min: 3, scale_max: 3 }).success).toBe(false);
    expect(ok({ type: "scale", scale_min: 5, scale_max: 2 }).success).toBe(false);
    expect(ok({ type: "scale", scale_min: 0, scale_max: 10 }).success).toBe(true);
    expect(ok({ type: "scale", scale_min: 1, scale_max: 11 }).success).toBe(false);
  });
  it("rejects unknown types; partial updates (reorder) pass", () => {
    expect(ok({ type: "essay" }).success).toBe(false);
    expect(buildSchema(qRes, "update").safeParse({ sort_order: 3 }).success).toBe(true);
  });
  it("normalize clears options for non-choice types and trims option text", () => {
    const parsed = ok({ type: "text", options: opts("A", "B") });
    expect(parsed.success && normalize(qRes, parsed.data as Record<string, unknown>).options).toEqual([]);
    const p2 = ok({ options: [{ id: "A", text: L("  hi ") }, { id: "B", text: L("yo") }] });
    expect(p2.success && (normalize(qRes, p2.data as Record<string, unknown>).options as { text: { uz: string } }[])[0].text.uz).toBe("hi");
  });
  it("survey dates: starts_at must not be after ends_at", () => {
    const s = (o: Record<string, unknown>) =>
      buildSchema(sRes, "create").safeParse({ title: L("T"), description: L(""), audience: "all", is_active: true, is_anonymous: true, allow_multiple_responses: false, ...o });
    expect(s({}).success).toBe(true);
    expect(s({ starts_at: "2026-02-01T00:00", ends_at: "2026-01-01T00:00" }).success).toBe(false);
    expect(s({ starts_at: "2026-01-01T00:00", ends_at: "2026-02-01T00:00" }).success).toBe(true);
    expect(s({ audience: "everyone" }).success).toBe(false);
  });
  it("roles: all staff read, only super_admin + methodist write", () => {
    expect(sRes.read).toEqual(["super_admin", "methodist", "psychologist"]);
    expect(sRes.write).toEqual(["super_admin", "methodist"]);
    expect(qRes.write).toEqual(["super_admin", "methodist"]);
    expect(sRes.group).toBe("mind");
    expect(qRes.nav).toBe(false);
  });
});

describe("public mappers", () => {
  it("isOpenNow honours is_active and the date window", () => {
    const now = Date.parse("2026-06-01T00:00:00Z");
    expect(isOpenNow({ is_active: true }, now)).toBe(true);
    expect(isOpenNow({ is_active: false }, now)).toBe(false);
    expect(isOpenNow({ is_active: true, ends_at: "2026-05-01T00:00:00Z" }, now)).toBe(false);
    expect(isOpenNow({ is_active: true, starts_at: "2026-07-01T00:00:00Z" }, now)).toBe(false);
    expect(isOpenNow({ is_active: true, starts_at: "2026-05-01T00:00:00Z", ends_at: "2026-07-01T00:00:00Z" }, now)).toBe(true);
  });
  it("normSurvey strips internals and orders questions", () => {
    const s = normSurvey({ id: "x", title: L("T"), audience: "weird", secret: 1 }, [
      { id: "b", type: "text", sort_order: 2, question_text: L("B") },
      { id: "a", type: "single", sort_order: 1, question_text: L("A"), options: [{ id: "A", text: L("a"), score: 9 }] },
    ]);
    expect(s.audience).toBe("all");
    expect(s.questions!.map((q) => q.id)).toEqual(["a", "b"]);
    expect(JSON.stringify(s)).not.toMatch(/secret|score/);
  });
});

describe("demo store: public flow + admin results", () => {
  const token = (n: number) => `test-token-${String(n).padStart(8, "0")}`;
  const submit = (answers: Record<string, unknown>, tok: string, extra: Record<string, unknown> = {}) =>
    submitSurveyResponse({ surveyId: DEMO_PARENTS_ID, answers, token: tok, ...extra });

  it("lists the two seeded surveys and returns questions for one", async () => {
    const list = await listPublicSurveys();
    expect(list.map((s) => s.id).sort()).toEqual([DEMO_PARENTS_ID, DEMO_STUDENTS_ID]);
    expect(list.every((s) => s.question_count > 0 && !s.questions)).toBe(true);
    const one = await getPublicSurvey(DEMO_PARENTS_ID);
    expect(one?.questions).toHaveLength(6);
    expect(await getPublicSurvey("nope")).toBeNull();
    expect(await getPublicSurvey("../etc/passwd")).toBeNull();
  });

  it("stores a response, blocks a duplicate token, and the admin result count increases", async () => {
    const before = (await loadSurveyResults(DEMO_PARENTS_ID, {}, false))!.stats.total;
    expect(await submit(okAnswers(), token(1), { roleHint: "parent" })).toEqual({ ok: true });
    expect(await submit(okAnswers(), token(1))).toEqual({ ok: false, code: "already_responded" });
    expect(await submit(okAnswers(), token(2))).toEqual({ ok: true });
    const after = (await loadSurveyResults(DEMO_PARENTS_ID, {}, false))!.stats.total;
    expect(after).toBe(before + 2);
    // only a salted hash is stored, never the token
    const stored = demoTable("survey_responses").find((r) => r.respondent_token_hash === hashToken(DEMO_PARENTS_ID, token(1)));
    expect(stored).toBeTruthy();
    expect(JSON.stringify(demoTable("survey_responses"))).not.toContain(token(1));
    // same token on another survey is a different respondent
    const students = demoSurveyQuestions().filter((q) => q.survey_id === DEMO_STUDENTS_ID);
    const sAns = { [students[0].id]: ["A"], [students[1].id]: "A", [students[2].id]: 3, [students[3].id]: "no" };
    expect(await submitSurveyResponse({ surveyId: DEMO_STUDENTS_ID, answers: sAns, token: token(1) })).toEqual({ ok: true });
  });

  it("allow_multiple_responses lets the same token answer again", async () => {
    const s = demoTable("surveys").find((x) => x.id === DEMO_PARENTS_ID)!;
    s.allow_multiple_responses = true;
    expect(await submit(okAnswers(), token(1))).toEqual({ ok: true });
    s.allow_multiple_responses = false;
  });

  it("rejects invalid input without storing anything", async () => {
    const n = demoTable("survey_responses").length;
    expect(await submit({ ...okAnswers(), [P(2)]: "Z" }, token(10))).toEqual({ ok: false, code: "invalid_answer" });
    const { [P(5)]: _x, ...rest } = okAnswers();
    void _x;
    expect(await submit(rest, token(11))).toEqual({ ok: false, code: "required_missing" });
    expect(await submitSurveyResponse({ surveyId: "missing", answers: {}, token: token(12) })).toEqual({ ok: false, code: "not_found" });
    expect(demoTable("survey_responses").length).toBe(n);
  });

  it("non-anonymous surveys require a role", async () => {
    const s = demoTable("surveys").find((x) => x.id === DEMO_PARENTS_ID)!;
    s.is_anonymous = false;
    expect(await submit(okAnswers(), token(20))).toEqual({ ok: false, code: "invalid_input" });
    expect(await submit(okAnswers(), token(20), { roleHint: "parent" })).toEqual({ ok: true });
    s.is_anonymous = true;
  });

  it("closed surveys are rejected and hidden (ended / not started / inactive)", async () => {
    const s = demoTable("surveys").find((x) => x.id === DEMO_STUDENTS_ID)!;
    const answers = { [`${DEMO_STUDENTS_ID}-q1`]: ["A"], [`${DEMO_STUDENTS_ID}-q2`]: "A", [`${DEMO_STUDENTS_ID}-q3`]: 3, [`${DEMO_STUDENTS_ID}-q4`]: "yes" };
    const run = (tok: string) => submitSurveyResponse({ surveyId: DEMO_STUDENTS_ID, answers, token: tok });
    s.ends_at = new Date(Date.now() - 3600_000).toISOString();
    expect(await run(token(30))).toEqual({ ok: false, code: "survey_closed" });
    expect(await getPublicSurvey(DEMO_STUDENTS_ID)).toBeNull();
    expect((await listPublicSurveys()).map((x) => x.id)).toEqual([DEMO_PARENTS_ID]);
    s.ends_at = null;
    s.starts_at = new Date(Date.now() + 86400_000).toISOString();
    expect(await run(token(31))).toEqual({ ok: false, code: "survey_closed" });
    s.starts_at = null;
    s.is_active = false;
    expect(await run(token(32))).toEqual({ ok: false, code: "not_found" });
    s.is_active = true;
    expect(await run(token(33))).toEqual({ ok: true });
  });

  it("loadSurveyResults: date filter and export rows", async () => {
    const all = (await loadSurveyResults(DEMO_PARENTS_ID, {}, true))!;
    expect(all.responses!.length).toBe(all.stats.total);
    expect(all.responses!.every((r) => !("respondent_token_hash" in r))).toBe(true);
    const future = (await loadSurveyResults(DEMO_PARENTS_ID, parseRange("2999-01-01", null)!, false))!;
    expect(future.stats.total).toBe(0);
    expect(await loadSurveyResults("does-not-exist", {}, false)).toBeNull();
  });

  it("parseRange validates dates; `to` is inclusive of the whole day", () => {
    expect(parseRange(null, null)).toEqual({});
    expect(parseRange("2026-01-02", "2026-01-02")).toEqual({ from: "2026-01-02T00:00:00.000Z", to: "2026-01-03T00:00:00.000Z" });
    expect(parseRange("2026-02-01", "2026-01-01")).toBeNull();
    expect(parseRange("bad", null)).toBeNull();
    expect(parseRange("2026-13-45", null)).toBeNull();
  });

  it("deleting a survey cascades to its questions and responses", async () => {
    const draft: SurveyDraft = { title: "Temp", questions: [{ type: "text", text: "Why?" }] };
    const { survey, questions: qs } = await createSurveyFromDraft(draft);
    demoTable("survey_responses").push({ id: "tmp-r", survey_id: survey.id, respondent_token_hash: "x".repeat(20), role_hint: null, grade: null, answers: {}, created_at: new Date().toISOString() } as never);
    const { demoDelete } = await import("@/lib/admin/demo-store");
    expect(demoDelete(RESOURCE_MAP.surveys, String(survey.id))).toBe(true);
    expect(demoTable("survey_questions").some((r) => r.survey_id === survey.id)).toBe(false);
    expect(demoTable("survey_responses").some((r) => r.survey_id === survey.id)).toBe(false);
    expect(qs).toHaveLength(1);
  });
});

describe("createSurveyFromDraft", () => {
  const draft: SurveyDraft = {
    title: { uz: "Imported survey", ru: "Импорт" },
    description: "About",
    audience: "parents",
    questions: [
      { type: "single", text: "Pick one", options: [{ text: "Yes" }, { text: { uz: "No" } }] },
      { type: "multiple", text: { uz: "Pick many" }, options: [{ id: "X", text: "a" }, { id: "X", text: "b" }, { text: "c" }], required: false },
      { type: "scale", text: "Rate", scaleMin: 1, scaleMax: 10, scaleMinLabel: "bad", scaleMaxLabel: "good" },
      { type: "yesno", text: "Sure?", options: [{ text: "ignored" }] },
      { type: "text", text: "Comments" },
    ],
  };

  it("fillText copies the first filled language into the empty ones", () => {
    expect(fillText("  Hi ")).toEqual({ uz: "Hi", ru: "Hi", en: "Hi" });
    expect(fillText({ ru: "Привет" })).toEqual({ uz: "Привет", ru: "Привет", en: "Привет" });
    expect(fillText(undefined)).toEqual({ uz: "", ru: "", en: "" });
  });

  it("draftToRows normalises ids, ordering and unused fields", () => {
    const rows = draftToRows(draft);
    expect(rows.survey).toMatchObject({ audience: "parents", is_active: false, is_anonymous: true, allow_multiple_responses: false });
    expect(rows.questions.map((q) => q.sort_order)).toEqual([1, 2, 3, 4, 5]);
    expect((rows.questions[0].options as { id: string }[]).map((o) => o.id)).toEqual(["A", "B"]);
    expect((rows.questions[1].options as { id: string }[]).map((o) => o.id)).toEqual(["X", "B", "C"]); // duplicate id re-lettered
    expect(rows.questions[2]).toMatchObject({ scale_min: 1, scale_max: 10 });
    expect(rows.questions[3].options).toEqual([]);
  });

  it("creates an INACTIVE survey with ordered questions in the store", async () => {
    const { survey, questions: qs } = await createSurveyFromDraft(draft, { id: "u1", email: "a@b.c", name: "A", role: "super_admin", demo: true });
    expect(survey.is_active).toBe(false);
    expect(qs).toHaveLength(5);
    const rows = (await listRows(RESOURCE_MAP.survey_questions, { all: true, filters: { survey_id: String(survey.id) } })).rows;
    expect(rows.map((r) => r.type)).toEqual(["single", "multiple", "scale", "yesno", "text"]);
    expect((await getPublicSurvey(String(survey.id)))).toBeNull(); // hidden until a person activates it
    expect(demoTable("audit_log").some((a) => a.resource === "surveys" && a.record_id === String(survey.id))).toBe(true);
  });

  it("rejects invalid drafts with SurveyDraftError and creates nothing", async () => {
    const count = demoTable("surveys").length;
    const bad: SurveyDraft[] = [
      { title: "x", questions: [] },
      { title: "", questions: [{ type: "text", text: "q" }] },
      { title: "x", questions: [{ type: "single", text: "q", options: [{ text: "only one" }] }] },
      { title: "x", questions: [{ type: "scale", text: "q", scaleMin: 5, scaleMax: 5 }] },
      { title: "x", questions: [{ type: "essay" as never, text: "q" }] },
      { title: "x", audience: "nobody" as never, questions: [{ type: "text", text: "q" }] },
      { title: "x", startsAt: "2026-02-01T00:00", endsAt: "2026-01-01T00:00", questions: [{ type: "text", text: "q" }] },
    ];
    for (const d of bad) await expect(createSurveyFromDraft(d)).rejects.toBeInstanceOf(SurveyDraftError);
    expect(demoTable("surveys").length).toBe(count);
  });
});

describe("seed integrity", () => {
  it("every seeded choice question has >= 2 options with unique ids, and the schema accepts them", () => {
    const schema = buildSchema(RESOURCE_MAP.survey_questions, "create");
    for (const q of questions as SurveyQuestionRow[]) {
      const { id: _id, created_at: _c, ...rest } = q;
      void _id;
      void _c;
      const r = schema.safeParse({ ...rest, scale_min_label: rest.scale_min_label ?? L(""), scale_max_label: rest.scale_max_label ?? L("") });
      expect(r.success, `${q.id}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });
});
