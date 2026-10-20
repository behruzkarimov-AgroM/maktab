import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody, rejectCrossOrigin } from "@/lib/api";
import { getServiceClient } from "@/lib/admin/supabase";
import { localEnabled, startSession } from "@/lib/localdb/server";
import { accountByPhone, chatOfPhone, checkCode, normPhone, phoneCodesEnabled, signPhoneToken } from "@/lib/phone-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { landingFor } from "@/lib/school/auth";
import { isSchoolError } from "@/lib/school/errors";
import { linkChatToUser } from "@/lib/telegram-links";

export const dynamic = "force-dynamic";

const schema = z.object({ phone: z.string().trim().min(5).max(32), purpose: z.enum(["login", "signup", "verify"]), code: z.string().trim().max(12) });

/**
 * POST /api/auth/phone/verify { phone, purpose, code }
 *   login  -> { redirect }  signs the account in (session cookie); the phone proved who it is, so a temporary password is no longer
 *                            demanded, and the bot chat of this phone is linked to the account
 *   signup -> { token }     for POST /api/auth/signup (15 min)
 *   verify -> { token }     phoneToken for the public forms (30 min)
 * Wrong / expired / used code -> 422 invalid_code (each wrong guess uses one of the 5 attempts).
 */
export async function POST(req: Request) {
  if (rejectCrossOrigin(req)) return apiError("forbidden", 403);
  const limited = await enforceRateLimit(req, { key: "phone:verify-ip", max: 30, windowSec: 600 });
  if (limited) return limited;
  const body = await parseBody(req, schema, { maxBytes: 1024 });
  if (!body.ok) return body.res;
  const phone = normPhone(body.data.phone);
  if (!phone) return apiError("invalid_phone", 422);
  const { purpose } = body.data;
  if (!phoneCodesEnabled() || (purpose !== "verify" && !localEnabled())) return apiError("not_available", 501);

  try {
    if (!(await checkCode(phone, purpose, body.data.code.replace(/\s+/g, "")))) return apiError("invalid_code", 422);
    if (purpose !== "login") return apiOk({ token: signPhoneToken(phone, purpose) });

    const acc = await accountByPhone(phone);
    const svc = getServiceClient()!;
    const { data: p } = acc ? await svc.from("profiles").select("role,is_active").eq("id", acc.userId).maybeSingle() : { data: null };
    const to = p?.is_active ? landingFor(p.role, false, "school") : null;
    if (!acc || !to) return apiError("no_account", 404);
    await svc.from("profiles").update({ must_change_password: false }).eq("id", acc.userId);
    await startSession(acc.userId);
    const chat = await chatOfPhone(phone);
    if (chat) await linkChatToUser(chat, acc.userId, null).catch(() => undefined);
    return NextResponse.json({ ok: true, redirect: to }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(isSchoolError(e) ? e.code : "server_error", isSchoolError(e) ? e.status : 500);
  }
}
