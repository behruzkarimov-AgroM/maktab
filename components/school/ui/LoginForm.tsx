"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, ShieldAlert } from "lucide-react";
import { ApiError, spost } from "@/lib/school/client";
import { ROLE_LABEL } from "@/lib/school/i18n";
import type { SchoolRole } from "@/lib/school/types";
import { LOCALES } from "@/lib/types";
import { Button, cn, inputCls } from "./kit";
import { SchoolProvider, useSchool } from "./SchoolProvider";

export interface DemoHint {
  email: string;
  role: SchoolRole;
  name: string;
}

function Inner({ demo }: { demo: DemoHint[] }) {
  const { t, lang, setLang } = useSchool();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await spost<{ home: string; must_change_password?: boolean }>("/auth/login", { email, password });
      router.replace(res.must_change_password ? "/school/change-password" : res.home);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "loginLimited" : err instanceof ApiError && err.status === 501 ? "loginUnavailable" : "loginFailed");
      setBusy(false);
    }
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
          <div className="mb-6 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-96.png" alt="" width={44} height={44} className="size-11 rounded-full object-cover" />
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{t("loginTitle")}</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("schoolName")}</p>
            </div>
          </div>

          {demo.length > 0 && (
            <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              <p className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wide">
                <ShieldAlert className="size-4" /> {t("demoLogin")}
              </p>
              <p className="mb-2">{t("demoHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {demo.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    data-demo-role={d.role}
                    onClick={() => {
                      setEmail(d.email);
                      setPassword("demo1234");
                    }}
                    className="rounded-lg border border-amber-300 bg-white px-2 py-1 font-mono hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:hover:bg-amber-900"
                  >
                    {d.email} <span className="font-sans text-amber-800 dark:text-amber-300">· {t(ROLE_LABEL[d.role])}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">{t("email")}</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                <input id="email" type="email" required autoComplete="username" className={cn(inputCls, "pl-9")} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">{t("password")}</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                <input id="password" type="password" required autoComplete="current-password" className={cn(inputCls, "pl-9")} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/60 dark:text-red-300">
                {t(error as "loginFailed")}
              </p>
            )}
            <Button type="submit" variant="primary" loading={busy} className="w-full py-2.5">
              {t("signIn")}
            </Button>
            <Link href="/school/forgot-password" className="flex min-h-11 items-center justify-center text-sm font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300">
              {t("a_forgot_link")}
            </Link>
          </form>
        </div>
      </div>
    </main>
  );
}

export function LoginForm({ demo }: { demo: DemoHint[] }) {
  return (
    <SchoolProvider session={null}>
      <Inner demo={demo} />
    </SchoolProvider>
  );
}
