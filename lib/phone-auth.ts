// Phone verification through the Telegram bot (the school's stand-in for SMS). Server only.
//   1. In the bot the user shares their OWN contact (Telegram does not let anyone share somebody else's number as their own):
//      savePhoneForChat() stores chat <-> phone and, when the number belongs to an account, links the chat to it.
//   2. On the website a visitor types a phone number: requestCode() sends a 6-digit code to the chat of that number;
//      checkCode() accepts it once (5 minutes, 5 attempts). Used for sign-in by phone, self-registration and form verification.
//   3. Forms receive a short-lived signed phone token (signPhoneToken) instead of trusting the typed number.
// Storage: telegram_phones / phone_codes (service role) in database mode, in-process maps in demo mode.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getServiceClient, isConfigured } from "@/lib/admin/supabase";
import { localEnabled } from "@/lib/localdb/server";
import { getDb } from "@/lib/school/db";
import { SchoolError } from "@/lib/school/errors";
import { escapeHtml, sendTelegram } from "@/lib/telegram";

export type PhonePurpose = "login" | "signup" | "verify";
export const CODE_TTL_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

/** "+998 90 123-45-67", "901234567", "998901234567" -> "+998901234567"; other countries as +<digits>; else null */
export function normPhone(input: string | null | undefined): string | null {
  const d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 9) return `+998${d}`;
  if (d.length === 12 && d.startsWith("998")) return `+${d}`;
  if (d.length >= 10 && d.length <= 15 && !d.startsWith("0")) return `+${d}`;
  return null;
}

/** the bot's public username (TELEGRAM_BOT_USERNAME), or null when the bot is not set up */
export const botUsername = (): string | null => {
  const u = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,32}$/.test(u) ? u : null;
};

/** codes can only be delivered when the site has the bot token and knows the bot */
export const phoneCodesEnabled = (): boolean => !!process.env.TELEGRAM_BOT_TOKEN && !!botUsername();

/** what the login / registration pages may offer (sign-in by phone and self-registration need the self-hosted database) */
export function phoneConfig(): { codes: boolean; bot: string | null; login: boolean; signup: boolean } {
  const codes = phoneCodesEnabled();
  const accounts = codes && localEnabled();
  return { codes, bot: botUsername(), login: accounts, signup: accounts };
}

// ------------------------------------------------------------------ secrets / tokens
const g = globalThis as unknown as { __phoneSecret?: string; __phoneDemo?: { phones: Map<string, string>; codes: DemoCode[] } };
function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.BOT_API_SECRET || "";
  return s.length >= 32 ? s : (g.__phoneSecret ??= randomBytes(32).toString("hex")); // demo / tests: per process
}
const mac = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url");
const codeHash = (phone: string, purpose: PhonePurpose, code: string) => createHmac("sha256", secret()).update(`${phone}|${purpose}|${code}`).digest("hex");

/** proof that `phone` was verified for `purpose` (signup: 15 minutes, verify: 30 minutes) */
export function signPhoneToken(phone: string, purpose: PhonePurpose, now = Date.now()): string {
  const exp = now + (purpose === "verify" ? 30 : 15) * 60 * 1000;
  const body = Buffer.from(`${phone}|${purpose}|${exp}`).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** the verified phone in a token for `purpose`, or null (bad signature, other purpose, expired) */
export function verifyPhoneToken(token: unknown, purpose: PhonePurpose, now = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 300) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [phone, p, exp] = Buffer.from(body, "base64url").toString().split("|");
  return p === purpose && Number(exp) > now && normPhone(phone) === phone ? phone : null;
}

// ------------------------------------------------------------------ storage
interface DemoCode { phone: string; purpose: PhonePurpose; hash: string; attempts: number; expires: number; used: boolean }
const demo = () => (g.__phoneDemo ??= { phones: new Map(), codes: [] });
function svc() {
  const s = getServiceClient();
  if (!s) throw new SchoolError("not_configured", 501);
  return s;
}

