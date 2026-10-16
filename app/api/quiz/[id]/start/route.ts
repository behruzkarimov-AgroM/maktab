import { NextResponse } from "next/server";
import { legacyError, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { issueStartToken } from "../../_token";

export const dynamic = "force-dynamic";

/** Called when the student presses "start": returns a signed start time used to bound the attempt duration on submit. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const { id } = await ctx.params;
  if (!/^[\w-]{1,64}$/.test(id)) return legacyError("notFound", 404);
  const limited = await enforceRateLimit(req, { key: "quiz:start", max: 60, windowSec: 600, store: "memory" });
  if (limited) return limited;
  return NextResponse.json({ startToken: issueStartToken(id) }, { headers: { "Cache-Control": "no-store" } });
}
