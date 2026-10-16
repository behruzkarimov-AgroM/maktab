"use client";

import type { ReactNode } from "react";
import { LOCALES } from "@/lib/types";
import { cn } from "./kit";
import { SchoolProvider, useSchool, type ClientSession } from "./SchoolProvider";

function Frame({ title, children }: { title: string; children: ReactNode }) {
  const { t, lang, setLang } = useSchool();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-sky-50 px-4 py-8 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-900/40">
      <div className="w-full max-w-md">
        <div className="mb-3 flex justify-end gap-1" role="group" aria-label={t("language")}>
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={cn("min-h-11 min-w-11 rounded-md px-2 py-1 text-xs font-bold uppercase", lang === l ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300")}
            >
              {l}
            </button>
          ))}
        </div>
        <main className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-96.png" alt="" width={44} height={44} className="size-11 rounded-full object-cover" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{title}</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("schoolName")}</p>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

/** Public/standalone card for login-adjacent pages (forgot / reset / forced change). `title` is a render prop so it can use t(). */
export function AuthShell({ session, title, children }: { session: ClientSession | null; title: (t: ReturnType<typeof useSchool>["t"]) => string; children: ReactNode }) {
  return (
    <SchoolProvider session={session}>
      <Titled title={title}>{children}</Titled>
    </SchoolProvider>
  );
}

function Titled({ title, children }: { title: (t: ReturnType<typeof useSchool>["t"]) => string; children: ReactNode }) {
  const { t } = useSchool();
  return <Frame title={title(t)}>{children}</Frame>;
}
