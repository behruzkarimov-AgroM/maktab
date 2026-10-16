"use client";

// Shared building blocks of the director panel: data hook, modal / confirm, form fields, toasts, tables, exports.
import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Inbox, Loader2, RefreshCw, X } from "lucide-react";
import { ApiError, sget } from "@/lib/school/client";
import { accountErrorKey, type UiKey } from "@/lib/school/i18n";
import type { GradingRules, SchoolClass, SchoolYear, Subject, Term } from "@/lib/school/types";
import { Badge, Button, Card, cn, inputCls } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";

/* ------------------------------ errors ------------------------------ */
const ERR_KEYS: Record<string, UiKey> = {
  unauthorized: "d_err_unauthorized", forbidden: "forbidden", not_found: "d_err_not_found", validation: "d_err_validation", invalid_input: "d_err_validation",
  conflict: "d_err_conflict", duplicate: "d_err_conflict", term_locked: "d_err_term_locked", edit_window_closed: "d_err_edit_window", rate_limited: "d_err_rate",
  payload_too_large: "d_err_too_large", unsupported: "d_err_unsupported", invalid_date: "d_err_date", date_out_of_term: "d_err_date", not_configured: "d_err_not_configured",
};
export function useErrText() {
  const { t } = useSchool();
  return useCallback(
    (e: unknown): string => {
      const code = e instanceof ApiError ? e.code : typeof e === "string" ? e : "server_error";
      return t(ERR_KEYS[code] ?? accountErrorKey(code) ?? "errorGeneric");
    },
    [t],
  );
}

/* ------------------------------ data hook ------------------------------ */
interface ApiState<T> { key: string | null; data: T | null; error: unknown }
export function useApi<T>(path: string | null) {
  const [st, setSt] = useState<ApiState<T>>({ key: null, data: null, error: null });
  const [tick, setTick] = useState(0);
  const key = path ? `${path}#${tick}` : null;
  useEffect(() => {
    if (!path) return;
    let alive = true;
    sget<T>(path)
      .then((d) => alive && setSt({ key: `${path}#${tick}`, data: d, error: null }))
      .catch((e) => alive && setSt((s) => ({ key: `${path}#${tick}`, data: s.data, error: e })));
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const setData = useCallback((fn: (d: T) => T) => setSt((s) => (s.data ? { ...s, data: fn(s.data) } : s)), []);
  return { data: st.data, error: st.key === key ? st.error : null, loading: !!path && st.key !== key, reload, setData };
}

/* ------------------------------ reference data ------------------------------ */
export interface MeInfo {
  today: string;
  year: SchoolYear | null;
  term: Term | null;
  terms: Term[];
  rules: GradingRules;
  demo: boolean;
}
export function useMe() {
  return useApi<MeInfo & { ok: true }>("/me");
}
export type ClassRow = SchoolClass & { student_count?: number; homeroom_teacher_name: string | null };
export function useClasses() {
  const r = useApi<{ classes: ClassRow[] }>("/classes");
  return { ...r, classes: r.data?.classes ?? [] };
}
export function useSubjects() {
  const r = useApi<{ subjects: Subject[] }>("/subjects");
  return { ...r, subjects: r.data?.subjects ?? [] };
}

/* ------------------------------ toasts ------------------------------ */
interface ToastItem { id: number; tone: "ok" | "err"; text: string }
const ToastCtx = createContext<(tone: "ok" | "err", text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function DirPage({ title, subtitle, actions, children, wide = true }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((tone: "ok" | "err", text: string) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      <div className={cn("mx-auto space-y-5", wide ? "max-w-7xl" : "max-w-4xl")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            role={i.tone === "err" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg",
              i.tone === "ok" ? "bg-emerald-700" : "bg-red-600",
            )}
          >
            {i.tone === "ok" ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------ states ------------------------------ */
export function Skeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}
export function EmptyState({ text, icon }: { text?: string; icon?: ReactNode }) {
  const { t } = useSchool();
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
      {icon ?? <Inbox className="size-8 opacity-60" />}
      {text ?? t("noData")}
    </div>
  );
}
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{errText(error)}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> {t("retry")}
        </Button>
      )}
    </div>
  );
}
/** loading / error / empty / content switch for an api result */
export function Async({ state, rows = 6, empty, children }: {
  state: { data: unknown; error: unknown; loading: boolean; reload: () => void };
  rows?: number;
  empty?: boolean;
  children: ReactNode;
}) {
  if (state.error && !state.data) return <ErrorBox error={state.error} onRetry={state.reload} />;
  if (!state.data) return <Skeleton rows={rows} />;
  if (empty) return <EmptyState />;
  return <div className={cn("transition-opacity", state.loading && "opacity-60")}>{state.error ? <ErrorBox error={state.error} onRetry={state.reload} /> : null}{children}</div>;
}

/* ------------------------------ modal ------------------------------ */
export function Modal({ open, onClose, title, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  const { t } = useSchool();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("input,select,textarea")?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button aria-label={t("close")} tabIndex={-1} className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <div ref={ref} className={cn("relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 sm:rounded-2xl", w)}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 id={titleId} className="text-base font-bold">{title}</h2>
          <button aria-label={t("close")} onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel, danger, onConfirm, onClose }: {
  open: boolean; title: string; text?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void;
}) {
  const { t } = useSchool();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open} onClose={() => !busy && onClose()} title={title} size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button
            variant={danger ? "danger" : "primary"} loading={busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(); } finally { setBusy(false); }
            }}
          >
            {confirmLabel ?? t("d_confirm")}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600 dark:text-slate-300">{text}</div>
    </Modal>
  );
}

