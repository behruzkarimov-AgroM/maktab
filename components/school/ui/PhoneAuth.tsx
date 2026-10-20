"use client";

import { useState } from "react";
import { KeyRound, Phone, Send } from "lucide-react";
import { maskPhone } from "@/components/olympiad/phone";
import { Button, cn, inputCls } from "./kit";
import { useSchool } from "./SchoolProvider";

export interface PhoneConfig {
  codes: boolean;
  bot: string | null;
  login: boolean;
  signup: boolean;
}

type Done = { phone: string; redirect?: string; token?: string };

async function postJson(url: string, body: unknown): Promise<{ status: number; json: Record<string, any> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/**
 * Phone number -> 6-digit code delivered by the school's Telegram bot -> done.
 * purpose "login": signs in and returns the page to open; "signup": returns a phone token for /api/auth/signup.
 */
export function PhoneCodeForm({ purpose, bot, onDone, submitLabel }: { purpose: "login" | "signup"; bot: string | null; onDone: (r: Done) => void; submitLabel: string }) {
  const { t } = useSchool();
  const [phone, setPhone] = useState("+998");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info" | "no_tg"; text: string } | null>(null);
  const digits = phone.replace(/\D/g, "");

  const fail = (status: number, error: string | undefined) => {
    const key =
      error === "no_telegram" ? null
        : error === "no_account" ? "a_ph_no_account"
        : error === "account_exists" ? "a_ph_exists"
        : error === "invalid_code" ? "a_ph_bad_code"
        : error === "invalid_phone" || error === "validation" ? "a_ph_bad_phone"
        : status === 429 ? "a_ph_limited"
        : status === 501 ? "a_ph_unavailable"
        : "a_ph_failed";
    setMsg(key ? { kind: "error", text: t(key) } : { kind: "no_tg", text: t("a_ph_no_tg") });
  };

  async function send() {
    if (digits.replace(/^998/, "").length !== 9) return setMsg({ kind: "error", text: t("a_ph_bad_phone") });
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/auth/phone/request", { phone, purpose }).catch(() => ({ status: 0, json: {} as Record<string, string> }));
    setBusy(false);
    if (r.status !== 200) return fail(r.status, r.json.error);
    setStep("code");
    setCode("");
    setMsg({ kind: "info", text: t("a_ph_sent").replace("{phone}", phone) });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (step === "phone") return void send();
    setBusy(true);
    const r = await postJson("/api/auth/phone/verify", { phone, purpose, code }).catch(() => ({ status: 0, json: {} as Record<string, string> }));
    setBusy(false);
    if (r.status !== 200) return fail(r.status, r.json.error);
    onDone({ phone, redirect: r.json.redirect, token: r.json.token });
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <div>
        <label htmlFor={`ph-${purpose}`} className="mb-1.5 block text-sm font-medium">{t("a_ph_phone")}</label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input
            id={`ph-${purpose}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" disabled={step === "code"}
            className={cn(inputCls, "pl-9")} value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))}
          />
        </div>
      </div>
      {step === "code" && (
        <div>
          <label htmlFor={`code-${purpose}`} className="mb-1.5 block text-sm font-medium">{t("a_ph_code")}</label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input
              id={`code-${purpose}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              className={cn(inputCls, "pl-9 font-mono text-lg tracking-[0.4em]")} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
        </div>
      )}
      {msg && (
        <div role={msg.kind === "error" ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-sm",
          msg.kind === "error" ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"
            : msg.kind === "no_tg" ? "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
            : "bg-sky-50 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200")}>
          <p>{msg.text}</p>
          {msg.kind === "no_tg" && bot && (
            <a href={`https://t.me/${bot}?start=phone`} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-600 px-3 font-semibold text-white hover:bg-sky-500">
              <Send className="size-4" aria-hidden />{t("a_ph_open_bot")} @{bot}
            </a>
          )}
        </div>
      )}
      {step === "phone" ? (
        <Button type="submit" variant="primary" loading={busy} className="w-full py-2.5">
          <Send className="size-4" aria-hidden /> {t("a_ph_send")}
        </Button>
      ) : (
        <>
          <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6} className="w-full py-2.5">{submitLabel}</Button>
          <div className="flex justify-between gap-2 text-sm">
            <button type="button" className="min-h-11 font-medium text-indigo-700 hover:underline dark:text-indigo-300" onClick={() => void send()} disabled={busy}>{t("a_ph_resend")}</button>
            <button type="button" className="min-h-11 font-medium text-slate-600 hover:underline dark:text-slate-300" onClick={() => { setStep("phone"); setMsg(null); }}>{t("a_ph_change")}</button>
          </div>
        </>
      )}
    </form>
  );
}
