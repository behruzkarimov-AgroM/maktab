"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/school/client";
import { accountErrorKey } from "@/lib/school/i18n";
import { useSchool } from "@/components/school/ui/SchoolProvider";

/** maps a thrown error to a translated, user-safe message (never raw text) */
export function useErrorText() {
  const { t } = useSchool();
  return useCallback(
    (e: unknown): string => {
      const code = e instanceof ApiError ? e.code : "";
      const shared = accountErrorKey(code);
      if (shared && code !== "forbidden") return t(shared);
      if (code === "forbidden" || code === "unauthorized") return t("forbidden");
      if (code === "rate_limited") return t("f_errRate");
      if (code === "not_found") return t("f_errNotFound");
      if (code === "edit_window_closed" || code === "invalid_date") return t("f_errDate");
      return t("errorGeneric");
    },
    [t],
  );
}

export interface Async<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/** Fetches on mount / when `key` changes. State is only written from async callbacks. */
export function useAsync<T>(key: string | null, fn: () => Promise<T>): Async<T> {
  const [res, setRes] = useState<{ key: string | null; run: number; data: T | null; error: unknown } | null>(null);
  const [run, setRun] = useState(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    fnRef.current().then(
      (data) => alive && setRes({ key, run, data, error: null }),
      (error) => alive && setRes({ key, run, data: null, error }),
    );
    return () => {
      alive = false;
    };
  }, [key, run]);
  const current = res && res.key === key && res.run === run ? res : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: key !== null && !current, reload: () => setRun((n) => n + 1) };
}

/** localStorage-backed state that survives SSR (reads after mount) */
export function useLocalValue(key: string): [string | null, (v: string) => void] {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      /* ignore */
    }
    const id = setTimeout(() => setV(raw), 0);
    return () => clearTimeout(id);
  }, [key]);
  const set = useCallback(
    (val: string) => {
      setV(val);
      try {
        localStorage.setItem(key, val);
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [v, set];
}
