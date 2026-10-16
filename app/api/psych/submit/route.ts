import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDemoTest } from "@/components/psych/demo";
import { scoreDemo } from "@/components/psych/score";
import { adminDemoPsychTest } from "@/lib/admin/demo-bridge";
import { toLoc } from "@/components/psych/data";
import type { PsychResult } from "@/components/psych/types";
import { apiError, apiOk, logError, parseBody, rejectCrossOrigin } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { PsychSubmitResult } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const schema = z.object({
  testId: z.string().min(1).max(64),
  answers: z
    .record(z.string().min(1).max(64), z.string().min(1).max(64))
    .refine((a) => Object.keys(a).length > 0 && Object.keys(a).length <= 100),
  studentName: z.string().trim().max(60).optional(),
  studentAge: z.number().int().min(3).max(99).optional(),
  parentPhone: z.string().trim().max(24).regex(/^[+\d\s()-]*$/).optional(),
});

function toResult(data: PsychSubmitResult): PsychResult | null {
  const scale = data.scale;
  if (!scale) return null;
  return {
    total_score: Number(data.total_score ?? 0),
    title: toLoc(scale.result_title),
    analysis: toLoc(scale.psychological_analysis),
    recommendations: toLoc(scale.recommendations_for_parents),
    badge_color: String(scale.badge_color ?? "blue"),
  };
}

export async function POST(req: NextRequest) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const limited = await enforceRateLimit(req, { key: "psych:submit", max: 12, windowSec: 60 });
  if (limited) return limited;
  const body = await parseBody(req, schema, { maxBytes: 8 * 1024 });
  if (!body.ok) return body.res;
  const v = body.data;

  // Built-in demo tests are always scored locally (works without Supabase).
  const demo = getDemoTest(v.testId) ?? (!isSupabaseConfigured() ? adminDemoPsychTest(v.testId) : undefined);
  if (demo) {
    const result = scoreDemo(demo, v.answers);
    if (!result) return apiError("incomplete_answers", 400);
    return apiOk({ result, demo: true });
  }

  if (!isSupabaseConfigured()) return apiError("test_not_found", 404);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.testId)) return apiError("test_not_found", 404);
  try {
    // service role only: anon EXECUTE on submit_psych_test is revoked (docs/AUDIT-SCHEMA-REQUESTS.md)
    const db = getAdminClient();
    if (!db) return apiError("unavailable", 503);
    const { data, error } = await db.rpc("submit_psych_test", {
      p_test_id: v.testId,
      p_answers: v.answers,
      p_student_name: v.studentName || null,
      p_student_age: v.studentAge ?? null,
      p_parent_phone: v.parentPhone || null,
    });
    if (error) {
      const m = error.message ?? "";
      if (m.includes("not_found")) return apiError("test_not_found", 404);
      if (m.includes("incomplete_answers")) return apiError("incomplete_answers", 400);
      if (m.includes("no_matching_scale")) return apiError("no_matching_scale", 422);
      if (m.includes("invalid_input")) return apiError("validation", 422);
      if (error.code === "23503") return apiError("conflict", 409);
      logError("psych:submit", error);
      return apiError("db", 400);
    }
    const result = data ? toResult(data) : null;
    if (!result) return apiError("no_matching_scale", 422);
    return apiOk({ result, demo: false });
  } catch (e) {
    logError("psych:submit", e);
    return apiError("server", 500);
  }
}