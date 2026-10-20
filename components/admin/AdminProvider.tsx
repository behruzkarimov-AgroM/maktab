"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/admin/cn";
import { UI, type UIKey } from "@/lib/admin/ui-i18n";
import type { AdminSession, L } from "@/lib/admin/types";
import type { Locale } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface Ctx {
  lang: Locale;
  setLang: (l: Locale) => void;
  t: (k: UIKey) => string;
  /** pick label in UI language */
  L: (v: L | string | undefined | null) => string;
  toast: (text: string, kind?: ToastKind) => void;
  session: AdminSession | null;
}

const AdminCtx = createContext<Ctx | null>(null);

export function useAdmin(): Ctx {
  const c = useContext(AdminCtx);
  if (!c) throw new Error("useAdmin outside AdminProvider");
  return c;
}

export function AdminProvider({ children, session }: { children: ReactNode; session: AdminSession | null }) {
  const [saved, setLang] = useLocalStorage("admin_lang") as [string | null, (l: Locale) => void];
  const lang: Locale = saved === "ru" || saved === "en" ? saved : "uz";
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toast = useCallback((text: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), kind === "error" ? 6000 : 3000);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (k) => UI[k][lang],
      L: (v) => (!v ? "" : typeof v === "string" ? v : v[lang] || v.uz),
      toast,
      session,
    }),
    [lang, setLang, toast, session],
  );

  return (
    <AdminCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((x) => (
          <div
            key={x.id}
            role={x.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg backdrop-blur animate-in",
              x.kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
              x.kind === "error" && "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
              x.kind === "info" && "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
            )}
          >
            {x.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : x.kind === "error" ? <XCircle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
            <span className="flex-1 break-words">{x.text}</span>
            <button onClick={() => setToasts((a) => a.filter((y) => y.id !== x.id))} aria-label={UI.close[lang]} className="grid size-6 place-items-center rounded opacity-60 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </AdminCtx.Provider>
  );
}
