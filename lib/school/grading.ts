// Pure grading / analytics helpers (client-safe, no I/O). Used by the service layer, demo generator, UI and tests.
import type { AttendanceRecord, AttendanceStatus, GradeEntry, GradeKind, GradingRules, RiskFlag } from "./types";

export const DEFAULT_RULES: GradingRules = {
  rounding: "half_up",
  excludeKinds: ["term", "year"],
  defaultWeights: { daily: 1, quiz: 1, homework: 0.5, test: 2, exam: 3, term: 1, year: 1 },
  minEntries: 3,
  attendanceRiskPct: 85,
  averageRisk: 3,
  absenceStreak: 3,
};

export function resolveRules(partial?: Partial<GradingRules> | null): GradingRules {
  return {
    ...DEFAULT_RULES,
    ...(partial ?? {}),
    defaultWeights: { ...DEFAULT_RULES.defaultWeights, ...(partial?.defaultWeights ?? {}) },
    excludeKinds: partial?.excludeKinds ?? DEFAULT_RULES.excludeKinds,
  };
}

/** Half-up rounding to `digits` decimals (avoids binary float artefacts: 2.675 -> 2.68, 3.5 -> 4). */
export function roundHalfUp(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f + 1e-9) / f;
}

export const clampGrade = (n: number) => Math.min(5, Math.max(1, n));

/** Weighted mean of `score` by `weight`. Returns null when there is nothing to average. */
export function weightedAverage(entries: Pick<GradeEntry, "score" | "weight" | "kind">[], rules: GradingRules = DEFAULT_RULES): number | null {
  let sum = 0;
  let w = 0;
  for (const e of entries) {
    if (rules.excludeKinds.includes(e.kind)) continue;
    const weight = e.weight > 0 ? e.weight : 1;
    sum += e.score * weight;
    w += weight;
  }
  return w > 0 ? sum / w : null;
}

/** Average rounded to 2 decimals (display / API value). */
export function average2(entries: Pick<GradeEntry, "score" | "weight" | "kind">[], rules: GradingRules = DEFAULT_RULES): number | null {
  const a = weightedAverage(entries, rules);
  return a === null ? null : roundHalfUp(a, 2);
}

/**
 * Term grade suggestion: weighted average of the term's entries rounded half up to an integer 1..5.
 * Returns null when fewer than `rules.minEntries` counted entries exist.
 */
export function suggestTermGrade(
  entries: Pick<GradeEntry, "score" | "weight" | "kind">[],
  rules: GradingRules = DEFAULT_RULES,
): { average: number; grade: number } | null {
  const counted = entries.filter((e) => !rules.excludeKinds.includes(e.kind));
  if (counted.length < rules.minEntries) return null;
  const avg = weightedAverage(counted, rules);
  if (avg === null) return null;
  return { average: roundHalfUp(avg, 2), grade: clampGrade(Math.round(roundHalfUp(avg, 6))) };
}

/** Year grade = mean of the term grades (confirmed value, else suggestion) rounded half up. */
export function yearGrade(termValues: (number | null | undefined)[]): number | null {
  const v = termValues.filter((x): x is number => typeof x === "number");
  if (v.length === 0) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return clampGrade(Math.round(roundHalfUp(m, 6)));
}

/** GPA on the 5-point scale: mean of subject grades, 2 decimals. */
export function gpa(subjectGrades: (number | null | undefined)[]): number | null {
  const v = subjectGrades.filter((x): x is number => typeof x === "number");
  return v.length ? roundHalfUp(v.reduce((a, b) => a + b, 0) / v.length, 2) : null;
}

/** Percent representation of a 5-point average: avg / 5 * 100, one decimal. */
export function toPercent(avg: number | null): number | null {
  return avg === null ? null : roundHalfUp((avg / 5) * 100, 1);
}

/** Competition ranking ("1224"): equal averages share a rank; null averages are unranked. */
export function rankBy<T>(items: T[], value: (t: T) => number | null): Map<T, number | null> {
  const ranked = items.filter((i) => value(i) !== null).sort((a, b) => (value(b) as number) - (value(a) as number));
  const out = new Map<T, number | null>();
  let rank = 0;
  let prev: number | null = null;
  ranked.forEach((it, i) => {
    const v = value(it) as number;
    if (prev === null || Math.abs(v - prev) > 1e-9) rank = i + 1;
    prev = v;
    out.set(it, rank);
  });
  for (const it of items) if (!out.has(it)) out.set(it, null);
  return out;
}

/* ------------------------------ attendance ------------------------------ */

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
  sick: number;
  total: number;
  /** (present + late) / total, 1 decimal; null when total = 0 */
  percent: number | null;
}

export function countAttendance(rows: Pick<AttendanceRecord, "status">[]): AttendanceCounts {
  const c: AttendanceCounts = { present: 0, absent: 0, late: 0, excused: 0, sick: 0, total: rows.length, percent: null };
  for (const r of rows) c[r.status] += 1;
  c.percent = c.total ? roundHalfUp(((c.present + c.late) / c.total) * 100, 1) : null;
  return c;
}

/** One status per calendar day: a day is `absent` only when every record that day is `absent`. */
export function dayStatuses(rows: Pick<AttendanceRecord, "date" | "status">[]): { date: string; status: AttendanceStatus }[] {
  const byDate = new Map<string, AttendanceStatus[]>();
  for (const r of rows) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r.status);
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, st]) => {
      if (st.every((s) => s === "absent")) return { date, status: "absent" as const };
      if (st.some((s) => s === "present")) return { date, status: "present" as const };
      if (st.some((s) => s === "late")) return { date, status: "late" as const };
      return { date, status: st.find((s) => s === "sick" || s === "excused") ?? st[0] };
    });
}

/** Trailing run of consecutive marked days with status `absent` (unexcused). */
export function absenceStreak(rows: Pick<AttendanceRecord, "date" | "status">[]): number {
  const days = dayStatuses(rows);
  let n = 0;
  for (let i = days.length - 1; i >= 0 && days[i].status === "absent"; i--) n++;
  return n;
}

/** Risk flags: attendance below threshold, weighted average below threshold, trailing absence streak. */
export function computeRisk(
  input: { attendancePercent: number | null; attendanceTotal: number; average: number | null; gradeCount: number; streak: number },
  rules: GradingRules = DEFAULT_RULES,
): RiskFlag[] {
  const out: RiskFlag[] = [];
  if (input.attendancePercent !== null && input.attendanceTotal >= 5 && input.attendancePercent < rules.attendanceRiskPct) out.push("low_attendance");
  if (input.average !== null && input.gradeCount >= rules.minEntries && input.average < rules.averageRisk) out.push("low_average");
  if (input.streak >= rules.absenceStreak) out.push("absence_streak");
  return out;
}

/* ------------------------------ dates ------------------------------ */

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
/** Asia/Tashkent calendar date (UTC+5, no DST) */
export function tashkentToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
/** 1 = Monday ... 7 = Sunday */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
export const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && isoDate(new Date(`${s}T00:00:00Z`)) === s;

export const KIND_ORDER: GradeKind[] = ["daily", "homework", "quiz", "test", "exam", "term", "year"];
