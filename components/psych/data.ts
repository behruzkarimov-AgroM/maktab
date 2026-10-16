import type { LocalizedText } from "@/lib/types";
import { getDb } from "@/components/games/server-db";
import { adminDemoPsychTest, adminDemoPsychTests } from "@/lib/admin/demo-bridge";
import { DEMO_TESTS } from "./demo";
import { toPublic } from "./score";
import type { Audience, PublicQuestion, PublicTest, Topic } from "./types";
import { AUDIENCES, TOPICS } from "./types";

export const toLoc = (v: unknown): LocalizedText => {
  if (typeof v === "string") return { uz: v, ru: v, en: v };
  const o = (v && typeof v === "object" ? v : {}) as Partial<LocalizedText>;
  return { uz: o.uz ?? "", ru: o.ru ?? "", en: o.en ?? "" };
};

function normAudience(v: unknown): Audience {
  const s = String(v ?? "").toLowerCase();
  if ((AUDIENCES as string[]).includes(s)) return s as Audience;
  if (s.includes("parent") || s.includes("ota")) return "parents";
  if (s.includes("16") || s.includes("18") || s.includes("older") || s.includes("senior")) return "older";
  if (s.includes("11") || s.includes("15") || s.includes("teen")) return "teens";
  return "kids";
}

/** DB has no topic column in the outline; tolerate an optional one. */
function normTopic(v: unknown): Topic | undefined {
  const s = String(v ?? "").toLowerCase();
  return (TOPICS as string[]).includes(s) ? (s as Topic) : undefined;
}

function dbQuestions(rows: Array<Record<string, unknown>>): PublicQuestion[] {
  return rows.map((r) => ({
    id: String(r.id),
    text: toLoc(r.question_text),
    options: (Array.isArray(r.options) ? (r.options as Array<Record<string, unknown>>) : []).map((o) => ({
      id: String(o.id),
      text: toLoc(o.text),
      // o.score deliberately dropped
    })),
  }));
}

function mapTest(t: Record<string, unknown>): PublicTest {
  return {
    id: String(t.id),
    title: toLoc(t.title),
    description: toLoc(t.description),
    instruction: toLoc(t.instruction),
    audience: normAudience(t.target_audience),
    topic: normTopic(t.topic),
    questions: dbQuestions(Array.isArray(t.questions) ? (t.questions as Array<Record<string, unknown>>) : []),
  };
}

/** Uses the public-safe RPCs (list_psych_tests / get_psych_test / get_psych_questions): option scores never leave the DB. */
export async function loadPsychTests(): Promise<PublicTest[]> {
  const db = await getDb();
  if (!db) return [...DEMO_TESTS, ...adminDemoPsychTests()].map(toPublic);
  try {
    const { data, error } = await db.rpc("list_psych_tests");
    if (error || !Array.isArray(data) || data.length === 0) return DEMO_TESTS.map(toPublic);
    return (data as Array<Record<string, unknown>>).map(mapTest);
  } catch {
    return DEMO_TESTS.map(toPublic);
  }
}
export async function loadPsychTest(id: string): Promise<PublicTest | null> {
  const db = await getDb();
  const demo = DEMO_TESTS.find((t) => t.id === id) ?? (!db ? adminDemoPsychTest(id) : undefined);
  if (demo) return toPublic(demo);
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const { data, error } = await db.rpc("get_psych_test", { p_test_id: id });
    if (error || !data || typeof data !== "object") return null;
    let test = mapTest(data as Record<string, unknown>);
    if (test.questions.length === 0) {
      const { data: qs } = await db.rpc("get_psych_questions", { p_test_id: id });
      if (Array.isArray(qs)) test = { ...test, questions: dbQuestions(qs as Array<Record<string, unknown>>) };
    }
    return test.questions.length > 0 ? test : null;
  } catch {
    return null;
  }
}