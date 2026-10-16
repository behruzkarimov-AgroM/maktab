import type { NextRequest } from "next/server";
import { apiError, apiOk, isBotSubmission, parseBody, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { submitSurveyResponse, type SubmitErrorCode } from "@/lib/surveys/server";
import { submitSchema } from "@/lib/surveys/validate";

export const dynamic = "force-dynamic";

const STATUS: Record<SubmitErrorCode, number> = {
  invalid_input: 422,
  required_missing: 422,
  invalid_answer: 422,
  not_found: 404,
  survey_closed: 409,
  already_responded: 409,
  unavailable: 503,
  server: 500,
};

/** POST /api/surveys/submit: stores one anonymous response (only a hash of the browser token is kept). */
export async function POST(req: NextRequest) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const limited = await enforceRateLimit(req, { key: "surveys:submit", max: 8, windowSec: 60 });
  if (limited) return limited;
  const body = await parseBody(req, submitSchema, { maxBytes: 24 * 1024 });
  if (!body.ok) return body.res;
  const v = body.data;

  // Honeypot / too-fast fill: pretend success so bots do not adapt.
  if (isBotSubmission(v, { minMs: 1200 })) return apiOk({ stored: false });

  const r = await submitSurveyResponse({ surveyId: v.surveyId, answers: v.answers, token: v.token, roleHint: v.roleHint, grade: v.grade });
  if (!r.ok) return apiError(r.code, STATUS[r.code] ?? 400);
  return apiOk({ stored: true });
}
