/**
 * Server-side notifications (never import from client code).
 * - Telegram: copy to the admin chat via lib/telegram (no-op without TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
 *   A bot cannot message a parent by phone number, so the parent gets the ticket by SMS.
 * - SMS: pluggable provider. Built-in: Eskiz.uz (ESKIZ_EMAIL, ESKIZ_PASSWORD, optional ESKIZ_FROM).
 *   No-op when not configured.
 */
import { escapeHtml, sendTelegram } from "@/lib/telegram";

export interface SmsProvider {
  name: string;
  send(phone: string, text: string): Promise<boolean>;
}

let eskizToken: { value: string; exp: number } | null = null;

function eskiz(): SmsProvider | null {
  const email = process.env.ESKIZ_EMAIL;
  const password = process.env.ESKIZ_PASSWORD;
  if (!email || !password) return null;
  const base = process.env.ESKIZ_BASE_URL || "https://notify.eskiz.uz/api";
  async function token(): Promise<string | null> {
    if (eskizToken && eskizToken.exp > Date.now()) return eskizToken.value;
    const body = new URLSearchParams({ email: email!, password: password! });
    const r = await fetch(`${base}/auth/login`, { method: "POST", body, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { token?: string } };
    const value = j.data?.token;
    if (!value) return null;
    eskizToken = { value, exp: Date.now() + 25 * 86400_000 };
    return value;
  }
  return {
    name: "eskiz",
    async send(phone, text) {
      const t = await token();
      if (!t) return false;
      const body = new URLSearchParams({
        mobile_phone: phone.replace(/\D/g, ""),
        message: text,
        from: process.env.ESKIZ_FROM || "4546",
      });
      const r = await fetch(`${base}/message/sms/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
        body,
        signal: AbortSignal.timeout(8000),
      });
      return r.ok;
    },
  };
}

const custom: SmsProvider[] = [];
/** Register an additional provider (e.g. Playmobile) at startup. First registered wins over built-ins. */
export function registerSmsProvider(p: SmsProvider) {
  custom.push(p);
}
export function getSmsProvider(): SmsProvider | null {
  return custom[0] ?? eskiz();
}

export interface RegistrationNotice {
  ticket: string;
  studentName: string;
  parentPhone: string;
  olympiadTitle: string;
  subject: string;
  eventDate: string;
}

/** Never throws. Safe to run in after(). */
export async function notifyRegistration(n: RegistrationNotice): Promise<void> {
  const tasks: Promise<unknown>[] = [
    sendTelegram(
      `<b>Olympiad registration</b>\n${escapeHtml(n.olympiadTitle)}\n` +
        `Student: ${escapeHtml(n.studentName)}\nSubject: ${escapeHtml(n.subject)}\n` +
        `Parent: ${escapeHtml(n.parentPhone)}\nTicket: <code>${escapeHtml(n.ticket)}</code>`,
    ),
  ];
  const sms = getSmsProvider();
  if (sms) {
    // No attacker-controlled free text (student name) in the SMS: it goes to a number the submitter chose.
    tasks.push(sms.send(n.parentPhone, `${n.olympiadTitle}: ticket ${n.ticket}. ${n.eventDate}.`));
  }
  await Promise.allSettled(tasks);
}
