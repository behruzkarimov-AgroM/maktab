// Server-to-server requests from the Telegram bot (separate project, see docs/TELEGRAM-BOT.md).
// The bot proves itself with the shared secret BOT_API_SECRET (header x-bot-secret, at least 32 chars) and says on whose behalf it
// speaks with x-telegram-chat-id. The chat id only becomes a portal user through a link the user created themselves (lib/telegram-links.ts).
import { timingSafeEqual } from "node:crypto";

export const BOT_SECRET_HEADER = "x-bot-secret";
export const BOT_CHAT_HEADER = "x-telegram-chat-id";
const CHAT_RE = /^-?\d{4,20}$/;

/** the configured secret, or null when the bot API is switched off (unset or too short to be safe) */
function secret(): string | null {
  const s = process.env.BOT_API_SECRET ?? "";
  return s.length >= 32 ? s : null;
}

export const botApiEnabled = () => secret() !== null;

/** { chatId } for a request carrying the valid bot secret and a well-formed chat id, else null (constant-time compare) */
export function botRequest(req: Request): { chatId: string } | null {
  const want = secret();
  const got = req.headers.get(BOT_SECRET_HEADER);
  if (!want || !got) return null;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const chatId = (req.headers.get(BOT_CHAT_HEADER) ?? "").trim();
  return CHAT_RE.test(chatId) ? { chatId } : null;
}
