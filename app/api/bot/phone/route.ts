import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/lib/api";
import { botRequest } from "@/lib/bot-auth";
import { accountByPhone, normPhone, phoneOfChat, storeChatPhone } from "@/lib/phone-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sessionForUserId } from "@/lib/school/auth";
import { isSchoolError } from "@/lib/school/errors";
import { linkChatToUser, userForChat } from "@/lib/telegram-links";

export const dynamic = "force-dynamic";

const schema = z.object({ phone: z.string().trim().min(5).max(32), username: z.string().trim().max(64).nullable().optional() });

/** GET /api/bot/phone (bot only) -> { phone, linked } : what the bot needs on /start */
export async function GET(req: Request) {
  const bot = botRequest(req);
  if (!bot) return apiError("not_found", 404);
  try {
    return apiOk({ phone: await phoneOfChat(bot.chatId), linked: !!(await userForChat(bot.chatId)) });
  } catch (e) {
    return apiError(isSchoolError(e) ? e.code : "server_error", isSchoolError(e) ? e.status : 500);
  }
}

/**
 * POST /api/bot/phone (bot only) { phone, username? } -> { phone, linked, role?, name? }
 * The bot sends the contact the user shared about THEMSELVES (the bot checks contact.user_id === from.id). The number is stored for
 * the chat (site codes are delivered there) and, when it is on an active account's own record (guardian / teacher / student /
 * profile), the chat is linked to that account at once.
 */
export async function POST(req: Request) {
  const bot = botRequest(req);
  if (!bot) return apiError("not_found", 404);
  const limited = await enforceRateLimit(req, { key: "bot:phone", max: 10, windowSec: 600 });
  if (limited) return limited;
  const body = await parseBody(req, schema, { maxBytes: 1024 });
  if (!body.ok) return body.res;
  const phone = normPhone(body.data.phone);
  if (!phone) return apiError("invalid_phone", 422);
  try {
    await storeChatPhone(bot.chatId, phone);
    const acc = await accountByPhone(phone);
    if (!acc) return apiOk({ phone, linked: !!(await userForChat(bot.chatId)) });
    const s = await sessionForUserId(acc.userId);
    if (!s) return apiOk({ phone, linked: false });
    await linkChatToUser(bot.chatId, acc.userId, body.data.username ?? null);
    return apiOk({ phone, linked: true, role: s.role, name: s.name, must_change_password: !!s.mustChangePassword });
  } catch (e) {
    return apiError(isSchoolError(e) ? e.code : "server_error", isSchoolError(e) ? e.status : 500);
  }
}
