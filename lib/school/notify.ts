// Telegram notifications to guardians. Telegram is the ONLY external channel (there is no e-mail channel: prefs.email is reported as unavailable).
// Absence notices are opt-in with SCHOOL_NOTIFY_ABSENCE=on, low-grade notices with SCHOOL_NOTIFY_GRADES=on. Never throws, never blocks the request:
// call it from next/server `after()`. Uses lib/telegram.ts credentials (TELEGRAM_BOT_TOKEN) but sends to the guardian's own chat id.
import { after } from "next/server";
import { escapeHtml, sendTelegram } from "@/lib/telegram";
import { getDb } from "./db";
import { prefsFor } from "./svc-prefs";

/** Runs best-effort work after the response (next/server `after`); outside a request scope (tests, scripts) it just starts the work. Never throws. */
export function runAfter(fn: () => Promise<unknown>): void {
  try {
    after(fn);
  } catch {
    void fn().catch(() => undefined);
  }
}

export const absenceNotifyEnabled = () => process.env.SCHOOL_NOTIFY_ABSENCE === "on" && !!process.env.TELEGRAM_BOT_TOKEN;

async function sendToChat(chatId: string, text: string): Promise<boolean> {
  if (!/^-?\d{4,20}$/.test(chatId)) return false;
  return sendTelegram(text, chatId);
}

/** Messages every guardian that has a telegram_chat_id. Skipped in demo mode (the demo chat ids are fake). */
export async function notifyAbsences(items: { student_id: string; date: string }[]): Promise<number> {
  if (!absenceNotifyEnabled() || !items.length) return 0;
  try {
    const db = await getDb();
    if (db.kind === "demo") return 0;
    const students = await db.select("students", { in: { id: items.map((i) => i.student_id) } });
    const links = await db.select("student_guardians", { in: { student_id: items.map((i) => i.student_id) } });
    if (!links.length) return 0;
    const guardians = await db.select("guardians", { in: { id: [...new Set(links.map((l) => l.guardian_id))] } });
    // guardians with an account may switch absence notices / the Telegram channel off (GET/PUT /api/school/me/prefs)
    const prefs = await prefsFor(db, guardians.map((g) => g.user_id).filter((u): u is string => !!u));
    let sent = 0;
    for (const it of items) {
      const st = students.find((s) => s.id === it.student_id);
      if (!st) continue;
      const text = `<b>Davomat / Посещаемость</b>\n${escapeHtml(`${st.last_name} ${st.first_name}`)} - ${escapeHtml(it.date)}\nBugun darsga kelmadi / Сегодня отсутствует.`;
      for (const l of links.filter((x) => x.student_id === it.student_id)) {
        const g = guardians.find((x) => x.id === l.guardian_id);
        if (!g?.telegram_chat_id) continue;
        const p = g.user_id ? prefs.get(g.user_id) : undefined;
        if (p && (!p.absence || !p.telegram)) continue;
        if (await sendToChat(g.telegram_chat_id, text)) sent++;
      }
    }
    return sent;
  } catch {
    return 0;
  }
}

export const gradeNotifyEnabled = () => process.env.SCHOOL_NOTIFY_GRADES === "on" && !!process.env.TELEGRAM_BOT_TOKEN;

/** Telegram notice to guardians about NEW low grades. Respects prefs.low_grade and prefs.telegram. Never throws. */
export async function notifyLowGrades(items: { student_id: string; subject_id: string; score: number; date: string }[]): Promise<number> {
  if (!gradeNotifyEnabled() || !items.length) return 0;
  try {
    const db = await getDb();
    if (db.kind === "demo") return 0;
    const ids = [...new Set(items.map((i) => i.student_id))];
    const students = await db.select("students", { in: { id: ids } });
    const links = await db.select("student_guardians", { in: { student_id: ids } });
    if (!links.length) return 0;
    const guardians = await db.select("guardians", { in: { id: [...new Set(links.map((l) => l.guardian_id))] } });
    const subjects = await db.select("subjects", { in: { id: [...new Set(items.map((i) => i.subject_id))] } });
    const prefs = await prefsFor(db, guardians.map((g) => g.user_id).filter((u): u is string => !!u));
    let sent = 0;
    for (const it of items.slice(0, 200)) {
      const st = students.find((s) => s.id === it.student_id);
      if (!st) continue;
      const subj = subjects.find((s) => s.id === it.subject_id)?.name;
      const text = `<b>Baho / Оценка</b>\n${escapeHtml(`${st.last_name} ${st.first_name}`)} - ${escapeHtml(subj?.uz || subj?.ru || "")}: ${Number(it.score)} (${escapeHtml(it.date)})`;
      for (const l of links.filter((x) => x.student_id === it.student_id)) {
        const g = guardians.find((x) => x.id === l.guardian_id);
        if (!g?.telegram_chat_id) continue;
        const p = g.user_id ? prefs.get(g.user_id) : undefined;
        if (p && (!p.low_grade || !p.telegram)) continue;
        if (await sendToChat(g.telegram_chat_id, text)) sent++;
      }
    }
    return sent;
  } catch {
    return 0;
  }
}
