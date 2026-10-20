import { apiOk } from "@/lib/api";
import { phoneConfig } from "@/lib/phone-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/phone -> { codes, bot, login, signup, formsRequire }
 *   codes: codes can be delivered (bot token + username set); bot: the bot's username for "open the bot" links;
 *   login / signup: sign-in by phone and self-registration are available (self-hosted database + codes);
 *   formsRequire: the public forms (admission, olympiad) require a verified phone.
 */
export async function GET() {
  const c = phoneConfig();
  return apiOk({ ...c, formsRequire: c.codes });
}
