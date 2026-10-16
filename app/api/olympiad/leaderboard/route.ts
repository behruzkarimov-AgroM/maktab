import { legacyError } from "@/lib/api";
import { NextResponse } from "next/server";
import { leaderboard } from "../_lib";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, { key: "olympiad:board", max: 30, windowSec: 60, store: "memory" });
  if (limited) return limited;
  const id = new URL(req.url).searchParams.get("olympiad") ?? "";
  if (!/^[\w-]{1,64}$/.test(id)) return legacyError("invalid", 400);
  try {
    return NextResponse.json({ groups: await leaderboard(id) }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return legacyError("server", 500);
  }
}
