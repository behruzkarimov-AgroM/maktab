"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LockKeyhole, UserRound } from "lucide-react";
import { LOCALES } from "@/lib/types";
import { Button, cn, inputCls } from "./kit";
import { PhoneCodeForm, type PhoneConfig } from "./PhoneAuth";
import { SchoolProvider, useSchool } from "./SchoolProvider";

/** Parent self-registration: phone confirmed with a code from the Telegram bot -> name (+ optional password) -> account. */
function Inner({ phone: cfg }: { phone: PhoneConfig }) {
  const { t, lang, setLang } = useSchool();
  const router = useRouter();
  const [verified, setVerified] = useState<{ phone: string; token: string } | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!verified) return;
    if (name.trim().split(/\s+/).length < 2 || name.trim().length < 3) return setError(t("a_reg_bad_name"));
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/signup", {
      method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ token: verified.token, full_name: name.trim(), password: password || undefined }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { redirect?: string; error?: string } | undefined;
    if (r?.status === 201 && j?.redirect) {
      router.replace(j.redirect);
      router.refresh();
      return;
    }
    setBusy(false);
    setError(
      j?.error === "account_exists" ? t("a_ph_exists")
        : j?.error === "weak_password" ? t("a_err_weak_password")
        : j?.error === "validation" ? t("a_reg_bad_name")
        : j?.error === "invalid_token" ? t("a_ph_bad_code")
        : r?.status === 429 ? t("a_ph_limited") : t("a_ph_failed"),
    );
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-sky-50 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-900/40">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end gap-1">
          {LOCALES.map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={cn("min-h-11 min-w-11 rounded-md px-2 py-1 text-xs font-bold uppercase", lang === l ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300")}>
              {l}
            </button>
          ))}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-96.png" alt="" width={44} height={44} className="size-11 rounded-full object-cover" />
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{t("a_reg_title")}</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("schoolName")}</p>
            </div>
          </div>
          <p className="mb-5 text-sm text-slate-600 dark:text-slate-300">{t("a_reg_intro")}</p>

          {!cfg.signup ? (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">{t("a_reg_unavailable")}</p>
          ) : !verified ? (
            <PhoneCodeForm purpose="signup" bot={cfg.bot} submitLabel={t("a_ph_confirm")} onDone={(r) => r.token && setVerified({ phone: r.phone, token: r.token })} />
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />{t("a_reg_verified").replace("{phone}", verified.phone)}
              </p>
              <div>
                <label htmlFor="reg-name" className="mb-1.5 block text-sm font-medium">{t("a_reg_name")}</label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                  <input id="reg-name" autoComplete="name" maxLength={120} required className={cn(inputCls, "pl-9")} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              <div>
                <label htmlFor="reg-pass" className="mb-1.5 block text-sm font-medium">{t("a_reg_password")}</label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                  <input id="reg-pass" type="password" autoComplete="new-password" maxLength={72} className={cn(inputCls, "pl-9")} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="reg-pass-hint" />
                </div>
                <p id="reg-pass-hint" className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("a_reg_password_hint")}</p>
              </div>
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/60 dark:text-red-300">{error}</p>}
              <Button type="submit" variant="primary" loading={busy} className="w-full py-2.5">{t("a_reg_submit")}</Button>
            </form>
          )}
          <p className="mt-4 border-t border-slate-200 pt-4 text-center text-sm dark:border-slate-800">
            <Link href="/school/login?via=phone" className="font-semibold text-indigo-700 hover:underline dark:text-indigo-300">{t("a_reg_have_account")}</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export function RegisterForm({ phone }: { phone: PhoneConfig }) {
  return (
    <SchoolProvider session={null}>
      <Inner phone={phone} />
    </SchoolProvider>
  );
}