/** stores the phone a chat shared (one chat per phone: the newest owner wins, Telegram verified it) */
export async function storeChatPhone(chatId: string, phone: string): Promise<void> {
  if (isConfigured()) {
    const db = svc();
    await db.from("telegram_phones").delete().eq("phone", phone);
    const r = await db.from("telegram_phones").upsert({ chat_id: chatId, phone, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
    if (r.error) throw new SchoolError("db_error");
    return;
  }
  const d = demo().phones;
  for (const [k, v] of d) if (v === phone) d.delete(k);
  d.set(chatId, phone);
}

export async function phoneOfChat(chatId: string): Promise<string | null> {
  if (isConfigured()) {
    const { data } = await svc().from("telegram_phones").select("phone").eq("chat_id", chatId).maybeSingle();
    return (data?.phone as string | undefined) ?? null;
  }
  return demo().phones.get(chatId) ?? null;
}

export async function chatOfPhone(phone: string): Promise<string | null> {
  if (isConfigured()) {
    const { data } = await svc().from("telegram_phones").select("chat_id").eq("phone", phone).maybeSingle();
    return (data?.chat_id as string | undefined) ?? null;
  }
  for (const [k, v] of demo().phones) if (v === phone) return k;
  return null;
}

/**
 * The portal account whose own records carry this phone: a guardian, then a teacher, then a student (a parent's number is often also
 * written on the child's card, so the parent wins), then any profile with this phone. Only active accounts count.
 */
export async function accountByPhone(phone: string): Promise<{ userId: string } | null> {
  const db = await getDb();
  const sameNumber = (v: string | null | undefined) => !!v && normPhone(v) === phone;
  const candidates: (string | null)[] = [];
  candidates.push(...(await db.select("guardians")).filter((x) => sameNumber(x.phone)).map((x) => x.user_id));
  candidates.push(...(await db.select("teachers")).filter((x) => sameNumber(x.phone)).map((x) => x.user_id));
  candidates.push(...(await db.select("students")).filter((x) => sameNumber(x.phone)).map((x) => x.user_id));
  if (isConfigured()) {
    const { data } = await svc().from("profiles").select("id,phone").not("phone", "is", null);
    candidates.push(...((data ?? []) as { id: string; phone: string }[]).filter((p) => sameNumber(p.phone)).map((p) => p.id));
  }
  for (const id of candidates) {
    if (!id) continue;
    if (!isConfigured()) return { userId: id };
    const { data: p } = await svc().from("profiles").select("is_active").eq("id", id).maybeSingle();
    if (p?.is_active) return { userId: id };
  }
  return null;
}

// ------------------------------------------------------------------ codes
/** a fresh code for phone + purpose (older open codes of the same kind stop working); returns the code to deliver */
async function createCode(phone: string, purpose: PhonePurpose, now = Date.now()): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = { phone, purpose, code_hash: codeHash(phone, purpose, code), expires_at: new Date(now + CODE_TTL_MS).toISOString() };
  if (isConfigured()) {
    const db = svc();
    await db.from("phone_codes").delete().eq("phone", phone).eq("purpose", purpose).is("used_at", null);
    const r = await db.from("phone_codes").insert(row);
    if (r.error) throw new SchoolError("db_error");
  } else {
    const d = demo();
    d.codes = d.codes.filter((c) => !(c.phone === phone && c.purpose === purpose && !c.used));
    d.codes.push({ phone, purpose, hash: row.code_hash, attempts: 0, expires: now + CODE_TTL_MS, used: false });
  }
  return code;
}

/** checks a code once: true only for the newest open, unexpired code with attempts left; a wrong guess uses up an attempt */
export async function checkCode(phone: string, purpose: PhonePurpose, code: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const want = codeHash(phone, purpose, code);
  const same = (h: string) => h.length === want.length && timingSafeEqual(Buffer.from(h), Buffer.from(want));
  if (isConfigured()) {
    const db = svc();
    const { data } = await db.from("phone_codes").select("id,code_hash,attempts,expires_at").eq("phone", phone).eq("purpose", purpose)
      .is("used_at", null).order("created_at", { ascending: false }).limit(1);
    const row = data?.[0] as { id: string; code_hash: string; attempts: number; expires_at: string } | undefined;
    if (!row || row.attempts >= MAX_ATTEMPTS || Date.parse(row.expires_at) <= now) return false;
    if (!same(row.code_hash)) {
      await db.from("phone_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return false;
    }
    // single use: only the request that flips used_at wins
    const { data: won } = await db.from("phone_codes").update({ used_at: new Date(now).toISOString() }).eq("id", row.id).is("used_at", null).select("id");
    return !!won?.length;
  }
  const row = [...demo().codes].reverse().find((c) => c.phone === phone && c.purpose === purpose && !c.used);
  if (!row || row.attempts >= MAX_ATTEMPTS || row.expires <= now) return false;
  if (!same(row.hash)) {
    row.attempts++;
    return false;
  }
  row.used = true;
  return true;
}

const MESSAGES: Record<PhonePurpose, string> = {
  login: "saytga kirish / вход на сайт / sign-in",
  signup: "ro'yxatdan o'tish / регистрация / registration",
  verify: "telefonni tasdiqlash / подтверждение телефона / phone check",
};

/** creates a code and delivers it to the chat that owns the phone; false when Telegram did not accept the message */
export async function sendCode(chatId: string, phone: string, purpose: PhonePurpose): Promise<boolean> {
  const code = await createCode(phone, purpose);
  const text =
    `🔐 <b>${code}</b>\n\nChildren's Academy: ${escapeHtml(MESSAGES[purpose])}\n` +
    `Kod 5 daqiqa amal qiladi. Hech kimga bermang. / Код действует 5 минут, никому не сообщайте. / Valid for 5 minutes, never share it.`;
  return sendTelegram(text, chatId);
}

/** stable, non-reversible id of a phone for rate-limit buckets */
export const phoneKey = (phone: string) => createHash("sha256").update(phone).digest("hex");
