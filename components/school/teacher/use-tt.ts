"use client";

import { useCallback } from "react";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { ApiError } from "@/lib/school/client";
import { UI, accountErrorKey, type UiKey } from "@/lib/school/i18n";
import type { TKey } from "@/lib/school/i18n-teacher";
import { isNetworkError } from "@/lib/school/teacher-logic";

/** translator for the teacher namespace (keys `t_*` of the shared dictionary lib/school/i18n.ts); falls back to the shared portal strings */
export function useTT() {
  const school = useSchool();
  const { lang } = school;
  const tt = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      const entry = UI[`t_${key}` as UiKey];
      let s: string = entry?.[lang] ?? entry?.uz ?? String(key);
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );
  /** translated, human friendly message for any thrown error (never the raw text) */
  const errText = useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError) {
        const own = `t_err_${e.code}` as UiKey;
        if (UI[own]) return UI[own][lang];
        const shared = accountErrorKey(e.code);
        return shared ? UI[shared][lang] : tt("err_generic");
      }
      return isNetworkError(e) ? tt("err_network") : tt("err_generic");
    },
    [tt, lang],
  );
  return { ...school, tt, errText };
}
