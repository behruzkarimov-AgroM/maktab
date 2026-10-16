import type { NextRequest } from "next/server";
import { z } from "zod";
import { GAME_SLUGS } from "@/components/games/types";
import type { LeaderboardEntry } from "@/components/games/types";
import { apiError, apiOk, logError, parseBody, parseQuery, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit, rateLimit } from "@/lib/rate-limit";
import { GAME_DEFAULTS } from "@/components/games/defaults";
import { checkGameScore } from "@/lib/game-score";
import { verifyToken } from "@/lib/signed-token";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { demoAdd, demoList } from "./store";

export const dynamic = "force-dynamic";

const slugSchema = z.enum(GAME_SLUGS);
const diffSchema = z.enum(["easy", "medium", "hard"]);

const postSchema = z.object({
  game: slugSchema,
  difficulty: diffSchema,
  player_name: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[^<>{}\u0000-\u001f\u007f]+$/, "invalid characters"),
  student_grade: z.number().int().min(1).max(11).nullable().optional(),
  score: z.number().int().min(0).max(100000),
  completion_time_ms: z.number().int().min(300).max(3_600_000),
  accuracy_percent: z.number().min(0).max(100),
  /** Signed run token from POST /api/games/session. */
  session: z.string().min(10).max(600),
});

const SESSION_MAX_AGE_MS = 2 * 3600 * 1000;
const TIME_SLACK_MS = 3000;

const getSchema = z.object({
  game: slugSchema,
  difficulty: diffSchema.optional().catch(undefined),
  limit: z.coerce.number().int().catch(10).transform((n) => Math.min(50, Math.max(1, n))),
});

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, { key: "games:get", max: 120, windowSec: 60, store: "memory" });
  if (limited) return limited;
  const q = parseQuery(req, getSchema);
  if (!q.ok) return q.res;
  const { game, difficulty, limit } = q.data;

  if (!isSupabaseConfigured()) {
    return apiOk({ entries: demoList(game, difficulty, limit), demo: true });
  }
  try {
    const db = await getServerClient();
    if (!db) return apiOk({ entries: demoList(game, difficulty, limit), demo: true });
    const { data, error } = await db.rpc("get_leaderboard", {
      p_game_slug: game,
      p_difficulty: difficulty ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    const entries: LeaderboardEntry[] = (data ?? []).map((r) => ({
      id: r.id,
      player_name: r.player_name,
      student_grade: r.student_grade,
      difficulty: r.difficulty,
      score: r.score,
      completion_time_ms: r.completion_time_ms ?? 0,
      accuracy_percent: Number(r.accuracy_percent ?? 0),
      created_at: r.created_at,
    }));
    return apiOk({ entries, demo: false });
  } catch (e) {
    logError("games:get", e);
    return apiError("server", 500);
  }
}

export async function POST(req: NextRequest) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const limited = await enforceRateLimit(req, { key: "games:post", max: 8, windowSec: 60 });
  if (limited) return limited;
  const body = await parseBody(req, postSchema, { maxBytes: 2048 });
  if (!body.ok) return body.res;
  const v = body.data;
  const accuracy = Math.round(v.accuracy_percent * 100) / 100;

  // The run must have been started on the server: bounds the claimed time by real elapsed time and
  // allows exactly one submission per run.
  const sess = verifyToken<{ g: string; d: string; t: number; n: string }>("game", v.session);
  const elapsed = sess ? Date.now() - Number(sess.t) : -1;
  if (!sess || sess.g !== v.game || sess.d !== v.difficulty || !(elapsed >= 0) || elapsed > SESSION_MAX_AGE_MS || v.completion_time_ms > elapsed + TIME_SLACK_MS) {
    return apiError("invalid_session", 403);
  }
  // config of this difficulty (multiplier / time limit) bounds the believable score; DB value when available, else the defaults
  let dcfg: { multiplier?: number; time_limit?: number } | undefined = GAME_DEFAULTS.find((g) => g.slug === v.game)?.config[v.difficulty];
  let dbGameId: string | null = null;
  if (isSupabaseConfigured()) {
    const adminDb = getAdminClient();
    if (!adminDb) return apiError("unavailable", 503);
    try {
      const { data: g0, error: e0 } = await adminDb.from("brain_games").select("id,config").eq("game_slug", v.game).eq("is_active", true).maybeSingle();
      if (e0) throw e0;
      if (!g0) return apiError("not_found", 404);
      dbGameId = g0.id;
      const c = (g0.config as Record<string, { multiplier?: number; time_limit?: number }> | null)?.[v.difficulty];
      if (c && typeof c === "object") dcfg = { multiplier: Number(c.multiplier), time_limit: Number(c.time_limit) };
    } catch (e) {
      logError("games:post", e);
      return apiError("server", 500);
    }
  }
  const plausible = checkGameScore(v.game, { score: v.score, elapsedMs: elapsed, completionMs: v.completion_time_ms, multiplier: dcfg?.multiplier ?? 1, timeLimitSec: dcfg?.time_limit });
  if (!plausible.ok) return apiError("implausible_score", 422);
  const burn = await rateLimit(req, { key: "games:nonce", max: 1, windowSec: 7200, identity: String(sess.n), failClosed: true });
  if (!burn.allowed) return apiError("invalid_session", 403);

  if (!isSupabaseConfigured()) {
    demoAdd({
      game_slug: v.game,
      player_name: v.player_name,
      student_grade: v.student_grade ?? null,
      difficulty: v.difficulty,
      score: v.score,
      completion_time_ms: v.completion_time_ms,
      accuracy_percent: accuracy,
    });
    return apiOk({ demo: true }, { status: 201 });
  }
  try {
    // Public INSERT policies were removed: writes go through this validated, rate-limited route.
    const db = getAdminClient();
    if (!db) return apiError("unavailable", 503);
    if (!dbGameId) return apiError("not_found", 404);
    const { error } = await db.from("game_leaderboard").insert({
      game_id: dbGameId,
      player_name: v.player_name,
      student_grade: v.student_grade ?? null,
      difficulty: v.difficulty,
      score: v.score,
      completion_time_ms: v.completion_time_ms,
      accuracy_percent: accuracy,
    });
    if (error) {
      logError("games:post", error);
      return apiError("db", 400);
    }
    return apiOk({ demo: false }, { status: 201 });
  } catch (e) {
    logError("games:post", e);
    return apiError("server", 500);
  }
}