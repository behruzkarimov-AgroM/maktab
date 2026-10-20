// Route wrapper for /api/school/**: CSRF + content-type for non-GET, rate limit, session + role check, zod parsing,
// stable error codes (never raw errors). See docs/SIS.md for the response contract: { ok:true, ... } | { ok:false, error, fields? }.
import { NextResponse } from "next/server";
import type { z } from "zod";
import { apiError, apiOk, logError, parseBody, parseQuery, rejectCrossOrigin } from "@/lib/api";
import { botRequest } from "@/lib/bot-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { userForChat } from "@/lib/telegram-links";
import { getSchoolSession, sessionForUserId } from "./auth";
import { isSchoolError, SchoolError } from "./errors";
import { loadCtx, type Ctx } from "./svc-core";
import type { SchoolRole, SchoolSession } from "./types";

export class ResponseError extends Error {
  constructor(readonly res: NextResponse) {
    super("response");
    this.name = "ResponseError";
  }
}

export interface HandlerArgs {
  c: Ctx;
  s: SchoolSession;
  req: Request;
  params: Record<string, string>;
}
export type HandlerResult = Record<string, unknown> | NextResponse | void;

export interface ApiOptions {
  /** allowed roles; omitted = any signed-in school role */
  roles?: SchoolRole[];
  /** true for POST/PUT/PATCH/DELETE: enforces same-origin and application/json (unless `json:false`) */
  mutate?: boolean;
  /** set false for multipart uploads */
  json?: boolean;
  /** per-user rate limit (default 300/min reads, 120/min writes) */
  rate?: { max: number; windowSec: number };
  /** load context for another school year */
  yearIdParam?: string;
  /** separate rate-limit bucket name (default `school:r` / `school:w`); use it whenever `rate` differs from the default */
  rateKey?: string;
  /** true for the few endpoints an account with a temporary password may call (/me, change-password); all others answer 403 password_change_required */
  allowMustChange?: boolean;
}

const READ_LIMIT = { max: 300, windowSec: 60 };
const WRITE_LIMIT = { max: 120, windowSec: 60 };

export function api(opts: ApiOptions, handler: (a: HandlerArgs) => Promise<HandlerResult>) {
  return async (req: Request, routeCtx?: { params: Promise<Record<string, string>> }): Promise<NextResponse> => {
    try {
      if (opts.mutate) {
        if (rejectCrossOrigin(req)) return apiError("forbidden", 403);
        if (opts.json !== false) {
          const ct = req.headers.get("content-type") ?? "";
          const hasBody = req.method !== "DELETE" || Number(req.headers.get("content-length") ?? 0) > 0;
          if (hasBody && !/^application\/json/i.test(ct)) return apiError("unsupported", 415);
        }
      }
      // a verified Telegram bot request acts as the portal user linked to its chat; everything below (roles, temp-password lock,
      // rate limit, scoping, audit) applies to it exactly as to a cookie session
      const bot = botRequest(req);
      const s = bot ? await botSession(bot.chatId) : await getSchoolSession();
      if (!s) return apiError(bot ? "not_linked" : "unauthorized", 401);
      if (s.mustChangePassword && !opts.allowMustChange) return apiError("password_change_required", 403);
      if (opts.roles && !opts.roles.includes(s.role)) return apiError("forbidden", 403);
      const limit = opts.rate ?? (opts.mutate ? WRITE_LIMIT : READ_LIMIT);
      const limited = await enforceRateLimit(req, {
        key: opts.rateKey ?? `school:${opts.mutate ? "w" : "r"}`, identity: s.id, store: opts.mutate ? "auto" : "memory", ...limit,
      });
      if (limited) return limited;
      const c = await loadCtx(s);
      const params = routeCtx?.params ? await routeCtx.params : {};
      const out = await handler({ c, s, req, params });
      if (out instanceof NextResponse) return out;
      return apiOk(out ?? {});
    } catch (e) {
      return failResponse(e);
    }
  };
}

/** session of the portal user linked to a Telegram chat (null: not linked, or the account is no longer active) */
async function botSession(chatId: string): Promise<SchoolSession | null> {
  const userId = await userForChat(chatId);
  return userId ? sessionForUserId(userId) : null;
}

export function failResponse(e: unknown): NextResponse {
  if (e instanceof ResponseError) return e.res;
  if (isSchoolError(e)) {
    if (e.status >= 500) logError("school", e);
    return apiError(e.code, e.status);
  }
  logError("school", e);
  return apiError("server_error", 500);
}

/** Parses + validates a JSON body (throws a ready-made response on failure). */
export async function readBody<S extends z.ZodType>(req: Request, schema: S, maxBytes = 64 * 1024): Promise<z.output<S>> {
  const r = await parseBody(req, schema, { maxBytes });
  if (!r.ok) throw new ResponseError(r.res);
  return r.data;
}
/** Parses + validates the query string. */
export function readQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  const r = parseQuery(req, schema);
  if (!r.ok) throw new ResponseError(r.res);
  return r.data;
}

export const idParam = (params: Record<string, string>, name = "id"): string => {
  const v = params[name];
  if (!v || !/^[0-9a-f-]{36}$/i.test(v)) throw new SchoolError("not_found");
  return v;
};

export const DIRECTOR: SchoolRole[] = ["super_admin", "school_admin"];
export const STAFF: SchoolRole[] = ["super_admin", "school_admin", "teacher"];
