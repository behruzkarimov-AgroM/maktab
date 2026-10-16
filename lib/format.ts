/**
 * Locale-aware date/number formatting. The "uz" locale has no month names in many ICU builds
 * (renders "2026 M10 29"), so uz uses an explicit table; ru/en go through Intl.
 */
export type FmtLocale = "uz" | "ru" | "en" | string;

export const TZ = "Asia/Tashkent";

export const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

const INTL_LOCALE: Record<string, string> = { ru: "ru-RU", en: "en-GB" };

function toDate(v: Date | string | number): Date | null {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

type Parts = { y: number; m: number; d: number; hh: string; mm: string };

function tashkentParts(d: Date): Parts {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), hh: o.hour.padStart(2, "0"), mm: o.minute.padStart(2, "0") };
}

/** "29 oktabr 2026" / "29 октября 2026 г." / "29 October 2026" */
export function formatDate(locale: FmtLocale, value: Date | string | number, opts: { month?: "long" | "short" } = {}): string {
  const d = toDate(value);
  if (!d) return "";
  if (locale === "uz") {
    const p = tashkentParts(d);
    const name = UZ_MONTHS[p.m - 1];
    return `${p.d} ${opts.month === "short" ? name.slice(0, 3) : name} ${p.y}`;
  }
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? "en-GB", {
    timeZone: TZ, day: "numeric", month: opts.month ?? "long", year: "numeric",
  }).format(d);
}

export function formatTime(locale: FmtLocale, value: Date | string | number): string {
  const d = toDate(value);
  if (!d) return "";
  const p = tashkentParts(d);
  return `${p.hh}:${p.mm}`;
}

/** Date + time, e.g. "29 oktabr 2026, 12:33". */
export function formatDateTime(locale: FmtLocale, value: Date | string | number, opts: { month?: "long" | "short" } = {}): string {
  const d = toDate(value);
  if (!d) return "";
  return `${formatDate(locale, d, opts)}, ${formatTime(locale, d)}`;
}

/** Number with a locale-appropriate grouping (non-breaking-space friendly). */
export function formatNumber(locale: FmtLocale, value: number, opts: Intl.NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return "";
  const tag = locale === "uz" ? "ru-RU" : (INTL_LOCALE[locale] ?? "en-GB");
  const s = new Intl.NumberFormat(tag, opts).format(value);
  return locale === "uz" || locale === "ru" ? s.replace(/[  ]/g, " ") : s;
}
