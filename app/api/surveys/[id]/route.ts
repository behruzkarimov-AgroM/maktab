import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPublicSurvey } from "@/lib/surveys/server";

export const dynamic = "force-dynamic";

/** GET /api/surveys/:id: one open survey with its questions (no internals). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, { key: "surveys:get", max: 60, windowSec: 60, store: "memory" });
  if (limited) return limited;
  const { id } = await params;
  const survey = await getPublicSurvey(decodeURIComponent(id));
  if (!survey) return apiError("not_found", 404);
  return apiOk({ survey });
}
