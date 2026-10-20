import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, isBotSubmission, logError, parseBody, rejectCrossOrigin } from "@/lib/api";
import { botRequest } from "@/lib/bot-auth";
import { normPhone, phoneCodesEnabled, verifyPhoneToken } from "@/lib/phone-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { escapeHtml, sendTelegram } from "@/lib/telegram";
import { getAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  application_type: z.enum(["admission", "campus_tour", "callback"]),
  parent_name: z.string().trim().min(2).max(100),
  child_name: z.string().trim().max(100).optional().default(""),
  target_grade: z.coerce.number().int().min(1).max(11).nullable().optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{9,20}$/),
  preferred_language: z.enum(["uz", "ru", "en"]).default("uz"),
  message: z.string().trim().max(1000).optional().default(""),
  website: z.string().max(200).optional().default(""), // honeypot (humans leave it empty)
  formStartedAt: z.number(), // time trap: Date.now() when the form was rendered (required)
  phoneToken: z.string().max(300).optional(), // proof the phone was verified with a code from the Telegram bot
});

const TYPE_LABEL = { admission: "Qabul arizasi", campus_tour: "Ekskursiya", callback: "Qayta qo'ng'iroq" } as const;

export async function POST(req: NextRequest) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const limited = await enforceRateLimit(req, { key: "applications", max: 5, windowSec: 600 });
  if (limited) return limited;

  const body = await parseBody(req, schema, { maxBytes: 8 * 1024 });
  if (!body.ok) return body.res;
  const d = body.data;

  // Bots: pretend success so they do not adapt.
  if (isBotSubmission(d, { requireTimestamp: true })) return apiOk();
  // once the school's Telegram bot can deliver codes, the phone must be verified (the bot itself talks to us with its secret)
  if (phoneCodesEnabled() && !botRequest(req) && verifyPhoneToken(d.phoneToken, "verify") !== normPhone(d.phone)) {
    return apiError("phone_unverified", 400);
  }

  const row = {
    application_type: d.application_type,
    parent_name: d.parent_name,
    child_name: d.child_name || null,
    target_grade: d.target_grade ?? null,
    phone: d.phone,
    preferred_language: d.preferred_language,
    message: d.message || null,
  };

  let demo = true;
  if (isSupabaseConfigured()) {
    try {
      // Public INSERT policy was removed: only this validated, rate-limited route may write (service role).
      const db = getAdminClient();
      if (!db) return apiError("unavailable", 503);
      demo = false;
      const { error } = await db.from("admission_applications").insert(row);
      if (error) {
        logError("applications", error);
        return apiError("db", 500);
      }
    } catch (e) {
      logError("applications", e);
      return apiError("server", 500);
    }
  }

  after(() =>
    sendTelegram(
    [
      `<b>Yangi ariza: ${TYPE_LABEL[d.application_type]}</b>`,
      `Ota-ona: ${escapeHtml(d.parent_name)}`,
      d.child_name ? `Bola: ${escapeHtml(d.child_name)}` : "",
      d.target_grade ? `Sinf: ${d.target_grade}` : "",
      `Tel: ${escapeHtml(d.phone)}`,
      `Til: ${d.preferred_language}`,
      d.message ? `Xabar: ${escapeHtml(d.message)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    ),
  );

  return apiOk({ demo });
}