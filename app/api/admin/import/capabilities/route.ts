import { NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { aiAvailable } from "@/lib/admin/import/ai";
import { ocrEnabled } from "@/lib/admin/import/formats/ocr";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/import/capabilities -> { ai, ocr }: which optional features the server has switched on (no secrets). */
export async function GET() {
  if (!(await getSession())) return apiError("unauthorized", 401);
  return NextResponse.json({ ok: true, ai: aiAvailable(), ocr: ocrEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
