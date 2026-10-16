import type { NextRequest } from "next/server";
import { z } from "zod";
import { checkContentAnswer, fiftyFifty } from "@/components/games/content-engine";
import { apiError, apiOk, logError, parseBody, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit, rateLimit } from "@/lib/rate-limit";
import { verifyToken } from "@/lib/signed-token";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(10).max(600),
  item_id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  /** "true" | "false" (true_false) or an option id (quiz_race); "" = no answer / timed out. Omit when asking for a hint. */
  answer: z.string().max(40).optional(),
  hint: z.literal("fifty").optional(),
});

const MAX_AGE_MS = 2 * 3600 * 1000;

/**
 * POST /api/games/content/answer { token, item_id, answer } -> { correct, explanation, correct_option_id? }
 *      POST ... { token, item_id, hint: "fifty" }           -> { remove: [optionId, optionId] }   (once per round)
 * The token (from /round) proves the item belongs to a round of this set; every item can be answered ONCE.
 */
export async function POST(req: NextRequest) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const limited = await enforceRateLimit(req, { key: "games:content:answer", max: 240, windowSec: 60, store: "memory" });
  if (limited) return limited;
  const body = await parseBody(req, schema, { maxBytes: 1024 });
  if (!body.ok) return body.res;
  const v = body.data;

  const t = verifyToken<{ s: string; g: string; ids: string[]; t: number; n: string }>("content", v.token);
  const age = t ? Date.now() - Number(t.t) : -1;
  if (!t || !Array.isArray(t.ids) || !t.ids.includes(v.item_id) || !(age >= 0) || age > MAX_AGE_MS) return apiError("invalid_session", 403);
  if (v.hint === undefined && v.answer === undefined) return apiError("validation", 400);

  // burn: one answer per item per round; one 50/50 per round
  const burn = await rateLimit(req, {
    key: v.hint ? "games:content:hint" : "games:content:item",
    max: 1,
    windowSec: 7200,
    failClosed: true,
    identity: v.hint ? String(t.n) : `${t.n}:${v.item_id}`,
  });
  if (!burn.allowed) return apiError("already_answered", 409);

  try {
    if (v.hint) {
      const remove = await fiftyFifty(t.s, v.item_id);
      return remove ? apiOk({ remove }) : apiError("not_found", 404);
    }
    const res = await checkContentAnswer(t.s, v.item_id, v.answer ?? "");
    return res ? apiOk({ ...res }) : apiError("not_found", 404);
  } catch (e) {
    logError("games:content:answer", e);
    return apiError("server", 500);
  }
}
