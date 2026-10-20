import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody, rejectCrossOrigin } from "@/lib/api";
import { localEnabled } from "@/lib/localdb/server";
import { accountByPhone, botUsername, chatOfPhone, normPhone, phoneCodesEnabled, phoneKey, sendCode } from "@/lib/phone-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isSchoolError } from "@/lib/school/errors";

export const dynamic = "force-dynamic";

const schema = z.object({ phone: z.string().trim().min(5).max(32), purpose: z.enum(["login", "signup", "verify"]) });

/**
 * POST /api/auth/phone/request { phone, purpose } -> { sent, expires_in }
 * Sends a 6-digit code to the Telegram chat that shared this phone with the bot.
 * Errors: 409 no_telegram { bot } (open the bot, press /start, share the number first), 404 no_account (login), 409 account_exists
 * (signup), 501 not_available, 502 send_failed, 429 rate_limited (per IP 10 / 10 min, per phone 3 / 10 min).
 */
export async function POST(req: Request) {
  if (rejectCrossOrigin(req)) return apiError("forbidden", 403);
  const body = await parseBody(req, schema, { maxBytes: 1024 });
  if (!body.ok) return body.res;
  const phone = normPhone(body.data.phone);
  if (!phone) return apiError("invalid_phone", 422);
  const { purpose } = body.data;
  if (!phoneCodesEnabled() || (purpose !== "verify" && !localEnabled())) return apiError("not_available", 501);

  const byIp = await enforceRateLimit(req, { key: "phone:req-ip", max: 10, windowSec: 600 });
  if (byIp) return byIp;
  const byPhone = await enforceRateLimit(req, { key: "phone:req", identity: phoneKey(phone), max: 3, windowSec: 600 });
  if (byPhone) return byPhone;

  try {
    const chat = await chatOfPhone(phone);
    if (!chat) return NextResponse.json({ ok: false, error: "no_telegram", bot: botUsername() }, { status: 409, headers: { "Cache-Control": "no-store" } });
    if (purpose === "login" && !(await accountByPhone(phone))) return apiError("no_account", 404);
    if (purpose === "signup" && (await accountByPhone(phone))) return apiError("account_exists", 409);
    if (!(await sendCode(chat, phone, purpose))) return apiError("send_failed", 502);
    return apiOk({ sent: true, expires_in: 300 });
  } catch (e) {
    return apiError(isSchoolError(e) ? e.code : "server_error", isSchoolError(e) ? e.status : 500);
  }
}
