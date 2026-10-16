"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SCHOOL_LANG_KEY, UI, type T3, type UiKey } from "@/lib/school/i18n";
import type { SchoolRole } from "@/lib/school/types";
import { LOCALES, type Locale } from "@/lib/types";

export interface ClientSession {
  id: string;
  email: string;
  name: string;
  role: SchoolRole;
  demo: boolean;
  teacherId: string | null;
  studentIds: string[];
}

interface Ctx {
  session: ClientSession | null;
  lang: Locale;
  setLang: (l: Locale) => void;
  /** shared portal string */
  t: (key: UiKey) => string;
  /** pick the active language from a trilingual object ({uz,ru,en}); falls back to uz */
  L: (v: Partial<T3> | null | undefined) => string;
}

const SchoolCtx = createContext<Ctx | null>(null);

/** Wraps every /school page: current user, UZ/RU/EN switch (persisted in localStorage), string lookup. */
export function SchoolProvider({ session, children }: { session: ClientSession | null; children: ReactNode }) {
  const [lang, setLangState] = useState<Locale>("uz");
  useEffect(() => {
    try {
      const v = localStorage.getItem(SCHOOL_LANG_KEY);
      if (v && (LOCALES as string[]).includes(v)) setLangState(v as Locale);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Locale) => {
    setLangState(l);
    try {
      localStorage.setItem(SCHOOL_LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo<Ctx>(
    () => ({
      session, lang, setLang,
      t: (key) => UI[key]?.[lang] ?? UI[key]?.uz ?? String(key),
      L: (v) => (v ? v[lang] || v.uz || v.en || v.ru || "" : ""),
    }),
    [session, lang, setLang],
  );
  return <SchoolCtx.Provider value={value}>{children}</SchoolCtx.Provider>;
}

export function useSchool(): Ctx {
  const v = useContext(SchoolCtx);
  if (!v) throw new Error("useSchool must be used inside <SchoolProvider>");
  return v;
}
