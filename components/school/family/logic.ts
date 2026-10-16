// Pure helpers of the parent / student cabinet (no React, no I/O): calendar, streaks, trends, summaries, alerts, badges.
import type { AttendanceStatus, RiskFlag } from "@/lib/school/types";

export type DayRow = { date: string; status: AttendanceStatus };

/* ------------------------------ dates ------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysIso = (date: string, n: number) => {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
/** 1 = Monday ... 7 = Sunday */
export const weekdayIso = (date: string) => {
  const d = utc(date).getUTCDay();
  return d === 0 ? 7 : d;
};
export const monthOf = (date: string) => date.slice(0, 7);
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}
export const mondayOf = (date: string) => addDaysIso(date, 1 - weekdayIso(date));

/* ------------------------------ attendance calendar ------------------------------ */

export interface CalCell {
  date: string;
  day: number;
  inMonth: boolean;
  status: AttendanceStatus | null;
  isToday: boolean;
  isFuture: boolean;
  weekend: boolean;
}

/** Monday-first weeks (arrays of 7) covering `month` ("YYYY-MM"). */
export function buildMonthGrid(month: string, statusByDate: Record<string, AttendanceStatus | undefined>, today: string): CalCell[][] {
  const { from, to } = monthBounds(month);
  const start = mondayOf(from);
  const weeks: CalCell[][] = [];
  let cur = start;
  while (cur <= to || weeks.length === 0) {
    const week: CalCell[] = [];
    for (let i = 0; i < 7; i++) {
      const inMonth = cur >= from && cur <= to;
      week.push({
        date: cur, day: Number(cur.slice(8)), inMonth, status: inMonth ? statusByDate[cur] ?? null : null,
        isToday: cur === today, isFuture: cur > today, weekend: weekdayIso(cur) >= 6,
      });
      cur = addDaysIso(cur, 1);
    }
    weeks.push(week);
    if (cur > to && weeks.length >= 4) break;
  }
  return weeks;
}

export function toStatusMap(days: DayRow[]): Record<string, AttendanceStatus> {
  const m: Record<string, AttendanceStatus> = {};
  for (const d of days) m[d.date] = d.status;
  return m;
}

export interface Counts {
  present: number; absent: number; late: number; excused: number; sick: number; total: number; percent: number | null;
}
export function countDays(rows: { status: AttendanceStatus }[]): Counts {
  const c: Counts = { present: 0, absent: 0, late: 0, excused: 0, sick: 0, total: rows.length, percent: null };
  for (const r of rows) c[r.status] += 1;
  c.percent = c.total ? Math.round(((c.present + c.late) / c.total) * 1000) / 10 : null;
  return c;
}

export interface TermLike { id: string; number: number; start_date: string; end_date: string }
/** attendance totals per term (by day statuses) */
export function termTotals(days: DayRow[], terms: TermLike[]): { term: TermLike; counts: Counts }[] {
  return terms.map((t) => ({ term: t, counts: countDays(days.filter((d) => d.date >= t.start_date && d.date <= t.end_date)) }));
}
export const termOfDate = (terms: TermLike[], date: string) => terms.find((t) => date >= t.start_date && date <= t.end_date) ?? null;

/* ------------------------------ streaks ------------------------------ */

const ATTENDED = new Set<AttendanceStatus>(["present", "late"]);

