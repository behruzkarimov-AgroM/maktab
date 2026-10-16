import { NextResponse, type NextRequest } from "next/server";
import { checkMutation, failResponse, guard, isNextResponse, jsonError } from "@/lib/admin/auth";
import { diffOf, logAudit } from "@/lib/admin/audit";
import { scaleIssuesOnSave } from "@/lib/admin/scale-guard";
import { createMany, createRow, deleteWhere, listRows } from "@/lib/admin/store";
import { buildSchema, normalize } from "@/lib/admin/validation";

type Ctx = { params: Promise<{ resource: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { resource } = await params;
  const g = await guard(resource, "read");
  if (isNextResponse(g)) return g;
  const { res } = g;
  const sp = req.nextUrl.searchParams;
  const filters: Record<string, string> = {};
  const allowed = new Set([...(res.filters ?? []).map((f) => f.name), ...(res.parent ? [res.parent.field] : [])]);
  for (const [k, v] of sp.entries()) if (allowed.has(k)) filters[k] = v;
  try {
    const out = await listRows(res, {
      q: sp.get("q") ?? undefined,
      sort: sp.get("sort") && res.columns.some((c) => c.name === sp.get("sort")) ? sp.get("sort")! : undefined,
      dir: sp.get("dir") === "asc" ? "asc" : sp.get("dir") === "desc" ? "desc" : undefined,
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || undefined,
      all: sp.get("all") === "1",
      filters,
    });
    return NextResponse.json(out);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { resource } = await params;
  const g = await guard(resource, "write");
  if (isNextResponse(g)) return g;
  const { res } = g;
  if (res.canCreate === false || res.singleton) return jsonError("Create is not allowed", 405);
  const bad = checkMutation(req, { maxBytes: MAX_BODY });
  if (bad) return bad;
  let body: unknown;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY) return jsonError("Payload too large", 413);
    body = JSON.parse(text);
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const schema = buildSchema(res, "create");
  // bulk envelope {items:[...]}; resources with their own `items` column (game_content_sets) are never bulk
  const bulk = !res.fields.some((f) => f.name === "items") && body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items);
  const items: unknown[] = bulk ? (body as { items: unknown[] }).items : [body];
  if (items.length > 500) return jsonError("Too many items", 413);
  const parsed: Record<string, unknown>[] = [];
  const virtuals: Record<string, unknown>[] = [];
  for (let idx = 0; idx < items.length; idx++) {
    const r = schema.safeParse(items[idx]);
    if (!r.success) {
      const prefix = bulk ? `items.${idx}.` : "";
      return jsonError("Validation failed", 422, { issues: r.error.issues.map((i) => ({ path: prefix + i.path.join("."), message: i.message })) });
    }
    const d = r.data as Record<string, unknown>;
    virtuals.push({ email: d.email, password: d.password });
    parsed.push(normalize(res, d));
  }
  try {
    if (res.key === "psych_result_scales") {
      for (const d of parsed) {
        const issues = await scaleIssuesOnSave(String(d.psych_test_id), { min: Number(d.min_score), max: Number(d.max_score) });
        if (issues.length) return jsonError("Scale ranges overlap or leave a gap", 422, { issues: [{ path: "min_score", message: "overlap or gap with other scales" }] });
      }
    }
    let rows: Awaited<ReturnType<typeof createRow>>[];
    if (bulk && res.table !== "profiles") {
      rows = await createMany(res, parsed); // single INSERT: all rows or none
    } else {
      rows = [];
      for (let i = 0; i < parsed.length; i++) rows.push(await createRow(res, parsed[i], virtuals[i]));
    }
    for (let i = 0; i < rows.length; i++) await logAudit(g.session, "create", res.key, rows[i].id, bulk ? null : diffOf(null, parsed[i]));
    return NextResponse.json(bulk ? { items: rows } : rows[0], { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

/** DELETE ?<clearBy>=<value>  - bulk clear (leaderboard moderation) */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { resource } = await params;
  const g = await guard(resource, "write");
  if (isNextResponse(g)) return g;
  const { res } = g;
  const bad = checkMutation(req);
  if (bad) return bad;
  if (!res.clearBy) return jsonError("Bulk delete not supported", 405);
  const value = req.nextUrl.searchParams.get(res.clearBy);
  if (!value) return jsonError(`${res.clearBy} required`, 400);
  try {
    const deleted = await deleteWhere(res, res.clearBy, value);
    await logAudit(g.session, "delete", res.key, value, { cleared: deleted, by: res.clearBy });
    return NextResponse.json({ deleted });
  } catch (e) {
    return fail(e);
  }
}

const MAX_BODY = 1_500_000;

function fail(e: unknown) {
  return failResponse(e, "admin:" + "resource");
}
