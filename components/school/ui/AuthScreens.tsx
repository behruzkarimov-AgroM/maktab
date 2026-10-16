"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Info, Mail } from "lucide-react";
import { spost } from "@/lib/school/client";
import { Button, cn, inputCls } from "./kit";
import { AuthShell } from "./AuthShell";
import { ChangePasswordForm, errorMessage, PasswordField, PasswordRules } from "./PasswordForm";
import { useSchool, type ClientSession } from "./SchoolProvider";

const linkCls = "inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300";

/* ------------------------------ forced / voluntary change ------------------------------ */
function ChangeInner({ home, forced }: { home: string; forced: boolean }) {
  const { t } = useSchool();
  const router = useRouter();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => {
      router.replace(home);
      router.refresh();
    }, 1500);
    return () => window.clearTimeout(id);
  }, [done, home, router]);

  async function signOut() {
    try {
      await spost("/auth/logout");
    } finally {
      router.replace("/school/login");
      router.refresh();
    }
  }

  return (
    <>
      <h2 className="mb-1 text-base font-semibold">{forced ? t("a_pw_forced_title") : t("a_pw_title")}</h2>
      {forced && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{t("a_pw_forced_text")}</p>}
      <ChangePasswordForm forced={forced} onDone={() => setDone(true)} />
      {done && <Button variant="primary" className="mt-3 min-h-11 w-full" onClick={() => { router.replace(home); router.refresh(); }}>{t("a_pw_continue")}</Button>}
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        {!forced && <Link className={linkCls} href={home}>{t("a_pw_continue")}</Link>}
        <button type="button" onClick={() => void signOut()} className={cn(linkCls, "ml-auto")}>{t("signOut")}</button>
      </div>
    </>
  );
}

export function ChangePasswordScreen({ session, home, forced }: { session: ClientSession; home: string; forced: boolean }) {
  return (
    <AuthShell session={session} title={(t) => t("a_pw_title")}>
      <ChangeInner home={home} forced={forced} />
    </AuthShell>
  );
}

/* ------------------------------ forgot password ------------------------------ */
function ForgotInner() {
  const { t } = useSchool();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<{ demo: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await spost<{ demo?: boolean }>("/auth/request-reset", { email });
      setSent({ demo: !!r.demo });
    } catch (x) {
      setErr(errorMessage(x, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-1 text-base font-semibold">{t("a_forgot_title")}</h2>
      {sent ? (
        <div className="space-y-3">
          <p role="status" className="flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"><Check className="mt-0.5 size-4 shrink-0" aria-hidden />{t("a_forgot_sent")}</p>
          {sent.demo && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              <p className="mb-2 flex gap-2"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("a_forgot_demo")}</p>
              <Link className={linkCls} href={`/school/reset-password?code=demo-reset&email=${encodeURIComponent(email)}`}>{t("a_forgot_demo_open")}</Link>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t("a_forgot_text")}</p>
          <div>
            <label htmlFor="fp-email" className="mb-1.5 block text-sm font-medium">{t("email")}</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" aria-hidden />
              <input id="fp-email" type="email" required autoComplete="username" className={cn(inputCls, "min-h-11 pl-9")} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{err}</p>}
          <Button type="submit" variant="primary" loading={busy} className="min-h-11 w-full">{t("a_forgot_send")}</Button>
        </form>
      )}
      <div className="mt-4"><Link className={linkCls} href="/school/login">{t("a_back_login")}</Link></div>
    </>
  );
}

export function ForgotPasswordScreen() {
  return (
    <AuthShell session={null} title={(t) => t("a_forgot_title")}>
      <ForgotInner />
    </AuthShell>
  );
}

/* ------------------------------ reset password (token / recovery flow) ------------------------------ */
function ResetInner({ demo }: { demo: boolean }) {
  const { t } = useSchool();
  const params = useSearchParams();
  const router = useRouter();
  const qCode = params.get("code") ?? "";
  const qHash = params.get("token_hash") ?? "";
  const qEmail = params.get("email") ?? "";
  const [code, setCode] = useState(qCode);
  const [email, setEmail] = useState(qEmail);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const credential = qHash || code;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const hasLink = !!(qHash || qCode);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => router.replace("/school/login"), 2500);
    return () => window.clearTimeout(id);
  }, [done, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!credential || !pw || pw !== pw2) return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, string> = { password: pw };
      if (qHash) body.token_hash = qHash;
      else body.code = code;
      if (demo && email) body.email = email;
      await spost("/auth/complete-reset", body);
      setDone(true);
    } catch (x) {
      setErr(errorMessage(x, t));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p role="status" className="flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"><Check className="mt-0.5 size-4 shrink-0" aria-hidden />{t("a_reset_done")}</p>
        <Link className={linkCls} href="/school/login">{t("a_back_login")}</Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="mb-1 text-base font-semibold">{t("a_reset_title")}</h2>
      {!demo && !hasLink ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{t("a_reset_missing")}</p>
          <Link className={linkCls} href="/school/forgot-password">{t("a_reset_request_new")}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t("a_reset_text")}</p>
          {demo && (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              <p className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("a_reset_demo_note")}</p>
              {!qHash && (
                <div>
                  <label htmlFor="rp-code" className="mb-1 block font-medium">{t("a_reset_code")}</label>
                  <input id="rp-code" className={cn(inputCls, "min-h-11 font-mono")} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
                </div>
              )}
              <div>
                <label htmlFor="rp-email" className="mb-1 block font-medium">{t("email")}</label>
                <input id="rp-email" type="email" className={cn(inputCls, "min-h-11")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
              </div>
            </div>
          )}
          <PasswordField id="rp-new" label={t("a_pw_new")} value={pw} onChange={setPw} autoComplete="new-password" describedBy="rp-rules" />
          <PasswordRules id="rp-rules" pw={pw} email={email || undefined} />
          <PasswordField id="rp-confirm" label={t("a_pw_confirm")} value={pw2} onChange={setPw2} autoComplete="new-password" invalid={mismatch} describedBy={mismatch ? "rp-mismatch" : undefined} />
          {mismatch && <p id="rp-mismatch" role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{t("a_pw_mismatch")}</p>}
          {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{err}</p>}
          <Button type="submit" variant="primary" loading={busy} disabled={!credential || !pw || pw !== pw2} className="min-h-11 w-full">{t("a_reset_submit")}</Button>
          <Link className={linkCls} href="/school/login">{t("a_back_login")}</Link>
        </form>
      )}
    </>
  );
}

export function ResetPasswordScreen({ demo }: { demo: boolean }) {
  return (
    <AuthShell session={null} title={(t) => t("a_reset_title")}>
      <ResetInner demo={demo} />
    </AuthShell>
  );
}