/** trailing run of days without an absence of any kind (present or late) */
export function currentAttendanceStreak(days: DayRow[]): number {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  let n = 0;
  for (let i = sorted.length - 1; i >= 0 && ATTENDED.has(sorted[i].status); i--) n++;
  return n;
}
export function bestAttendanceStreak(days: DayRow[]): number {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  let best = 0;
  let run = 0;
  for (const d of sorted) {
    run = ATTENDED.has(d.status) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
/** Mondays of weeks where every marked Mon-Fri day was present (>= 5 marked days) */
export function perfectWeeks(days: DayRow[]): string[] {
  const byWeek = new Map<string, DayRow[]>();
  for (const d of days) {
    if (weekdayIso(d.date) > 5) continue;
    const k = mondayOf(d.date);
    (byWeek.get(k) ?? byWeek.set(k, []).get(k)!).push(d);
  }
  return [...byWeek.entries()].filter(([, r]) => r.length >= 5 && r.every((x) => x.status === "present")).map(([k]) => k).sort();
}
/** trailing count of consecutive grade scores >= min (grades sorted by date asc) */
export function goodGradeStreak(scores: number[], min = 4): number {
  let n = 0;
  for (let i = scores.length - 1; i >= 0 && scores[i] >= min; i--) n++;
  return n;
}

/* ------------------------------ grades ------------------------------ */

export type Trend = "up" | "down" | "flat" | "none";
export function trendOf(prev: number | null | undefined, cur: number | null | undefined, eps = 0.05): { dir: Trend; delta: number } {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return { dir: "none", delta: 0 };
  const delta = Math.round((cur - prev) * 100) / 100;
  return { dir: Math.abs(delta) < eps ? "flat" : delta > 0 ? "up" : "down", delta };
}
/** last two terms having an average -> trend of the latest one */
export function termTrend(points: { average: number | null }[]): { dir: Trend; delta: number; current: number | null } {
  const withData = points.filter((p) => p.average !== null).map((p) => p.average as number);
  const current = withData.length ? withData[withData.length - 1] : null;
  const t = trendOf(withData.length > 1 ? withData[withData.length - 2] : null, current);
  return { ...t, current };
}

export const fmtGpa = (n: number | null | undefined, digits = 2) => (n === null || n === undefined || Number.isNaN(n) ? "-" : n.toFixed(digits));
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `${Number.isInteger(n) ? n : n.toFixed(1)}%`);

/** Compact SVG polyline points for a sparkline. */
export function sparkPoints(values: number[], w = 80, h = 24, min = 1, max = 5): string {
  if (values.length === 0) return "";
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values.map((v, i) => `${(values.length > 1 ? i * step : w / 2).toFixed(1)},${(h - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * h).toFixed(1)}`).join(" ");
}

/** running average after each entry (entries sorted by date asc) -> trend values for sparkline */
export function runningAverage(entries: { score: number; weight: number }[]): number[] {
  const out: number[] = [];
  let s = 0;
  let w = 0;
  for (const e of entries) {
    const wt = e.weight > 0 ? e.weight : 1;
    s += e.score * wt;
    w += wt;
    out.push(s / w);
  }
  return out;
}

export interface SubjLike { subject_id: string; average: number | null; term_values: (number | null)[]; count: number }
/** strengths (high average) and needs-attention (low average or falling) subject ids */
export function summarizeSubjects(subs: SubjLike[]): { strengths: string[]; attention: string[]; falling: string[] } {
  const withAvg = subs.filter((s) => s.average !== null && s.count >= 3);
  const strengths = [...withAvg].filter((s) => (s.average as number) >= 4.3).sort((a, b) => (b.average as number) - (a.average as number)).slice(0, 3).map((s) => s.subject_id);
  const attention = [...withAvg].filter((s) => (s.average as number) < 3.5).sort((a, b) => (a.average as number) - (b.average as number)).slice(0, 3).map((s) => s.subject_id);
  const falling = withAvg
    .filter((s) => {
      const vals = s.term_values.filter((v): v is number => typeof v === "number");
      return vals.length >= 2 && vals[vals.length - 1] < vals[vals.length - 2] && !attention.includes(s.subject_id);
    })
    .map((s) => s.subject_id)
    .slice(0, 3);
  return { strengths, attention, falling };
}

/* ------------------------------ alerts ------------------------------ */

export type AlertKind = "absent_today" | "streak" | "low_attendance" | "low_average" | "low_grade" | "unexcused";
export interface Alert { kind: AlertKind; severity: "high" | "mid"; n?: number; subject_id?: string; date?: string; value?: number }

export function buildAlerts(i: {
  risk: RiskFlag[]; streak: number; attendancePercent: number | null; average: number | null;
  todayStatus: AttendanceStatus | null; recentLow: { subject_id: string; date: string; score: number }[]; unexcusedRecent: number;
}): Alert[] {
  const out: Alert[] = [];
  if (i.todayStatus === "absent") out.push({ kind: "absent_today", severity: "high" });
  if (i.risk.includes("absence_streak")) out.push({ kind: "streak", severity: "high", n: i.streak });
  if (i.risk.includes("low_attendance")) out.push({ kind: "low_attendance", severity: "mid", value: i.attendancePercent ?? undefined });
  if (i.risk.includes("low_average")) out.push({ kind: "low_average", severity: "mid", value: i.average ?? undefined });
  for (const g of i.recentLow.slice(0, 2)) out.push({ kind: "low_grade", severity: "mid", subject_id: g.subject_id, date: g.date, value: g.score });
  if (i.unexcusedRecent > 0 && !out.some((a) => a.kind === "streak")) out.push({ kind: "unexcused", severity: "mid", n: i.unexcusedRecent });
  return out;
}

/* ------------------------------ badges ------------------------------ */

export type BadgeKey = "perfect_week" | "star" | "streak10" | "streak20" | "attendance95" | "improver" | "straight_a";
export interface BadgeInfo { key: BadgeKey; earned: boolean; progress: number; target: number }

export function computeBadges(i: {
  days: DayRow[]; scores: number[]; attendancePercent: number | null; trendDir: Trend;
}): BadgeInfo[] {
  const weeks = perfectWeeks(i.days).length;
  const best = bestAttendanceStreak(i.days);
  const fives = i.scores.filter((s) => s >= 5).length;
  const good = goodGradeStreak(i.scores, 4);
  return [
    { key: "perfect_week", earned: weeks >= 1, progress: Math.min(weeks, 1), target: 1 },
    { key: "star", earned: fives >= 1, progress: Math.min(fives, 1), target: 1 },
    { key: "streak10", earned: best >= 10, progress: Math.min(best, 10), target: 10 },
    { key: "streak20", earned: best >= 20, progress: Math.min(best, 20), target: 20 },
    { key: "attendance95", earned: (i.attendancePercent ?? 0) >= 95, progress: Math.min(Math.round(i.attendancePercent ?? 0), 95), target: 95 },
    { key: "improver", earned: i.trendDir === "up", progress: i.trendDir === "up" ? 1 : 0, target: 1 },
    { key: "straight_a", earned: good >= 5, progress: Math.min(good, 5), target: 5 },
  ];
}

export interface Achievement { date: string; kind: "five" | "perfect_week"; subject_id?: string }
/** newest-first timeline of notable moments */
export function buildTimeline(days: DayRow[], grades: { date: string; score: number; subject_id: string }[], limit = 12): Achievement[] {
  const items: Achievement[] = [
    ...grades.filter((g) => g.score >= 5).map((g) => ({ date: g.date, kind: "five" as const, subject_id: g.subject_id })),
    ...perfectWeeks(days).map((m) => ({ date: addDaysIso(m, 4), kind: "perfect_week" as const })),
  ];
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit);
}

/* ------------------------------ goals (localStorage payload) ------------------------------ */

export interface Goals { average: number; attendance: number }
export const DEFAULT_GOALS: Goals = { average: 4.5, attendance: 95 };
export function parseGoals(raw: string | null): Goals {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Goals>) : {};
    const avg = Number(v.average);
    const att = Number(v.attendance);
    return {
      average: Number.isFinite(avg) && avg >= 2 && avg <= 5 ? avg : DEFAULT_GOALS.average,
      attendance: Number.isFinite(att) && att >= 50 && att <= 100 ? att : DEFAULT_GOALS.attendance,
    };
  } catch {
    return DEFAULT_GOALS;
  }
}
export const ratio = (value: number | null, goal: number) => (value === null || goal <= 0 ? 0 : Math.max(0, Math.min(1, value / goal)));

/** replaces {name} placeholders */
export const fmt = (s: string, vars: Record<string, string | number | null | undefined> = {}) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])));

/* ------------------------------ schedule / homework ------------------------------ */

export function nextSchoolDay(date: string): string {
  let d = date;
  while (weekdayIso(d) > 5) d = addDaysIso(d, 1);
  return d;
}
