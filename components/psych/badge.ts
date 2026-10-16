import type { CSSProperties } from "react";

const NAMED: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
  yellow: "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  amber: "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  orange: "bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-800",
  red: "bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800",
  blue: "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  purple: "bg-violet-100 text-violet-800 ring-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
  indigo: "bg-indigo-100 text-indigo-800 ring-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800",
};

/** Maps a badge_color (token name or #hex) to Tailwind classes and/or inline style. */
export function badgeStyle(color: string): { className: string; style?: CSSProperties } {
  const key = color.trim().toLowerCase();
  if (NAMED[key]) return { className: NAMED[key] };
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(key)) {
    const hex = key.length === 4 ? `#${key[1]}${key[1]}${key[2]}${key[2]}${key[3]}${key[3]}` : key;
    return { className: "ring-1 text-slate-900", style: { backgroundColor: `${hex}33`, boxShadow: `inset 0 0 0 2px ${hex}` } };
  }
  return { className: NAMED.blue };
}
