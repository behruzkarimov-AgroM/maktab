import { describe, expect, it } from "vitest";
import {
  absenceStreak, average2, computeRisk, countAttendance, DEFAULT_RULES, gpa, rankBy, roundHalfUp, suggestTermGrade, toPercent, weightedAverage, yearGrade,
} from "@/lib/school/grading";
import type { AttendanceStatus, GradeEntry } from "@/lib/school/types";

const e = (score: number, weight = 1, kind: GradeEntry["kind"] = "daily") => ({ score, weight, kind });
const day = (date: string, status: AttendanceStatus) => ({ date, status });

describe("rounding", () => {
  it("rounds half up", () => {
    expect(roundHalfUp(3.5)).toBe(4);
    expect(roundHalfUp(4.49)).toBe(4);
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
  });
});

describe("weighted average / term grade", () => {
  it("weights entries", () => {
    expect(weightedAverage([e(5), e(3, 2)])).toBeCloseTo(11 / 3, 6);
    expect(average2([e(5), e(3, 2)])).toBe(3.67);
  });
  it("ignores term/year final entries", () => {
    expect(weightedAverage([e(5), e(2, 1, "term"), e(2, 1, "year")])).toBe(5);
    expect(weightedAverage([e(2, 1, "term")])).toBeNull();
  });
  it("suggests a rounded-half-up grade only with enough entries", () => {
    expect(suggestTermGrade([e(5), e(4)])).toBeNull();
    expect(suggestTermGrade([e(5), e(4), e(3), e(4)])).toEqual({ average: 4, grade: 4 });
    expect(suggestTermGrade([e(4), e(4), e(3), e(3)])?.grade).toBe(4); // 3.5 -> 4
    expect(suggestTermGrade([e(4), e(3), e(3), e(3)])?.grade).toBe(3); // 3.25 -> 3
    expect(suggestTermGrade([e(5), e(5), e(5), e(2, 3, "exam")])?.grade).toBe(4); // (15+6)/6 = 3.5 -> 4
  });
  it("honours custom minEntries", () => {
    expect(suggestTermGrade([e(5), e(4)], { ...DEFAULT_RULES, minEntries: 2 })?.grade).toBe(5); // 4.5 -> 5
  });
  it("year grade = mean of term values, half up", () => {
    expect(yearGrade([4, 5, null, 4])).toBe(4);
    expect(yearGrade([3, 4])).toBe(4);
    expect(yearGrade([null, undefined])).toBeNull();
  });
  it("gpa / percent", () => {
    expect(gpa([5, 4, null, 4])).toBe(4.33);
    expect(gpa([])).toBeNull();
    expect(toPercent(4.5)).toBe(90);
    expect(toPercent(null)).toBeNull();
  });
});

describe("ranking", () => {
  it("uses competition ranking and leaves nulls unranked", () => {
    const items = [{ n: "a", v: 4.5 }, { n: "b", v: 4.8 }, { n: "c", v: 4.5 }, { n: "d", v: null as number | null }, { n: "e", v: 3 }];
    const r = rankBy(items, (x) => x.v);
    expect(items.map((i) => r.get(i))).toEqual([2, 1, 2, null, 4]);
  });
});

describe("attendance + risk flags", () => {
  it("counts statuses; percent = (present+late)/total", () => {
    const k = countAttendance([{ status: "present" }, { status: "late" }, { status: "absent" }, { status: "sick" }]);
    expect(k).toMatchObject({ present: 1, late: 1, absent: 1, sick: 1, total: 4, percent: 50 });
    expect(countAttendance([]).percent).toBeNull();
  });
  it("trailing absent streak only counts unexcused absences and is per day", () => {
    expect(absenceStreak([day("2026-10-01", "present"), day("2026-10-02", "absent"), day("2026-10-03", "absent"), day("2026-10-04", "absent")])).toBe(3);
    expect(absenceStreak([day("2026-10-01", "absent"), day("2026-10-02", "absent"), day("2026-10-03", "sick")])).toBe(0);
    expect(absenceStreak([day("2026-10-01", "absent"), day("2026-10-01", "present"), day("2026-10-02", "absent")])).toBe(1);
    expect(absenceStreak([])).toBe(0);
  });
  it("flags attendance below 85%, average below 3 and 3-day streaks", () => {
    const ok = { attendancePercent: 95, attendanceTotal: 40, average: 4.2, gradeCount: 12, streak: 0 };
    expect(computeRisk(ok)).toEqual([]);
    expect(computeRisk({ ...ok, attendancePercent: 84.9 })).toEqual(["low_attendance"]);
    expect(computeRisk({ ...ok, attendancePercent: 85 })).toEqual([]);
    expect(computeRisk({ ...ok, average: 2.9 })).toEqual(["low_average"]);
    expect(computeRisk({ ...ok, average: 3 })).toEqual([]);
    expect(computeRisk({ ...ok, streak: 3 })).toEqual(["absence_streak"]);
    expect(computeRisk({ attendancePercent: 60, attendanceTotal: 40, average: 2, gradeCount: 10, streak: 4 })).toEqual(["low_attendance", "low_average", "absence_streak"]);
  });
  it("does not flag on too little evidence", () => {
    expect(computeRisk({ attendancePercent: 0, attendanceTotal: 2, average: 2, gradeCount: 1, streak: 0 })).toEqual([]);
  });
});
