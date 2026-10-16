import { NextResponse, type NextRequest } from "next/server";
import { checkMutation, getSession, jsonError } from "@/lib/admin/auth";
import { getServiceClient, getUserClient, isConfigured } from "@/lib/admin/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";

const BUCKETS = new Set(["school-media", "test-assets", "certificates"]);
const MAX = 8 * 1024 * 1024;
/** buckets each role may upload to (mirrors who can edit the resources that use them) */
const ROLE_BUCKETS: Record<string, string[]> = {
  super_admin: ["school-media", "test-assets", "certificates"],
  methodist: ["school-media", "test-assets", "certificates"],
  psychologist: ["test-assets"],
};

/** Detects the real type from magic bytes; the client-declared type is never trusted. */
function sniff(b: Uint8Array): { type: string; ext: string } | null {
  const s = (i: number, str: string) => str.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && s(1, "PNG")) return { type: "image/png", ext: "png" };
  if (s(0, "GIF87a") || s(0, "GIF89a")) return { type: "image/gif", ext: "gif" };
  if (s(0, "RIFF") && s(8, "WEBP")) return { type: "image/webp", ext: "webp" };
  if (s(0, "%PDF-")) return { type: "application/pdf", ext: "pdf" };
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  const bad = checkMutation(req, { json: false });
  if (bad) return bad;
  if (!isConfigured()) return jsonError("Uploads need Supabase Storage (demo mode uses local object URLs)", 501);
  if (!/^multipart\/form-data;/i.test(req.headers.get("content-type") ?? "")) return jsonError("Content-Type must be multipart/form-data", 415);
  // refuse oversized bodies before they are buffered (Content-Length is checked first, the streamed size is capped as well)
  const declared = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0 || declared > MAX + 64 * 1024) return jsonError("File too large (max 8 MB)", 413);
  const limited = await enforceRateLimit(req, { key: "admin:upload", max: 60, windowSec: 600, identity: session.id });
  if (limited) return jsonError("Too many uploads", 429, { code: "rate_limited" });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const bucket = String(form?.get("bucket") ?? "school-media");
  if (!(file instanceof File)) return jsonError("file required", 400);
  if (!BUCKETS.has(bucket)) return jsonError("invalid bucket", 400);
  if (!(ROLE_BUCKETS[session.role] ?? []).includes(bucket)) return jsonError("Forbidden", 403);
  if (file.size > MAX) return jsonError("File too large (max 8 MB)", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return jsonError("Unsupported file type", 415);
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${kind.ext}`;
  const client = getServiceClient() ?? (await getUserClient());
  const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType: kind.type, upsert: false });
  if (error) {
    console.error("[admin:upload]", error.message.slice(0, 200));
    return jsonError("upload_failed", 400);
  }
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
