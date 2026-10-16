import { NextResponse } from "next/server";
import { legacyError, readJson, rejectCrossOrigin } from "@/lib/api";
import { getQuizSummary, submitQuiz } from "../../_lib";
import { elapsedSeconds, issueCertToken, startNonceOf } from "../../_token";
import { enforceRateLimit, rateLimit } from "@/lib/rate-limit";
import { submitSchema } from "@/components/quiz/types";

export const dynamic = "force-dynamic";

/** Grace on top of the quiz duration (network latency, auto-submit at time-up). */
const GRACE_SECONDS = 30;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const { id } = await ctx.params;
  if (!/^[\w-]{1,64}$/.test(id)) return legacyError("notFound", 404);
  const limited = await enforceRateLimit(req, { key: "quiz:submit", max: 20, windowSec: 600 });
  if (limited) return limited;
  const raw = await readJson(req, 32 * 1024);
  if (!raw.ok) return raw.res;
  const parsed = submitSchema.safeParse(raw.data);
  if (!parsed.success) return legacyError("invalid", 400);
  try {
    // Server-side clock: the elapsed time comes from the signed start token, not from the client.
    const meta = await getQuizSummary(id);
    if (!meta) return legacyError("notFound", 404);
    const elapsed = elapsedSeconds(parsed.data.startToken, id);
    // one start token may be submitted a few times (network retry) but not farmed for unlimited attempts / stat pollution
    const startNonce = startNonceOf(parsed.data.startToken, id);
    if (startNonce) {
      const burn = await rateLimit(req, { key: "quiz:start-nonce", max: 3, windowSec: 24 * 3600, identity: startNonce });
      if (!burn.allowed) return legacyError("alreadySubmitted", 409);
    }
    const inTime = elapsed !== null && elapsed <= meta.quiz.durationMinutes * 60 + GRACE_SECONDS;
    const res = await submitQuiz(id, { ...parsed.data, seconds: elapsed ?? parsed.data.seconds });
    if (!res) return legacyError("notFound", 404);
    // A certificate token is only issued for an attempt that was started on the server and finished in time.
    const certToken = inTime ? issueCertToken(id, res.scorePercent, res.passed, parsed.data.name) : undefined;
    return NextResponse.json({ result: { ...res, certToken, late: elapsed !== null && !inTime } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return legacyError(e instanceof Error && e.message === "service_role_required" ? "unavailable" : "server", 503);
  }
}
