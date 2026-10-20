"use client";

import { useState } from "react";
import { downloadIcs } from "./ics";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, List, MapPin, Clock } from "lucide-react";
import { tr, type Locale } from "@/lib/types";
import { fmtDate, fmtMonthYear, type OlympiadStrings } from "./i18n";
import type { Olympiad } from "./types";

export function olympiadState(o: Olympiad, now: number | null): "open" | "closed" | "finished" {
  const n = now ?? 0;
  if (now !== null && new Date(o.eventDate).getTime() < n) return "finished";
  if (!o.isRegistrationOpen) return "closed";
  if (now !== null && new Date(o.registrationDeadline).getTime() < n) return "closed";
  return "open";
}

interface Props {
  olympiads: Olympiad[];
  locale: Locale;
  t: OlympiadStrings;
  now: number | null;
  onRegister: (id: string) => void;
  onCheck: () => void;
}

export function OlympiadList({ olympiads, locale, t, now, onRegister, onCheck }: Props) {
  const [view, setView] = useState<"list" | "calendar">("list");
  return (
    <div>
      <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5" role="group">
        {(
          [
            ["list", t.viewList, List],
            ["calendar", t.viewCalendar, CalendarDays],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            aria-pressed={view === k}
            onClick={() => setView(k)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              view === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {olympiads.length === 0 && <p className="text-slate-500 dark:text-slate-400">{t.empty}</p>}

      {view === "list" ? (
        <ul className="grid gap-5 md:grid-cols-2">
          {olympiads.map((o) => {
            const st = olympiadState(o, now);
            return (
              <li
                key={o.id}
                className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      st === "open"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : st === "closed"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                          : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                    }`}
                  >
                    {st === "open" ? t.open : st === "closed" ? t.closed : t.finished}
                  </span>
                  {o.isResultsPublished && (
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">
                      {t.resultsOut}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{tr(o.title, locale)}</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{tr(o.description, locale)}</p>
                <dl className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                    <dt className="sr-only">{t.eventDate}</dt>
                    <dd>{fmtDate(o.eventDate, locale, true)}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                    <dt className="font-medium">{t.deadline}:</dt>
                    <dd>{fmtDate(o.registrationDeadline, locale)}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                    <dt className="sr-only">{t.location}</dt>
                    <dd>{tr(o.location, locale)}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-medium">{t.grades}:</dt>
                    <dd>{o.eligibleGrades.join(", ")}</dd>
                  </div>
                </dl>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">
                  {o.subjects.map((s) => (
                    <li key={s.key} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs dark:bg-white/10">
                      {tr(s.name, locale)}
                    </li>
                  ))}
                </ul>
                {o.rules && (
                  <details className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <summary className="cursor-pointer font-medium">{t.rules}</summary>
                    <p className="mt-1">{tr(o.rules, locale)}</p>
                  </details>
                )}
                <div className="mt-5 flex flex-wrap gap-2 pt-1">
                  {st !== "finished" && (
                    <button
                      type="button"
                      onClick={() => downloadIcs(o, locale, t)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                    >
                      <CalendarPlus className="h-4 w-4" aria-hidden /> {t.addToCalendar}
                    </button>
                  )}
                  {st === "open" ? (
                    <button
                      type="button"
                      onClick={() => onRegister(o.id)}
                      className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    >
                      {t.registerBtn}
                    </button>
                  ) : o.isResultsPublished ? (
                    <button
                      type="button"
                      onClick={onCheck}
                      className="rounded-xl border border-indigo-600 px-5 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-white/10"
                    >
                      {t.checkBtn}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <CalendarView olympiads={olympiads} locale={locale} t={t} now={now} />
      )}
    </div>
  );
}

/** `now` comes from the page clock (null before mount): no Date.now() during render, so server and client markup agree. */
function CalendarView({ olympiads, locale, t, now }: { olympiads: Olympiad[]; locale: Locale; t: OlympiadStrings; now: number | null }) {
  // opens on the month of the next olympiad (only the initial month: later the user moves the cursor)
  const [cursor, setCursor] = useState(() => {
    const dates = olympiads.map((o) => new Date(o.eventDate).getTime()).sort((a, b) => a - b);
    const upcoming = (now !== null ? dates.find((d) => d >= now - 86400000) : undefined) ?? dates[0] ?? now ?? 0;
    const d = new Date(upcoming + 5 * 3600000); // Tashkent calendar month, same shift as the day keys below
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  const monthName = fmtMonthYear(locale, cursor.y, cursor.m);
  const offset = (new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay() + 6) % 7; // Monday first
  const daysIn = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();

  // Tashkent is UTC+5 with no DST; shift so dates match local calendar day.
  const key = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 5 * 3600000);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  };
  const events = new Map<string, Olympiad[]>();
  const deadlines = new Map<string, Olympiad[]>();
  for (const o of olympiads) {
    const e = key(o.eventDate);
    events.set(e, [...(events.get(e) ?? []), o]);
    const d = key(o.registrationDeadline);
    deadlines.set(d, [...(deadlines.get(d) ?? []), o]);
  }

  const move = (delta: number) =>
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" aria-label={t.prev} onClick={() => move(-1)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <h3 className="text-lg font-bold capitalize text-slate-900 dark:text-white">{monthName}</h3>
        <button type="button" aria-label={t.next} onClick={() => move(1)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
        {t.weekdays.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const k = `${cursor.y}-${cursor.m}-${day}`;
          const ev = events.get(k);
          const dl = deadlines.get(k);
          const title = [...(ev ?? []).map((o) => `${t.legendEvent}: ${tr(o.title, locale)}`), ...(dl ?? []).map((o) => `${t.legendDeadline}: ${tr(o.title, locale)}`)].join("; ");
          return (
            <div
              key={k}
              title={title || undefined}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm ${
                ev
                  ? "bg-indigo-600 font-bold text-white"
                  : dl
                    ? "bg-amber-100 font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                    : "text-slate-700 dark:text-slate-200"
              }`}
            >
              {day}
              {(ev || dl) && <span className="sr-only">{title}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-indigo-600" aria-hidden /> {t.legendEvent}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-amber-300" aria-hidden /> {t.legendDeadline}
        </span>
      </div>
    </div>
  );
}
