import type { NextRequest } from "next/server";
import { z } from "zod";
import { listSets } from "@/components/games/content-engine";
import { GAME_CONTENT_TYPES } from "@/lib/admin/game-content-types";
import { apiError, apiOk, logError, parseQuery } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({ type: z.enum(GAME_CONTENT_TYPES) });

/** GET /api/games/content/sets?type=matching|true_false|quiz_race: active content sets (summaries only, no items/answers). */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, { key: "games:content:sets", max: 120, windowSec: 60, store: "memory" });
  if (limited) return limited;
  const q = parseQuery(req, schema);
  if (!q.ok) return q.res;
  try {
    return apiOk({ sets: await listSets(q.data.type) });
  } catch (e) {
    logError("games:content:sets", e);
    return apiError("server", 500);
  }
}
