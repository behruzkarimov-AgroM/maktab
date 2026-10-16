import type { NextRequest } from "next/server";
import { z } from "zod";
import { MAX_ROUND_ITEMS } from "@/components/games/content-core";
import { startRound } from "@/components/games/content-engine";
import { apiError, apiOk, logError, parseBody, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { newNonce, signToken } from "@/lib/signed-token";

export const dynamic = "force-dynamic";

const schema = z.object({
  set_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  n: z.number().int().min(1).max(MAX_ROUND_ITEMS),
});

/**
 * POST /api/games/content/round { set_id, n }
 * Draws `n` random items from a set. true_false / quiz_race rounds contain NO answers and come with a signed token
 * (set + item ids + start time); answers are checked one by one via POST /api/games/content/answer.
 * Matching rounds ship both sides of each pair: that is inherent to a memory/connect game.
 */
export async function POST(req: NextRequest) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const limited = await enforceRateLimit(req, { key: "games:content:round", max: 40, windowSec: 60, store: "memory" });
  if (limited) return limited;
  const body = await parseBody(req, schema, { maxBytes: 512 });
  if (!body.ok) return body.res;
  try {
    const round = await startRound(body.data.set_id, body.data.n);
    if (!round) return apiError("not_found", 404);
    if (round.game_type === "matching") return apiOk({ round });
    const ids = round.questions.map((q) => q.id);
    const token = signToken("content", { s: round.set.id, g: round.game_type, ids, t: Date.now(), n: newNonce() });
    return apiOk({ round: { ...round, token } });
  } catch (e) {
    logError("games:content:round", e);
    return apiError("not_found", 404);
  }
}
