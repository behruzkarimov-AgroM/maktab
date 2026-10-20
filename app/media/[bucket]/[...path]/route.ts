import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { localEnabled, PUBLIC_BUCKETS } from "@/lib/localdb/server";

/**
 * GET /media/<bucket>/<path> : files uploaded in self-hosted mode (UPLOAD_DIR), the stand-in for Supabase Storage public URLs.
 * Only the public buckets are served; file names are random UUIDs, so responses are cached for a year.
 */
const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", pdf: "application/pdf",
};

export async function GET(_req: Request, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await ctx.params;
  const root = process.env.UPLOAD_DIR;
  const ext = path.at(-1)?.split(".").pop()?.toLowerCase() ?? "";
  if (!localEnabled() || !root || !PUBLIC_BUCKETS.includes(bucket) || !TYPES[ext] || path.some((s) => !/^[\w.-]+$/.test(s) || s.startsWith("."))) {
    return new Response("Not found", { status: 404 });
  }
  const full = resolve(root, bucket, ...path);
  if (!full.startsWith(resolve(root, bucket) + sep)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(full);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
