import { createHash } from "node:crypto";
import type { NextResponse } from "next/server";
import { apiError, clientIp, logError } from "@/lib/api";
import { botRequest } from "@/lib/bot-auth";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * One rate limiter for every route.
 *
 *   const limited = await enforceRateLimit(req, { key: "applications", max: 5, windowSec: 600 });
 *   if (limited) return limited;
 *
 * Backend: public.rate_limit_hit() through the service-role client when Supabase is configured
 * (shared across serverless instances), otherwise (or on any DB error) an in-memory fixed window.
 * Keys are `<key>:<sha256(ip)>`: raw IPs are never stored.
 */

export type RateLimitOptions = {
  /** Namespace, e.g. "applications" or "games:post". */
  key: string;
  max: number;
  windowSec: number;
  /** Override the identity part (default: client IP). */
  identity?: string;
  /** "memory" skips the DB round trip (use for cheap read endpoints). Default "auto". */
  store?: "auto" | "memory";
  /**
   * For single-use nonce burns and credential endpoints: when the shared (DB) store is configured but errors, DENY instead of
   * falling back to the per-instance memory counter (which cannot stop replays across serverless instances).
   * Low-risk read endpoints leave this unset (fail-open to the memory window).
   */
  failClosed?: boolean;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  store: "db" | "memory";
};

type Bucket = { start: number; count: number; windowMs: number };
const g = globalThis as unknown as { __rl?: Map<string, Bucket> };
const memory: Map<string, Bucket> = (g.__rl ??= new Map());

/** Drops expired buckets (each bucket remembers its own window length); if still huge, evicts the oldest half (never clear-all). */
function sweepMemory(now: number): void {
  for (const [k, v] of memory) if (v.start + v.windowMs <= now) memory.delete(k);
  if (memory.size > 20000) {
    let drop = memory.size - 10000;
    for (const k of memory.keys()) {
      if (drop-- <= 0) break;
      memory.delete(k);
    }
  }
}
/** test hook */
export function __memorySize(): number {
  return memory.size;
}
export function __resetMemory(): void {
  memory.clear();
}

function memoryHit(key: string, max: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  const b = memory.get(key);
  const cur: Bucket = b && b.start === start ? b : { start, count: 0, windowMs };
  cur.count += 1;
  memory.set(key, cur);
  if (memory.size > 5000) sweepMemory(now);
  return {
    allowed: cur.count <= max,
    remaining: Math.max(0, max - cur.count),
    retryAfterSec: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
    store: "memory",
  };
}

export async function rateLimit(req: Request, opts: RateLimitOptions): Promise<RateLimitResult> {
  // all bot traffic comes from one server IP: a verified bot request is limited per Telegram chat instead
  const bot = opts.identity ? null : botRequest(req);
  const who = opts.identity ?? (bot ? `tg:${bot.chatId}` : clientIp(req));
  const key = `${opts.key}:${createHash("sha256").update(who).digest("hex").slice(0, 32)}`.slice(0, 200);
  const retryAfterSec = Math.max(1, Math.min(opts.windowSec, 86400));

  const db = opts.store === "memory" ? null : getAdminClient();
  if (db) {
    try {
      const { data, error } = await db.rpc("rate_limit_hit", { key, max: opts.max, window_seconds: opts.windowSec });
      if (!error && typeof data === "boolean") {
        return { allowed: data, remaining: data ? -1 : 0, retryAfterSec, store: "db" };
      }
      if (error) logError("rate-limit", error);
    } catch (e) {
      logError("rate-limit", e);
    }
    if (opts.failClosed) return { allowed: false, remaining: 0, retryAfterSec: Math.min(retryAfterSec, 30), store: "db" };
  }
  return memoryHit(key, opts.max, opts.windowSec);
}

/** Returns a 429 response (with Retry-After) when the caller is over the limit, otherwise null. */
export async function enforceRateLimit(req: Request, opts: RateLimitOptions): Promise<NextResponse | null> {
  const r = await rateLimit(req, opts);
  if (r.allowed) return null;
  return apiError("rate_limited", 429, { headers: { "Retry-After": String(r.retryAfterSec) } });
}
