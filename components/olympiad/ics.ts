import { tr, type Locale } from "@/lib/types";
import type { OlympiadStrings } from "./i18n";
import type { Olympiad } from "./types";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);

/** Builds an .ics file for the olympiad (2h event + 1 day reminder). Contains no personal data. */
export function buildIcs(o: Olympiad, locale: Locale, t: OlympiadStrings): string {
  const start = new Date(o.eventDate);
  const end = new Date(start.getTime() + 2 * 3600_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//maktab//olympiad//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${o.id}@maktab`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(tr(o.title, locale))}`,
    `DESCRIPTION:${esc(tr(o.description, locale))}`,
    `LOCATION:${esc(tr(o.location, locale))}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(t.reminder)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(o: Olympiad, locale: Locale, t: OlympiadStrings) {
  const blob = new Blob([buildIcs(o, locale, t)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "olympiad.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
