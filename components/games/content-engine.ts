// Server-only data access for content games: Supabase RPCs when configured, the admin demo store otherwise.
//  - list_game_sets / start_content_round: anon-callable RPCs, never return answers.
//  - check_content_answer / content_fifty_fifty: service_role only; the API routes verify the signed round token first.
import "server-only";
import { demoTable } from "@/lib/admin/demo-store";
import type { GameContentSetRow, GameContentType } from "@/lib/admin/game-content-types";
import { getAdminClient } from "@/lib/supabase/admin";
import { buildRound, checkAnswer, summarize, wrongOptionIds } from "./content-core";
import type { AnswerResult, ContentRoundBody, ContentSetSummary, MatchingPair, QuizQuestion, TfQuestion } from "./content-types";
import { getDb, type LooseClient } from "./server-db";

const demoRows = () => (demoTable("game_content_sets") as unknown as GameContentSetRow[]).filter((r) => r.is_active !== false);
const demoSet = (id: string) => demoRows().find((r) => String(r.id) === id);

async function adminDb(): Promise<LooseClient | null> {
  return getAdminClient() as unknown as LooseClient | null;
}

export async function listSets(type: GameContentType): Promise<ContentSetSummary[]> {
  const db = await getDb();
  if (!db) {
    return demoRows()
      .filter((r) => r.game_type === type)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(summarize);
  }
  const { data, error } = await db.rpc("list_game_sets", { p_game_type: type });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ContentSetSummary[];
}

/** Round without the signing token (the route adds it). null = set not found / inactive. */
export async function startRound(setId: string, n: number): Promise<ContentRoundBody | null> {
  const db = await getDb();
  if (!db) {
    const row = demoSet(setId);
    return row ? buildRound(row, n) : null;
  }
  const { data, error } = await db.rpc("start_content_round", { p_set: setId, p_n: n });
  if (error) throw error;
  if (!data) return null;
  const d = data as { set: ContentSetSummary; items: unknown[] };
  const base = { set: d.set };
  if (d.set.game_type === "matching") return { ...base, game_type: "matching", pairs: d.items as MatchingPair[] };
  if (d.set.game_type === "true_false") return { ...base, game_type: "true_false", questions: d.items as TfQuestion[] };
  return { ...base, game_type: "quiz_race", questions: d.items as QuizQuestion[] };
}

export async function checkContentAnswer(setId: string, itemId: string, answer: string): Promise<AnswerResult | null> {
  const db = await getDb();
  if (!db) {
    const row = demoSet(setId);
    return row ? checkAnswer(row, itemId, answer) : null;
  }
  const svc = await adminDb();
  if (!svc) throw new Error("service role key required");
  const { data, error } = await svc.rpc("check_content_answer", { p_set: setId, p_item: itemId, p_answer: answer });
  if (error) throw error;
  return (data as AnswerResult | null) ?? null;
}

export async function fiftyFifty(setId: string, itemId: string): Promise<string[] | null> {
  const db = await getDb();
  if (!db) {
    const row = demoSet(setId);
    return row ? wrongOptionIds(row, itemId) : null;
  }
  const svc = await adminDb();
  if (!svc) throw new Error("service role key required");
  const { data, error } = await svc.rpc("content_fifty_fifty", { p_set: setId, p_item: itemId });
  if (error) throw error;
  return Array.isArray(data) ? (data as string[]) : null;
}
