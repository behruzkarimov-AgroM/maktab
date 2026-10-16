import type { NextRequest } from "next/server";
import { apiOk } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { listPublicSurveys } from "@/lib/surveys/server";

export const dynamic = "force-dynamic";

/** GET /api/surveys: open surveys (active and inside their date window), without questions. */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, { key: "surveys:list", max: 60, windowSec: 60, store: "memory" });
  if (limited) return limited;
  return apiOk({ surveys: await listPublicSurveys() });
}
