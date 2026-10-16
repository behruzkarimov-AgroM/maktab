"use client";

// Minimal shared UI kit for the school portal (navy theme: indigo-* = navy, violet-* = steel blue, fuchsia/amber = gold).
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/admin/cn";

export { cn };

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm max-sm:min-h-11 text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800/60";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
export function Button({
  variant = "secondary", size = "md", loading, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "icon"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-2.5 py-1.5 text-xs max-sm:min-h-11",
        size === "md" && "px-3.5 py-2 text-sm max-sm:min-h-11",
        size === "icon" && "size-8 p-0 text-sm max-sm:size-11",
        variant === "primary" && "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500",
        variant === "gold" && "bg-fuchsia-400 text-slate-900 shadow-sm hover:bg-fuchsia-300",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        variant === "danger" && "bg-red-600 text-white shadow-sm hover:bg-red-500",
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

const tones = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  navy: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900", className)}>{children}</div>;
}

/** tone per attendance status (shared so every portal colours statuses the same way) */
export const STATUS_TONE: Record<string, Tone> = { present: "green", late: "amber", absent: "red", excused: "blue", sick: "navy" };
/** colour for a 1..5 grade */
export const gradeTone = (v: number | null): Tone => (v === null ? "gray" : v >= 4.5 ? "green" : v >= 3.5 ? "blue" : v >= 2.5 ? "amber" : "red");
