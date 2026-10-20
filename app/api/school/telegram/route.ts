import { botRequest } from "@/lib/bot-auth";
import { api } from "@/lib/school/api-helpers";
import { SchoolError } from "@/lib/school/errors";
import { chatForUser, createLinkCode, unlink } from "@/lib/telegram-links";

/** the bot's public username (TELEGRAM_BOT_USERNAME, without "@"), or null when the bot is not set up */
const botUsername = () => {
  const u = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,32}$/.test(u) ? u : null;
};

/** linking is done from the portal itself, never through the bot */
function cookieOnly(req: Request) {
  if (botRequest(req)) throw new SchoolError("forbidden", 403);
}

/** GET /api/school/telegram -> { linked, username, bot } (any school role) */
export const GET = api({}, async ({ s, req }) => {
  cookieOnly(req);
  const link = await chatForUser(s.id);
  return { linked: !!link, username: link?.username ?? null, bot: botUsername() };
});

/**
 * POST /api/school/telegram -> { code, expires_at, url }
 * A one-time code (10 minutes) that the bot redeems for the chat that opens the link https://t.me/<bot>?start=<code>.
 */
export const POST = api({ mutate: true, json: false, rate: { max: 10, windowSec: 600 }, rateKey: "school:tg-code" }, async ({ s, req }) => {
  cookieOnly(req);
  const bot = botUsername();
  if (!bot) throw new SchoolError("not_configured", 501);
  const { code, expires_at } = await createLinkCode(s.id);
  return { code, expires_at, url: `https://t.me/${bot}?start=${code}` };
});

/** DELETE /api/school/telegram -> { removed } disconnects the linked chat */
export const DELETE = api({ mutate: true, json: false }, async ({ s, req }) => {
  cookieOnly(req);
  return { removed: await unlink({ userId: s.id }) };
});
