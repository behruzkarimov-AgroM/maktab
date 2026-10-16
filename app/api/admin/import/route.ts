import type { NextRequest } from "next/server";
import { checkMutation, guard, isNextResponse } from "@/lib/admin/auth";
import { apiError, logError } from "@/lib/api";
import { logAudit } from "@/lib/admin/audit";
import { aiAvailable } from "@/lib/admin/import/ai";
import { withImportSlot } from "@/lib/admin/import/limiter";
import { ImportError, importDocument, importZip, isArchive } from "@/lib/admin/import";
import { IMPORT_KINDS, KIND_RESOURCE, MAX_FILE_BYTES, type GameTypeChoice, type ImportKind, type LangChoice } from "@/lib/admin/import/types";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OVERHEAD = 256 * 1024; // multipart boundaries / other fields

/** Reads the request body with a hard size limit, even when Content-Length is missing or lies. */
async function readCapped(req: NextRequest, max: number): Promise<Uint8Array | "too_big" | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return "too_big";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * POST /api/admin/import?kind=quiz|psych   (multipart/form-data: file, lang=uz|ru|en|auto)
 * Returns a PREVIEW draft only. Nothing is written: the dialog creates the records through the normal admin API.
 */
export async function POST(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");
  if (!kind || !(IMPORT_KINDS as string[]).includes(kind)) return apiError("kind_invalid", 400);
  // same permission as creating the target records
  const g = await guard(KIND_RESOURCE[kind as ImportKind], "write");
  if (isNextResponse(g)) return g;
  const bad = checkMutation(req, { json: false });
  if (bad) return bad;
  if (!/^multipart\/form-data;/i.test(req.headers.get("content-type") ?? "")) return apiError("bad_request", 415);

  const limited = await enforceRateLimit(req, { key: "admin-import", max: 40, windowSec: 600, identity: g.session.id });
  if (limited) return limited;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + OVERHEAD) return apiError("file_too_large", 413);

  try {
    const body = await readCapped(req, MAX_FILE_BYTES + OVERHEAD);
    if (body === "too_big") return apiError("file_too_large", 413);
    if (!body) return apiError("bad_request", 400);
    const form = await new Response(body as BodyInit, { headers: { "content-type": req.headers.get("content-type") ?? "" } })
      .formData()
      .catch(() => null);
    if (!form) return apiError("bad_request", 400);
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("file_required", 400);
    if (file.size > MAX_FILE_BYTES) return apiError("file_too_large", 413);
    const langRaw = String(form.get("lang") ?? "auto");
    const lang: LangChoice = langRaw === "uz" || langRaw === "ru" || langRaw === "en" ? langRaw : "auto";
    const gt = String(form.get("game_type") ?? "auto");
    const gameType: GameTypeChoice = gt === "matching" || gt === "true_false" || gt === "quiz_race" ? gt : "auto";
    const filename = (file.name || "document").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const translit = form.get("translit") === "1";
    const wantAi = form.get("ai") === "1";
    if (wantAi) {
      if (!aiAvailable()) return apiError("ai_unavailable", 501);
      const l2 = await enforceRateLimit(req, { key: "admin-import-ai", max: 10, windowSec: 600, identity: g.session.id });
      if (l2) return l2;
    }
    const opts = { translit, ai: wantAi };
    const k = kind as ImportKind;
    const headers = { "Cache-Control": "no-store" };
    if (isArchive(bytes, filename)) {
      const batch = await withImportSlot(() => importZip(bytes, k, lang, gameType, opts));
      if (wantAi) await logAudit(g.session, "import_ai", KIND_RESOURCE[k], null, { kind: k, files: batch.length, source: "zip" });
      return Response.json({ ok: true, batch }, { headers });
    }
    const out = await withImportSlot(() => importDocument(bytes, filename, k, lang, gameType, opts));
    // only the fact that AI was used and how much text left the server is recorded, never the text itself
    if (wantAi) await logAudit(g.session, "import_ai", KIND_RESOURCE[k], null, { kind: k, chars: out.meta.chars, source: "file" });
    return Response.json(out, { headers });
  } catch (e) {
    if (e instanceof ImportError) {
      if (e.data) return Response.json({ ok: false, error: e.code, ...e.data }, { status: e.status, headers: { "Cache-Control": "no-store" } });
      return apiError(e.code, e.status, e.code === "rate_limited" ? { headers: { "Retry-After": "20" } } : {});
    }
    logError("admin:import", e);
    return apiError("server_error", 500);
  }
}
