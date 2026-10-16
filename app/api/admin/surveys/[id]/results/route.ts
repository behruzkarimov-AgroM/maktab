import { NextResponse, type NextRequest } from "next/server";
import { failResponse, guard, isNextResponse, jsonError } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { loadSurveyResults, parseRange } from "@/lib/admin/surveys";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/surveys/:id/results?from=YYYY-MM-DD&to=YYYY-MM-DD[&rows=1]
 * Aggregated statistics (and, with rows=1, the raw responses for CSV / XLSX export; audited as "export").
 * Any staff role may read; responses never contain the respondent token hash.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await guard("surveys", "read");
  if (isNextResponse(g)) return g;
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const range = parseRange(sp.get("from"), sp.get("to"));
  if (!range) return jsonError("Invalid date range", 422);
  const withRows = sp.get("rows") === "1";
  try {
    const out = await loadSurveyResults(id, range, withRows);
    if (!out) return jsonError("Not found", 404);
    if (withRows) await logAudit(g.session, "export", "surveys", id, { responses: out.responses?.length ?? 0, from: sp.get("from"), to: sp.get("to") });
    return NextResponse.json(out);
  } catch (e) {
    return failResponse(e, "admin:survey-results");
  }
}
