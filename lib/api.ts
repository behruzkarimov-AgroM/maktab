import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Shared helpers for API route handlers.
 *
 * Error shape (every non-2xx JSON response):
 *   { "ok": false, "error": "<stable_code>", "message"?: string, "fields"?: string[] }
 * Success bodies are route specific but SHOULD include `ok: true`.
 * No CORS headers are ever emitted (same-origin only).
 */

export type ApiErrorCode =
  | "bad_json"
  | "payload_too_large"
  | "validation"
  | "rate_limited"
  | "forbidden"
  | "not_found"
  | "unsupported"
  | "db"
  | "server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function apiError(
  code: ApiErrorCode | (string & {}),
  status: number,
  opts: { message?: string; fields?: string[]; headers?: Record<string, string> } = {},
): NextResponse {
  const body: Record<string, unknown> = { ok: false, error: code };
  if (opts.message) body.message = opts.message;
  if (opts.fields?.length) body.fields = opts.fields;
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...opts.headers } });
}

/**
 * Same shape as apiError ({ ok:false, error }) for routes whose clients read extra top-level keys (e.g. `fields` as a map).
 * Keeps the stable `error` code and never echoes input.
 */
export function legacyError(code: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, error: code, ...extra }, { status, headers: NO_STORE });
}

export function apiOk<T extends Record<string, unknown>>(data?: T, init?: { status?: number; headers?: Record<string, string> }): NextResponse {
  return NextResponse.json({ ok: true, ...(data ?? {}) }, { status: init?.status ?? 200, headers: { ...NO_STORE, ...init?.headers } });
}

/** Field names that failed validation (never echoes the submitted values). */
export function zodFields(error: z.ZodError): string[] {
  return Object.keys(z.flattenError(error).fieldErrors);
}

/**
 * Best-effort client IP. ONLY headers that the hosting platform sets/overwrites are trusted
 * (x-vercel-forwarded-for, x-real-ip). Client-controllable headers (cf-connecting-ip, the first
 * x-forwarded-for entry) are ignored, otherwise every per-IP rate limit could be bypassed by
 * sending a random value. Max 64 chars.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const raw = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  return raw.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 64) || "unknown";
}

/**
 * Rejects browser requests coming from a different origin (CSRF / abuse from other sites).
 * Requests without an Origin header (curl, server-to-server, same-origin GET) pass.
 */
export function rejectCrossOrigin(req: Request): NextResponse | null {
  // Fetch Metadata (sent by every modern browser, cannot be forged by page scripts): a request that the browser itself
  // classifies as cross-site / same-site-other-origin is refused even when no Origin header is present.
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return apiError("forbidden", 403);
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    // fallthrough
  }
  return apiError("forbidden", 403);
}

export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; res: NextResponse };

/** Reads and parses a JSON body with a hard size limit (also enforced when Content-Length lies). */
export async function readJson(req: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<ParseResult<unknown>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, res: apiError("payload_too_large", 413) };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, res: apiError("bad_json", 400) };
  }
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, res: apiError("payload_too_large", 413) };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, res: apiError("bad_json", 400) };
  }
}

/** readJson + zod validation. On failure `res` is a ready-to-return error response. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  opts: { maxBytes?: number } = {},
): Promise<ParseResult<z.output<S>>> {
  const body = await readJson(req, opts.maxBytes);
  if (!body.ok) return body;
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) return { ok: false, res: apiError("validation", 422, { fields: zodFields(parsed.error) }) };
  return { ok: true, data: parsed.data };
}

/** Parses URL search params with a zod schema (all values arrive as strings). */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): ParseResult<z.output<S>> {
  const obj: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) return { ok: false, res: apiError("validation", 422, { fields: zodFields(parsed.error) }) };
  return { ok: true, data: parsed.data };
}

/* ------------------------------------------------------------------ */
/* Bot traps                                                           */
/* ------------------------------------------------------------------ */

export type TrapOptions = {
  /** Hidden input that humans leave empty. Default "website". */
  honeypotField?: string;
  /** Field holding Date.now() captured when the form was rendered. Default "formStartedAt". */
  startedAtField?: string;
  /** Minimum plausible fill time. Default 1500 ms. Only enforced if the client sends the timestamp. */
  minMs?: number;
  /** Maximum plausible age of the form (stale/replayed). Default 24 h. */
  maxAgeMs?: number;
  /** Treat a missing/invalid timestamp as a bot (default false). */
  requireTimestamp?: boolean;
};

/**
 * Returns true when a submission looks automated: filled honeypot, or submitted faster than a
 * human could (time trap). Callers should respond with a fake success so bots do not adapt.
 */
export function isBotSubmission(body: unknown, opts: TrapOptions = {}): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  const hp = o[opts.honeypotField ?? "website"];
  if (typeof hp === "string" && hp.trim() !== "") return true;
  const ts = Number(o[opts.startedAtField ?? "formStartedAt"]);
  if (Number.isFinite(ts) && ts > 0) {
    const age = Date.now() - ts;
    if (age < (opts.minMs ?? 1500)) return true;
    if (age > (opts.maxAgeMs ?? 24 * 3600 * 1000)) return true;
  } else if (opts.requireTimestamp) {
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Logging without PII                                                 */
/* ------------------------------------------------------------------ */

/** Logs a tag plus the error class/code only. Never pass request bodies or rows here. */
export function logError(tag: string, err: unknown): void {
  const e = err as { name?: string; code?: string; message?: string } | null;
  const code = e?.code ? ` code=${e.code}` : "";
  // message may contain DB detail strings but never user input for supabase-js/postgres errors we use
  const msg = typeof e?.message === "string" ? e.message.slice(0, 160).replace(/\+?\d[\d\s()-]{6,}\d/g, "[num]") : "";
  console.error(`[${tag}] ${e?.name ?? "Error"}${code} ${msg}`.trim());
}
