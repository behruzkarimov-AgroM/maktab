import type { NextRequest } from "next/server";
import { z } from "zod";
import { GAME_SLUGS } from "@/components/games/types";
import { apiOk, parseBody, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { newNonce, signToken } from "@/lib/signed-token";

export const dynamic = "force-dynamic";

const schema = z.object({ game: z.enum(GAME_SLUGS), difficulty: z.enum(["easy", "medium", "hard"]) });

/**
 * Called when a game run starts. Returns a signed token binding game + difficulty + start time.
 * POST /api/games/leaderboard requires it, caps the claimed completion time by the real elapsed time
 * and burns the nonce (one score per run).
 */
export async function POST(req: NextRequest) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const limited = await enforceRateLimit(req, { key: "games:session", max: 40, windowSec: 60, store: "memory" });
  if (limited) return limited;
  const body = await parseBody(req, schema, { maxBytes: 512 });
  if (!body.ok) return body.res;
  const token = signToken("game", { g: body.data.game, d: body.data.difficulty, t: Date.now(), n: newNonce() });
  return apiOk({ token });
}