/* ------------------------------ form fields ------------------------------ */
export function Field({ label, hint, error, required, children, className }: { label: string; hint?: string; error?: string | null; required?: boolean; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <FieldCtx.Provider value={id}>{children}</FieldCtx.Provider>
      {hint && !error && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
const FieldCtx = createContext<string | undefined>(undefined);
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useContext(FieldCtx);
  return <input id={id} {...props} className={cn(inputCls, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useContext(FieldCtx);
  return <textarea id={id} rows={3} {...props} className={cn(inputCls, props.className)} />;
}
export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useContext(FieldCtx);
  return <select id={id} {...props} className={cn(inputCls, "pr-8", props.className)}>{children}</select>;
}
/** a select with an `aria-label` instead of a visible label (filter bars) */
export function FilterSelect({ label, value, onChange, children, className }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select aria-label={label} title={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "w-auto min-w-32", className)}>
      {children}
    </select>
  );
}

/* ------------------------------ tabs ------------------------------ */
export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {tabs.map((tb) => (
        <button
          key={tb.key} role="tab" aria-selected={value === tb.key} onClick={() => onChange(tb.key)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition max-sm:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
            value === tb.key
              ? "border-indigo-600 text-indigo-700 dark:border-fuchsia-400 dark:text-fuchsia-300"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ cards / tables ------------------------------ */
export function Kpi({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "bad" | "good"; icon?: ReactNode }) {
  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon && <span className="text-slate-500 dark:text-slate-400">{icon}</span>}
      </div>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "bad" && "text-red-600 dark:text-red-400", tone === "warn" && "text-amber-600 dark:text-amber-400", tone === "good" && "text-emerald-600 dark:text-emerald-400")}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </Card>
  );
}
export function SectionCard({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}
export const tableCls = "w-full text-left text-sm";
export const thCls = "whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400";
export const tdCls = "border-b border-slate-100 px-3 py-2 align-middle dark:border-slate-800/70";
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800", className)}>{children}</div>;
}

export function PctBadge({ v, warn = 85 }: { v: number | null | undefined; warn?: number }) {
  if (v === null || v === undefined) return <span className="text-slate-500 dark:text-slate-400">-</span>;
  return <Badge tone={v >= 93 ? "green" : v >= warn ? "amber" : "red"}>{v.toFixed(1)}%</Badge>;
}
export function Spinner() {
  return <Loader2 className="size-4 animate-spin" />;
}

/* ------------------------------ formatting / misc ------------------------------ */
export const fmtDate = (d: string | null | undefined): string => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d ?? "");
export const fmtDateTime = (iso: string): string => (iso ? `${fmtDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : "");
export const fmtNum = (v: number | null | undefined, digits = 2): string => (v === null || v === undefined ? "-" : v.toFixed(digits));
export const studentName = (s: { last_name: string; first_name: string; middle_name?: string | null }) =>
  `${s.last_name} ${s.first_name}${s.middle_name ? ` ${s.middle_name}` : ""}`;

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** localized subject name helper bound to the active language */
export function useSubjectName() {
  const { L } = useSchool();
  return useMemo(() => (s: { name: Partial<Record<"uz" | "ru" | "en", string>> } | undefined) => (s ? L(s.name) : ""), [L]);
}

/* ------------------------------ export / print ------------------------------ */
export type Cell = string | number | null | undefined;
export async function exportXlsx(filename: string, sheets: { name: string; rows: Cell[][] }[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows.map((r) => r.map((c) => c ?? ""))), sh.name.slice(0, 31).replace(/[\\/?*[\]:]/g, "_") || "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
export const escapeHtml = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const PRINT_CSS = `
*{box-sizing:border-box}body{font:13px/1.45 "Segoe UI",Arial,sans-serif;color:#0f172a;margin:24px}
h1{font-size:20px;margin:0 0 2px;color:#1d3557}h2{font-size:15px;margin:18px 0 6px;color:#1d3557}.muted{color:#64748b}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:4px 7px;text-align:left}th{background:#eef2f7;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
td.c,th.c{text-align:center}.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #f4b942;padding-bottom:8px;margin-bottom:10px}
.page{page-break-after:always}.page:last-child{page-break-after:auto}.sig{display:flex;gap:40px;margin-top:36px}.sig div{flex:1;border-top:1px solid #64748b;padding-top:4px;font-size:11px;color:#64748b}
.g5{background:#d1fae5}.g4{background:#dbeafe}.g3{background:#fef3c7}.g2,.g1{background:#fee2e2}
@page{margin:12mm}@media print{body{margin:0}.noprint{display:none}}
`;
/** Opens a standalone printable document in a new window and starts the print dialog. Returns false when the popup was blocked. */
export function printHtml(title: string, bodyHtml: string, landscape = false): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}${landscape ? "@page{size:A4 landscape}" : ""}</style></head><body>${bodyHtml}<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})</script></body></html>`);
  w.document.close();
  return true;
}
