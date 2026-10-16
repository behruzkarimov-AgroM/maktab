"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Inbox, X } from "lucide-react";
import { useDialogA11y } from "@/components/layout/useDialogA11y";
import { Button, cn } from "@/components/school/ui/kit";
import { sget } from "@/lib/school/client";
import type { Subject } from "@/lib/school/types";
import type { MeData, Overview } from "./types";
import { useTT } from "./use-tt";

/* ------------------------------ data hooks ------------------------------ */

export interface ApiState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (u: (d: T | null) => T | null) => void;
}

/** GET helper: path null = idle. Stale answers are ignored; `reload()` refetches without clearing the data. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    if (path === null) return;
    const mine = ++seq.current;
    sget<T>(path)
      .then((d) => {
        if (mine !== seq.current) return;
        setDataState(d);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (mine !== seq.current) return;
        setError(e);
        setLoading(false);
      });
    const counter = seq;
    return () => {
      counter.current++;
    };
  }, [path, tick]);
  const reload = useCallback(() => {
    setLoading(true);
    setTick((x) => x + 1);
  }, []);
  const setData = useCallback((u: (d: T | null) => T | null) => setDataState((d) => u(d)), []);
  return { data, error, loading: path === null ? false : loading, reload, setData };
}

export interface Base {
  me: MeData;
  ov: Overview;
  subjects: Subject[];
  reloadOverview: () => void;
}

/** /me + /teacher/overview + /subjects for every teacher page */
export function useBase(): { base: Base | null; loading: boolean; error: unknown; reload: () => void } {
  const me = useApi<MeData & { user: unknown }>("/me");
  const ov = useApi<Overview>("/teacher/overview");
  const subj = useApi<{ subjects: Subject[] }>("/subjects");
  const loading = me.loading || ov.loading || subj.loading;
  const error = me.error ?? ov.error ?? subj.error;
  const base: Base | null = me.data && ov.data && subj.data ? { me: me.data, ov: ov.data, subjects: subj.data.subjects, reloadOverview: ov.reload } : null;
  const reload = () => {
    me.reload();
    ov.reload();
    subj.reload();
  };
  return { base, loading: loading && !base, error, reload };
}

/** page wrapper: loading skeleton / error with retry / content */
export function Gate({ state, children }: { state: { base: Base | null; loading: boolean; error: unknown; reload: () => void }; children: (b: Base) => ReactNode }) {
  const { errText, tt } = useTT();
  if (state.base) return <>{children(state.base)}</>;
  if (state.error) return <ErrorState message={errText(state.error)} onRetry={state.reload} />;
  return <PageSkeleton label={tt("loading")} />;
}

/* ------------------------------ small UI ------------------------------ */

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold sm:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800", className)} />;
}

export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function EmptyState({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {icon ?? <Inbox className="size-8 opacity-60" />}
      <p>{text}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { tt } = useTT();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
      <AlertTriangle className="size-7" />
      <p>{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          {tt("retry")}
        </Button>
      )}
    </div>
  );
}

export const selectCls =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400", className)}>
      {label}
      {children}
    </label>
  );
}

/* ------------------------------ toasts ------------------------------ */

export interface ToastMsg {
  id: number;
  tone: "ok" | "error" | "info";
  text: string;
}
export function useToasts() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const n = useRef(0);
  const push = useCallback((tone: ToastMsg["tone"], text: string) => {
    const id = ++n.current;
    setItems((x) => [...x.slice(-2), { id, tone, text }]);
    window.setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);
  return { items, push, dismiss };
}

export function ToastHost({ items, dismiss }: { items: ToastMsg[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
            t.tone === "ok" && "bg-emerald-700 text-white",
            t.tone === "error" && "bg-red-600 text-white",
            t.tone === "info" && "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900",
          )}
        >
          {t.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : t.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : null}
          <span className="min-w-0 flex-1">{t.text}</span>
          <button aria-label="x" onClick={() => dismiss(t.id)} className="opacity-80 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ drawer ------------------------------ */

/** right-side drawer (bottom sheet look on phones) with Esc to close and focus return */
export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const { tt } = useTT();
  const ref = useRef<HTMLDivElement>(null);
  useDialogA11y(open, ref, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label={tt("close")} className="absolute inset-0 bg-slate-950/50" onClick={onClose} tabIndex={-1} />
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-xl outline-none dark:bg-slate-900 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:rounded-none",
          wide ? "sm:w-[34rem]" : "sm:w-[26rem]",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="min-w-0 truncate text-base font-bold">{title}</h2>
          <button aria-label={tt("close")} onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<K extends string>({ value, onChange, items }: { value: K; onChange: (k: K) => void; items: { key: K; label: string }[] }) {
  return (
    <div role="tablist" className="relative inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            "min-h-11 min-w-11 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
            value === it.key ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-200" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** lesson/time hh:mm from "08:30:00" */
export const hhmm = (t: string) => t.slice(0, 5);

/** pretty date "15.10.2026" from "2026-10-15" */
export const fmtDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
export const fmtShort = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** persisted last choice (class id etc.) */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`school-teacher:${key}`);
  } catch {
    return null;
  }
}
export function writePref(key: string, v: string): void {
  try {
    localStorage.setItem(`school-teacher:${key}`, v);
  } catch {
    /* ignore */
  }
}
