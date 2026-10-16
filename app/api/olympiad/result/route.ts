import { legacyError } from "@/lib/api";
import { NextResponse } from "next/server";
import { checkResult } from "../_lib";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TICKET_RE } from "@/components/olympiad/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, { key: "olympiad:check", max: 20, windowSec: 60 });
  if (limited) return limited;
  const ticket = (new URL(req.url).searchParams.get("ticket") ?? "").trim().toUpperCase();
  if (!TICKET_RE.test(ticket)) return legacyError("invalid", 400);
  try {
    const result = await checkResult(ticket);
    // Same response for "unknown ticket" and "results not published" to avoid ticket enumeration.
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return legacyError("server", 500);
  }
}
