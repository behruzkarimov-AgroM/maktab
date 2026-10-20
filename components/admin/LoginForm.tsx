"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, Mail, ShieldAlert } from "lucide-react";
import { api, ApiError } from "@/lib/admin/api";
import { cn } from "@/lib/admin/cn";
import { loadAdminClient, supabaseConfigured } from "./supabase-lazy";
import { LOCALES } from "@/lib/types";
import { AdminProvider, useAdmin } from "./AdminProvider";
import { Button, inputCls } from "./ui";

const DEMO = [
  { email: "admin@demo.uz", role: "Super admin" },
  { email: "metodist@demo.uz", role: "Metodist" },
  { email: "psixolog@demo.uz", role: "Psixolog" },
];

/**
 * "supabase": Supabase Auth in the browser; "local": self-hosted database, the server checks the password (POST /api/admin/auth/login);
 * "demo": the fixed demo accounts (only with ALLOW_ADMIN_DEMO=true); "off": no way to sign in
 */
export type LoginMode = "supabase" | "local" | "demo" | "off";

function Inner({ mode }: { mode: LoginMode }) {
  const { t, lang, setLang } = useAdmin();
  const router = useRouter();
  const params = useSearchParams();
  const demo = mode === "demo";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "forbidden" ? "forbidden" : null);

  useEffect(() => {
    // a signed-in account without admin rights must not keep a dangling session
    if (params.get("error") === "forbidden" && supabaseConfigured()) void loadAdminClient().then((c) => c.auth.signOut());
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // demo and self-hosted mode: the server checks the password, sets the session cookie and says where this account belongs
      // (students, parents, teachers and the director go to their school portal). Supabase mode: the /admin guard does that.
      let to = "/admin";
      if (mode !== "supabase") to = (await api.demoLogin(email, password)).redirect ?? "/admin";
      else {
        const { error: err } = await (await loadAdminClient()).auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      router.replace(to);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed");
      setBusy(false);
    }
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-sky-50 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-900/40">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end gap-1">
          {LOCALES.map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cn("rounded-md px-2 py-1 text-xs font-bold uppercase", lang === l ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300")} aria-pressed={lang === l}>
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
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("appName")}</p>
            </div>
          </div>

          {mode === "off" && (
            <p role="status" className="mb-5 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {t("authOff")}
            </p>
          )}

          {demo && (
            <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              <p className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wide">
                <ShieldAlert className="size-4" /> {t("demoLogin")}
              </p>
              <p className="mb-2">{t("demoHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => {
                      setEmail(d.email);
                      setPassword("demo1234");
                    }}
                    className="rounded-lg border border-amber-300 bg-white px-2 py-1 font-mono hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:hover:bg-amber-900"
                  >
                    {d.email} <span className="font-sans text-amber-800 dark:text-amber-300">· {d.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                {t("email")}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input id="email" type="email" required autoComplete="username" className={cn(inputCls, "pl-9")} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                {t("password")}
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input id="password" type="password" required autoComplete="current-password" className={cn(inputCls, "pl-9")} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/60 dark:text-red-300">
                {error === "forbidden" ? t("forbidden") : t("loginFailed")}
              </p>
            )}
            <Button type="submit" variant="primary" loading={busy} disabled={mode === "off"} className="w-full py-2.5">
              {t("signIn")}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

export function LoginForm({ mode }: { mode: LoginMode }) {
  return (
    <AdminProvider session={null}>
      <Inner mode={mode} />
    </AdminProvider>
  );
}
