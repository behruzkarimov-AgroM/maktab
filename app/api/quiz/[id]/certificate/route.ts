import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, rateLimit } from "@/lib/rate-limit";
import { legacyError, readJson, rejectCrossOrigin } from "@/lib/api";
import { verifyCertToken } from "../../_token";

export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 1_500_000;
const schema = z.object({
  pdf: z.string().min(100).max(2_100_000),
  scorePercent: z.number().min(0).max(100),
  token: z.string().min(10).max(600),
  name: z.string().trim().min(2).max(80),
});

/**
 * Archives a passed-quiz certificate PDF in the `certificates` bucket.
 * No-op (204) in demo mode or without SUPABASE_SERVICE_ROLE_KEY.
 *
 * Checks: same-origin, rate limit, signed attempt token (issued by /submit; binds quiz id + score +
 * normalised student name + one-time nonce, burned here), size limit 1.5MB, %PDF magic bytes,
 * unguessable object path. The bucket has no anon list policy (see schema.sql), so paths cannot be enumerated.
 *
 * REMAINING RISK: the PDF *content* is still rendered client-side, so a holder of a valid token can
 * upload one arbitrary PDF (<=1.5MB) for THEIR OWN passed attempt/name. Eliminating this fully needs
 * server-side PDF generation (jspdf in a route) from the attempt data.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 204 });
  const admin = getAdminClient();
  if (!admin) return new NextResponse(null, { status: 204 });
  const limited = await enforceRateLimit(req, { key: "quiz:cert", max: 3, windowSec: 600 });
  if (limited) return limited;

  const raw = await readJson(req, 2_300_000);
  if (!raw.ok) return raw.res;
  const parsed = schema.safeParse(raw.data);
  if (!parsed.success) return legacyError("invalid", 400);
  const nonce = verifyCertToken(parsed.data.token, id, parsed.data.scorePercent, parsed.data.name);
  if (!nonce) {
    return legacyError("forbidden", 403);
  }
  const bytes = Buffer.from(parsed.data.pdf, "base64");
  if (bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return legacyError("invalid", 400);
  }
  // Single use: a passed attempt can archive exactly one certificate (atomic via rate_limit_hit when DB-backed).
  const burn = await rateLimit(req, { key: "quiz:cert-nonce", max: 1, windowSec: 7200, identity: nonce, failClosed: true });
  if (!burn.allowed) return legacyError("forbidden", 403);
  const path = `quiz/${id}/${crypto.randomUUID()}-${crypto.randomUUID()}.pdf`;
  const { error } = await admin.storage.from("certificates").upload(path, bytes, { contentType: "application/pdf" });
  if (error) return legacyError("server", 500);
  return NextResponse.json({ ok: true, saved: true }, { headers: { "Cache-Control": "no-store" } });
}
