import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseBody, rejectCrossOrigin } from "@/lib/api";
import { getServiceClient } from "@/lib/admin/supabase";
import { localEnabled, startSession } from "@/lib/localdb/server";
import { accountByPhone, chatOfPhone, phoneCodesEnabled, verifyPhoneToken } from "@/lib/phone-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { schoolEmailDomain } from "@/lib/school/enroll";
import { passwordIssues } from "@/lib/school/password";
import { linkChatToUser } from "@/lib/telegram-links";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().max(300),
  full_name: z.string().trim().min(3).max(120).regex(/^[\p{L}\p{M}'ʻʼ‘’`.\- ]+$/u),
  password: z.string().max(100).optional(),
});

/**
 * POST /api/auth/signup { token, full_name, password? } -> { redirect, login }
 * Self-registration of a PARENT with a phone verified through the Telegram bot (token from /api/auth/phone/verify, purpose signup).
 * Creates the login (role parent; login = p<phone digits>@<school domain>, sign-in by phone code or by password when one was set),
 * the guardian record with that phone, links the bot chat and signs in. Children are linked by the school (director / admin).
 */
export async function POST(req: Request) {
  if (rejectCrossOrigin(req)) return apiError("forbidden", 403);
  if (!phoneCodesEnabled() || !localEnabled()) return apiError("not_available", 501);
  const limited = await enforceRateLimit(req, { key: "auth:signup", max: 5, windowSec: 3600 });
  if (limited) return limited;
  const body = await parseBody(req, schema, { maxBytes: 2048 });
  if (!body.ok) return body.res;
  const phone = verifyPhoneToken(body.data.token, "signup");
  if (!phone) return apiError("invalid_token", 422);
  if (await accountByPhone(phone)) return apiError("account_exists", 409);
  const email = `p${phone.replace(/\D/g, "")}@${schoolEmailDomain()}`;
  if (body.data.password && passwordIssues(body.data.password, { email }).length) return apiError("weak_password", 422);

  const svc = getServiceClient()!;
  const name = body.data.full_name.replace(/\s+/g, " ");
  const created = await svc.auth.admin.createUser({
    email, password: body.data.password || randomBytes(18).toString("base64url"), email_confirm: true, user_metadata: { full_name: name },
  });
  if (created.error || !created.data.user) {
    return apiError(/already/i.test(created.error?.message ?? "") ? "account_exists" : "server_error", /already/i.test(created.error?.message ?? "") ? 409 : 500);
  }
  const uid = created.data.user.id;
  const prof = await svc.from("profiles").update({ role: "parent", full_name: name, phone, is_active: true, must_change_password: false }).eq("id", uid);
  const guardian = prof.error ? prof : await svc.from("guardians").insert({ full_name: name, relation: "parent", phone, email, user_id: uid });
  if (guardian.error) {
    await svc.auth.admin.deleteUser(uid); // no half-made account
    return apiError("server_error", 500);
  }
  const chat = await chatOfPhone(phone);
  if (chat) await linkChatToUser(chat, uid, null).catch(() => undefined);
  await startSession(uid);
  return NextResponse.json({ ok: true, redirect: "/school/family", login: email }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
