"use client";

import type { ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Check, Clock, FileCheck2, HeartPulse, Inbox, RefreshCw, X } from "lucide-react";
import type { AttendanceStatus } from "@/lib/school/types";
import { Button, Card, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { sparkPoints, type Trend } from "./logic";

/** status -> icon + colours. Colour is never the only signal: every status has its own icon and a text label. */
export const STATUS_VIEW: Record<AttendanceStatus, { icon: typeof Check; cell: string; dot: string }> = {
  present: { icon: Check, cell: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200", dot: "bg-emerald-500" },
  absent: { icon: X, cell: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200", dot: "bg-red-500" },
  late: { icon: Clock, cell: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200", dot: "bg-amber-500" },
  excused: { icon: FileCheck2, cell: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200", dot: "bg-sky-500" },
  sick: { icon: HeartPulse, cell: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200", dot: "bg-indigo-500" },
};

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800", className)} />;
}

export function PageSkeleton() {
  const { t } = useSchool();
  return (
    <div className="space-y-4" role="status" aria-label={t("loading")}>
      <Skeleton className="h-28" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useSchool();
  return (
    <Card className="flex flex-col items-center gap-3 text-center" >
      <div role="alert" className="flex flex-col items-center gap-2">
        <AlertTriangle className="size-8 text-amber-500" />
        <p className="text-sm text-slate-700 dark:text-slate-300">{message}</p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} size="sm">
          <RefreshCw className="size-3.5" />
          {t("retry")}
        </Button>
      )}
    </Card>
  );
}

export function EmptyBox({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {icon ?? <Inbox className="size-8 opacity-60" />}
      <p>{text}</p>
    </div>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">{title}</h1>
        {sub && <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Kpi({ label, value, hint, icon, tone = "navy" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "navy" | "green" | "amber" | "red" | "gold" }) {
  const ring = { navy: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200", green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200", amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200", red: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200", gold: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300" }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon && <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", ring)}>{icon}</span>}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
      {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </Card>
  );
}

export function TrendIcon({ dir, className }: { dir: Trend; className?: string }) {
  const { t } = useSchool();
  if (dir === "up") return <ArrowUpRight aria-label={t("f_trendUp")} className={cn("size-4 text-emerald-600", className)} />;
  if (dir === "down") return <ArrowDownRight aria-label={t("f_trendDown")} className={cn("size-4 text-red-600", className)} />;
  if (dir === "flat") return <ArrowRight aria-label={t("f_trendFlat")} className={cn("size-4 text-slate-500 dark:text-slate-400", className)} />;
  return null;
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <span className="text-xs text-slate-500 dark:text-slate-400">-</span>;
  const pts = sparkPoints(values.slice(-14), 80, 24);
  const last = values[values.length - 1];
  const tone = last >= 4.5 ? "stroke-emerald-500" : last >= 3.5 ? "stroke-sky-500" : last >= 2.5 ? "stroke-amber-500" : "stroke-red-500";
  return (
    <svg viewBox="-2 -2 84 28" className={cn("h-6 w-20", className)} aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={tone} />
    </svg>
  );
}

/** progress ring (0..1) with centre label */
export function Ring({ value, label, sub, size = 96, color = "stroke-indigo-600 dark:stroke-indigo-400" }: { value: number; label: ReactNode; sub?: string; size?: number; color?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-700" />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} className={cn("transition-all duration-700", color)} />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">{label}</div>
      </div>
      {sub && <p className="max-w-28 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}
