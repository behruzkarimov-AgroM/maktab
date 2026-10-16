import { NextResponse, type NextRequest } from "next/server";
import { checkMutation, guard, isNextResponse } from "@/lib/admin/auth";
import { apiError, logError, readJson } from "@/lib/api";
import { GameDraftError, createGameSetFromDraft } from "@/lib/admin/game-content-create";
import type { GameContentDraft } from "@/lib/admin/game-content-types";
import { KIND_RESOURCE } from "@/lib/admin/import/types";
import { SurveyDraftError, createSurveyFromDraft } from "@/lib/admin/surveys-create";
import type { SurveyDraft } from "@/lib/admin/survey-types";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/import/create   { kind: "survey" | "game", draft }
 * Creates a survey / game content set from a reviewed import draft through the shared creators
 * (same zod validation, audit log and demo-store as the admin forms). The record is created inactive unless the draft says otherwise.
 * Quizzes and psych tests are created by the dialog through the regular /api/admin/<resource> endpoints.
 */
export async function POST(req: NextRequest) {
  const bad = checkMutation(req, { maxBytes: 1_500_000 });
  if (bad) return bad;
  const body = await readJson(req, 1_500_000);
  if (!body.ok) return body.res;
  const { kind, draft } = (body.data ?? {}) as { kind?: unknown; draft?: unknown };
  if ((kind !== "survey" && kind !== "game") || !draft || typeof draft !== "object") return apiError("kind_invalid", 400);
  const g = await guard(KIND_RESOURCE[kind], "write");
  if (isNextResponse(g)) return g;
  const limited = await enforceRateLimit(req, { key: "admin-import-create", max: 60, windowSec: 600, identity: g.session.id });
  if (limited) return limited;
  try {
    if (kind === "survey") {
      const out = await createSurveyFromDraft(draft as SurveyDraft, g.session);
      return NextResponse.json({ ok: true, id: out.survey.id, questions: out.questions.length }, { status: 201 });
    }
    const row = await createGameSetFromDraft(draft as GameContentDraft, g.session);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  } catch (e) {
    if (e instanceof SurveyDraftError || e instanceof GameDraftError) {
      return NextResponse.json({ ok: false, error: "validation", issues: e.issues.slice(0, 10) }, { status: 422 });
    }
    logError("admin:import:create", e);
    return apiError("server_error", 500);
  }
}
