"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useEffect, useState } from "react";

type Lang = "uz" | "ru" | "en";
const T = {
  verify: { uz: "Raqamni Telegram orqali tasdiqlash", ru: "Подтвердить номер через Telegram", en: "Confirm the number via Telegram" },
  sent: { uz: "Kod Telegram botga yuborildi. Kodni kiriting:", ru: "Код отправлен в Telegram-бот. Введите код:", en: "The code was sent to the Telegram bot. Enter it:" },
  confirm: { uz: "Tasdiqlash", ru: "Подтвердить", en: "Confirm" },
  done: { uz: "Raqam tasdiqlandi", ru: "Номер подтверждён", en: "Number confirmed" },
  noTg: {
    uz: "Bu raqam hali botga ulanmagan: botni oching, «Start» ni bosing va «📱 Raqamni yuborish» tugmasi bilan raqamingizni yuboring, so'ng qayta bosing.",
    ru: "Номер ещё не подключён к боту: откройте бота, нажмите «Start», отправьте номер кнопкой «📱 Отправить номер» и нажмите снова.",
    en: "This number is not connected to the bot yet: open the bot, press «Start», share your number with «📱 Share my number», then try again.",
  },
  openBot: { uz: "Botni ochish", ru: "Открыть бота", en: "Open the bot" },
  badCode: { uz: "Kod noto'g'ri yoki eskirgan", ru: "Код неверный или устарел", en: "The code is wrong or expired" },
  badPhone: { uz: "Avval to'g'ri telefon raqam kiriting", ru: "Сначала введите правильный номер", en: "Enter a valid phone number first" },
  limited: { uz: "Juda ko'p urinish, keyinroq qayta urinib ko'ring", ru: "Слишком много попыток, попробуйте позже", en: "Too many attempts, try again later" },
  failed: { uz: "Kodni yuborib bo'lmadi", ru: "Не удалось отправить код", en: "The code could not be sent" },
  required: { uz: "Ariza yuborish uchun raqamni tasdiqlang", ru: "Чтобы отправить, подтвердите номер", en: "Confirm the number to submit" },
} as const;

let configCache: Promise<{ formsRequire: boolean; bot: string | null }> | null = null;
const loadConfig = () =>
  (configCache ??= fetch("/api/auth/phone", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => ({ formsRequire: !!j.formsRequire, bot: j.bot ?? null }))
    .catch(() => ({ formsRequire: false, bot: null })));

/**
 * Confirms the phone typed into a public form with a 6-digit code from the school's Telegram bot (instead of SMS).
 * Renders nothing while the bot is not set up (the server does not require a verified phone then).
 * onToken(token) is called with the server's phone token once confirmed, and with null whenever the number changes.
 */
export function PhoneVerify({ phone, lang, onToken, onRequired, inputClass }: {
  phone: string; lang: Lang; onToken: (token: string | null) => void; onRequired?: (required: boolean) => void; inputClass: string;
}) {
  const [cfg, setCfg] = useState<{ formsRequire: boolean; bot: string | null } | null>(null);
  const [step, setStep] = useState<"idle" | "code">("idle");
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "no_tg"; text: string } | null>(null);
  const digits = phone.replace(/\D/g, "");
  const verified = verifiedFor !== null && verifiedFor === digits;

  useEffect(() => {
    let live = true;
    void loadConfig().then((c) => {
      if (!live) return;
      setCfg(c);
      onRequired?.(c.formsRequire);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cfg?.formsRequire) return null;
  const say = (k: keyof typeof T) => T[k][lang];

  async function call(url: string, body: unknown) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    return { status: r?.status ?? 0, json: ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; token?: string } };
  }

  async function send() {
    if (digits.replace(/^998/, "").length !== 9) return setMsg({ kind: "error", text: say("badPhone") });
    setBusy(true);
    setMsg(null);
    const r = await call("/api/auth/phone/request", { phone, purpose: "verify" });
    setBusy(false);
    if (r.status === 200) {
      setStep("code");
      setCode("");
    } else if (r.json.error === "no_telegram") setMsg({ kind: "no_tg", text: say("noTg") });
    else setMsg({ kind: "error", text: say(r.status === 429 ? "limited" : r.json.error === "invalid_phone" ? "badPhone" : "failed") });
  }

  async function confirm() {
    setBusy(true);
    const r = await call("/api/auth/phone/verify", { phone, purpose: "verify", code });
    setBusy(false);
    if (r.status === 200 && r.json.token) {
      setVerifiedFor(digits);
      setStep("idle");
      setMsg(null);
      onToken(r.json.token);
    } else setMsg({ kind: "error", text: say(r.status === 429 ? "limited" : "badCode") });
  }

  if (verified) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400" role="status">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> {say("done")}
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {step === "idle" ? (
        <button type="button" onClick={() => void send()} disabled={busy}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
          <Send className="h-4 w-4" aria-hidden /> {say("verify")}
        </button>
      ) : (
        <div>
          <p className="mb-1 text-xs text-slate-600 dark:text-slate-300">{say("sent")}</p>
          <div className="flex gap-2">
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label={say("sent")} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className={`${inputClass} font-mono tracking-[0.3em]`} />
            <button type="button" onClick={() => void confirm()} disabled={busy || code.length !== 6}
              className="shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">{say("confirm")}</button>
          </div>
        </div>
      )}
      {msg && (
        <div role="alert" className={msg.kind === "no_tg" ? "rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200" : "text-xs text-rose-600 dark:text-rose-400"}>
          <p>{msg.text}</p>
          {msg.kind === "no_tg" && cfg.bot && (
            <a href={`https://t.me/${cfg.bot}?start=phone`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-sky-700 underline dark:text-sky-300">
              <Send className="h-3.5 w-3.5" aria-hidden /> {say("openBot")} @{cfg.bot}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export const phoneRequiredText = (lang: Lang) => T.required[lang];
