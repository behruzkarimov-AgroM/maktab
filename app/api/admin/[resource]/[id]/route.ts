import { NextResponse, type NextRequest } from "next/server";
import { checkMutation, failResponse, guard, isNextResponse, jsonError } from "@/lib/admin/auth";
import { diffOf, logAudit } from "@/lib/admin/audit";
import { canDeleteRow } from "@/lib/admin/resources";
import { scaleIssuesForActivation, scaleIssuesOnSave } from "@/lib/admin/scale-guard";
import { deleteRow, getRow, updateRow } from "@/lib/admin/store";
import { buildSchema, normalize } from "@/lib/admin/validation";

type Ctx = { params: Promise<{ resource: string; id: string }> };

/** ids are uuids / small ints / slugs: anything else can never exist (and must not reach the query builder) */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { resource, id } = await params;
  const g = await guard(resource, "read");
  if (isNextResponse(g)) return g;
  if (!SAFE_ID.test(id)) return jsonError("Not found", 404);
  try {
    const row = await getRow(g.res, id);
    return row ? NextResponse.json(row) : jsonError("Not found", 404);
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { resource, id } = await params;
  const g = await guard(resource, "write");
  if (isNextResponse(g)) return g;
  const { res, session } = g;
  if (!SAFE_ID.test(id)) return jsonError("Not found", 404);
  if (res.canEdit === false && !res.activeField) return jsonError("Edit is not allowed", 405);
  const bad = checkMutation(req, { maxBytes: 1_500_000 });
  if (bad) return bad;
  let body: unknown;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > 1_500_000) return jsonError("Payload too large", 413);
    body = JSON.parse(text);
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const r = buildSchema(res, "update").safeParse(body);
  if (!r.success) return jsonError("Validation failed", 422, { issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  const data = normalize(res, r.data as Record<string, unknown>);
  if (res.canEdit === false) {
    // only the active toggle may change
    for (const k of Object.keys(data)) if (k !== res.activeField) delete data[k];
  }
  // a user must not lock themselves out or demote themselves
  if (res.table === "profiles" && id === session.id && (data.is_active === false || (data.role && data.role !== "super_admin"))) {
    return jsonError("You cannot deactivate or demote your own account", 409);
  }
  try {
    const b0 = await getRow(res, id).catch(() => null);
    const before = b0 ? (JSON.parse(JSON.stringify(b0)) as Record<string, unknown>) : null; // demo store mutates rows in place
    if (res.table === "olympiad_registrations") {
      // validate against the merged row, so patching only score (or only max_score) cannot bypass the check
      const score = "score" in data ? data.score : before?.score;
      const max = "max_score" in data ? data.max_score : before?.max_score;
      if (typeof score === "number" && typeof max === "number" && score > max) return jsonError("score must not exceed max_score", 422);
    }
    if (res.key === "psych_result_scales" && ("min_score" in data || "max_score" in data)) {
      const min = Number("min_score" in data ? data.min_score : before?.min_score);
      const max = Number("max_score" in data ? data.max_score : before?.max_score);
      const issues = await scaleIssuesOnSave(String(before?.psych_test_id), { id, min, max });
      if (issues.length) return jsonError("Scale ranges overlap or leave a gap", 422, { issues: [{ path: "min_score", message: "overlap or gap with other scales" }] });
    }
    if (res.key === "psych_tests" && data.is_active === true && before && before.is_active !== true) {
      const issues = await scaleIssuesForActivation(id);
      if (issues.length) return jsonError("Result scales must cover the whole score range before activating", 422, { issues: [{ path: "is_active", message: "scales have gaps or overlaps" }] });
    }
    const row = await updateRow(res, id, data);
    if (row) await logAudit(session, "update", res.key, id, diffOf(before, data));
    return row ? NextResponse.json(row) : jsonError("Not found", 404);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { resource, id } = await params;
  const g = await guard(resource, "write");
  if (isNextResponse(g)) return g;
  const { res, session } = g;
  if (!SAFE_ID.test(id)) return jsonError("Not found", 404);
  if (res.canDelete === false || res.singleton) return jsonError("Delete is not allowed", 405);
  const bad = checkMutation(_req);
  if (bad) return bad;
  if (!canDeleteRow(res, session.role)) return jsonError("Forbidden", 403);
  if (res.table === "profiles" && id === session.id) return jsonError("You cannot delete your own account", 409);
  try {
    const ok = await deleteRow(res, id);
    if (ok) await logAudit(session, "delete", res.key, id);
    return ok ? NextResponse.json({ ok: true }) : jsonError("Not found", 404);
  } catch (e) {
    return fail(e);
  }
}

function fail(e: unknown) {
  return failResponse(e, "admin:id");
}
