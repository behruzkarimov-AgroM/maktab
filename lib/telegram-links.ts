// Links a Telegram chat to a portal account (server only).
//   1. signed-in portal user -> createLinkCode()  (8 chars, single use, 10 minutes; only its SHA-256 is stored)
//   2. the user opens t.me/<bot>?start=<code>; the bot calls POST /api/bot/link -> redeemLinkCode(code, chatId)
//   3. bot requests carrying that chat id act as the user (lib/school/api-helpers.ts)
// One chat per user and one user per chat: a new link replaces the old one. A parent's chat id is also copied to guardians.telegram_chat_id,
// so the existing absence / low-grade notices (lib/school/notify.ts) reach the same chat.
// Supabase mode: tables telegram_links / telegram_link_codes (service role). Demo mode: in-process maps (reset on restart).
import { createHash, randomBytes } from "node:crypto";
import { getServiceClient, isConfigured } from "@/lib/admin/supabase";
import { getDb } from "@/lib/school/db";
import { SchoolError } from "@/lib/school/errors";

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const CODE_RE = /^[A-Z2-9]{8}$/;

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

interface DemoLinks {
  links: Map<string, { user_id: string; username: string | null }>; // chat_id -> user
  codes: Map<string, { user_id: string; expires_at: number; used: boolean }>; // code hash -> code
}
const g = globalThis as unknown as { __tgLinks?: DemoLinks };
export const demoLinks = (): DemoLinks => (g.__tgLinks ??= { links: new Map(), codes: new Map() });

function svc() {
  const s = getServiceClient();
  if (!s) throw new SchoolError("not_configured", 501);
  return s;
}

/** a fresh one-time code for this user (older unused codes of the same user stop working) */
export async function createLinkCode(userId: string, now = Date.now()): Promise<{ code: string; expires_at: string }> {
  const code = Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
  const expires = now + LINK_CODE_TTL_MS;
  if (isConfigured()) {
    const db = svc();
    await db.from("telegram_link_codes").delete().eq("user_id", userId);
    const r = await db.from("telegram_link_codes").insert({ code_hash: hash(code), user_id: userId, expires_at: new Date(expires).toISOString() });
    if (r.error) throw new SchoolError("db_error");
  } else {
    const d = demoLinks();
    for (const [k, v] of d.codes) if (v.user_id === userId) d.codes.delete(k);
    d.codes.set(hash(code), { user_id: userId, expires_at: expires, used: false });
  }
  return { code, expires_at: new Date(expires).toISOString() };
}

/** copies (or clears) the chat id on the guardian records of this user, for the existing Telegram notices */
async function syncGuardianChat(userId: string, chatId: string | null): Promise<void> {
  try {
    const db = await getDb();
    await db.update("guardians", { eq: { user_id: userId } }, { telegram_chat_id: chatId });
  } catch {
    /* best effort: the link itself is what the bot needs */
  }
}

/** redeems a code for a chat: returns the linked user id; invalid, used or expired codes -> invalid_token */
export async function redeemLinkCode(code: string, chatId: string, username: string | null, now = Date.now()): Promise<string> {
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) throw new SchoolError("invalid_token", 422);
  let userId: string;
  if (isConfigured()) {
    const db = svc();
    // single use: the update only matches an unused, unexpired code, so two concurrent redemptions cannot both succeed
    const { data, error } = await db
      .from("telegram_link_codes")
      .update({ used_at: new Date(now).toISOString() })
      .eq("code_hash", hash(c))
      .is("used_at", null)
      .gt("expires_at", new Date(now).toISOString())
      .select("user_id");
    if (error) throw new SchoolError("db_error");
    if (!data?.length) throw new SchoolError("invalid_token", 422);
    userId = data[0].user_id as string;
    await db.from("telegram_links").delete().eq("chat_id", chatId);
    await db.from("telegram_links").delete().eq("user_id", userId);
    const ins = await db.from("telegram_links").insert({ chat_id: chatId, user_id: userId, username: username?.slice(0, 64) ?? null });
    if (ins.error) throw new SchoolError("db_error");
  } else {
    const d = demoLinks();
    const row = d.codes.get(hash(c));
    if (!row || row.used || row.expires_at <= now) throw new SchoolError("invalid_token", 422);
    row.used = true;
    userId = row.user_id;
    for (const [k, v] of d.links) if (k === chatId || v.user_id === userId) d.links.delete(k);
    d.links.set(chatId, { user_id: userId, username: username?.slice(0, 64) ?? null });
  }
  await syncGuardianChat(userId, chatId);
  return userId;
}

/** the portal user linked to this chat, or null */
export async function userForChat(chatId: string): Promise<string | null> {
  if (isConfigured()) {
    const { data } = await svc().from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();
    return (data?.user_id as string | undefined) ?? null;
  }
  return demoLinks().links.get(chatId)?.user_id ?? null;
}

/** whether this user has a linked chat (for the portal card) */
export async function chatForUser(userId: string): Promise<{ chat_id: string; username: string | null } | null> {
  if (isConfigured()) {
    const { data } = await svc().from("telegram_links").select("chat_id,username").eq("user_id", userId).maybeSingle();
    return data ? { chat_id: data.chat_id as string, username: (data.username as string | null) ?? null } : null;
  }
  for (const [chat_id, v] of demoLinks().links) if (v.user_id === userId) return { chat_id, username: v.username };
  return null;
}

/** removes the link of a chat (bot /logout) or of a user (portal "disconnect"); returns whether something was removed */
export async function unlink(by: { chatId?: string; userId?: string }): Promise<boolean> {
  let userId: string | null = by.userId ?? null;
  if (isConfigured()) {
    const db = svc();
    const q = db.from("telegram_links").delete();
    const { data, error } = await (by.chatId ? q.eq("chat_id", by.chatId) : q.eq("user_id", by.userId!)).select("user_id");
    if (error) throw new SchoolError("db_error");
    if (!data?.length) return false;
    userId = data[0].user_id as string;
  } else {
    const d = demoLinks();
    let found = false;
    for (const [k, v] of d.links) {
      if (k === by.chatId || v.user_id === by.userId) {
        userId = v.user_id;
        d.links.delete(k);
        found = true;
      }
    }
    if (!found) return false;
  }
  if (userId) await syncGuardianChat(userId, null);
  return true;
}
