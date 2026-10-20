import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/lib/api";
import { botRequest } from "@/lib/bot-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sessionForUserId } from "@/lib/school/auth";
import { isSchoolError } from "@/lib/school/errors";
import { redeemLinkCode, unlink } from "@/lib/telegram-links";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().min(1).max(32), username: z.string().trim().max(64).nullable().optional() });

/**
 * POST /api/bot/link (bot only: x-bot-secret + x-telegram-chat-id) { code, username? } -> { role, name }
 * Redeems the one-time portal code for this chat. 404 when the bot API is off or the secret is wrong (nothing to discover).
 */
export async function POST(req: Request) {
  const bot = botRequest(req);
  if (!bot) return apiError("not_found", 404);
  const limited = await enforceRateLimit(req, { key: "bot:link", max: 10, windowSec: 600 });
  if (limited) return limited;
  const body = await parseBody(req, schema, { maxBytes: 1024 });
  if (!body.ok) return body.res;
  try {
    const userId = await redeemLinkCode(body.data.code, bot.chatId, body.data.username ?? null);
    const s = await sessionForUserId(userId);
    if (!s) {
      await unlink({ chatId: bot.chatId }); // e.g. the account was deactivated meanwhile
      return apiError("not_linked", 403);
    }
    return apiOk({ role: s.role, name: s.name, must_change_password: !!s.mustChangePassword });
  } catch (e) {
    if (isSchoolError(e)) return apiError(e.code, e.status);
    return apiError("server_error", 500);
  }
}

/** DELETE /api/bot/link (bot only) -> { removed } : the user pressed "log out" in the bot */
export async function DELETE(req: Request) {
  const bot = botRequest(req);
  if (!bot) return apiError("not_found", 404);
  try {
    return apiOk({ removed: await unlink({ chatId: bot.chatId }) });
  } catch {
    return apiError("server_error", 500);
  }
}
