import { describe, expect, it } from "vitest";
import {
  bestAttendanceStreak, buildAlerts, buildMonthGrid, computeBadges, countDays, currentAttendanceStreak, fmt, fmtGpa, goodGradeStreak, monthBounds, parseGoals,
  perfectWeeks, shiftMonth, sparkPoints, summarizeSubjects, termTotals, termTrend, trendOf, type DayRow,
} from "@/components/school/family/logic";
import { FAMILY_UI } from "@/lib/school/i18n-family";

const day = (date: string, status: DayRow["status"] = "present"): DayRow => ({ date, status });

describe("calendar", () => {
  it("builds Monday-first weeks for a month", () => {
    const g = buildMonthGrid("2026-10", { "2026-10-05": "absent" }, "2026-10-15");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0].date).toBe("2026-09-28");
    const cells = g.flat().filter((c) => c.inMonth);
    expect(cells).toHaveLength(31);
    expect(cells.find((c) => c.date === "2026-10-05")?.status).toBe("absent");
    expect(cells.find((c) => c.date === "2026-10-15")?.isToday).toBe(true);
    expect(cells.find((c) => c.date === "2026-10-20")?.isFuture).toBe(true);
  });
  it("month helpers", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("term totals", () => {
    const t = termTotals([day("2026-09-02"), day("2026-09-03", "absent"), day("2026-11-10", "sick")], [
      { id: "a", number: 1, start_date: "2026-09-01", end_date: "2026-10-31" },
      { id: "b", number: 2, start_date: "2026-11-01", end_date: "2026-12-31" },
    ]);
    expect(t[0].counts.total).toBe(2);
    expect(t[0].counts.percent).toBe(50);
    expect(t[1].counts.sick).toBe(1);
  });
});

describe("streaks and badges", () => {
  const days = [day("2026-10-05", "absent"), day("2026-10-06"), day("2026-10-07", "late"), day("2026-10-08")];
  it("current and best streak", () => {
    expect(currentAttendanceStreak(days)).toBe(3);
    expect(bestAttendanceStreak([...days, day("2026-10-09", "excused"), day("2026-10-12")])).toBe(3);
  });
  it("perfect week needs five present weekdays", () => {
    const wk = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((d) => day(d));
    expect(perfectWeeks(wk)).toEqual(["2026-10-05"]);
    expect(perfectWeeks([...wk.slice(0, 4), day("2026-10-09", "late")])).toEqual([]);
  });
  it("good grade streak", () => {
    expect(goodGradeStreak([3, 5, 4, 4])).toBe(3);
    expect(goodGradeStreak([5, 2])).toBe(0);
  });
  it("badges", () => {
    const b = computeBadges({ days, scores: [5], attendancePercent: 96, trendDir: "up" });
    expect(b.find((x) => x.key === "star")?.earned).toBe(true);
    expect(b.find((x) => x.key === "attendance95")?.earned).toBe(true);
    expect(b.find((x) => x.key === "streak10")?.earned).toBe(false);
  });
});

describe("trends, summaries, alerts", () => {
  it("trend direction", () => {
    expect(trendOf(3.5, 4).dir).toBe("up");
    expect(trendOf(4, 3.7).dir).toBe("down");
    expect(trendOf(4, 4.02).dir).toBe("flat");
    expect(trendOf(null, 4).dir).toBe("none");
    expect(termTrend([{ average: 3 }, { average: null }, { average: 4 }])).toMatchObject({ dir: "up", current: 4, delta: 1 });
  });
  it("subject summary", () => {
    const s = summarizeSubjects([
      { subject_id: "a", average: 4.8, term_values: [5, 5], count: 6 },
      { subject_id: "b", average: 3.1, term_values: [3, 3], count: 6 },
      { subject_id: "c", average: 4, term_values: [5, 4], count: 6 },
      { subject_id: "d", average: 2, term_values: [], count: 1 },
    ]);
    expect(s.strengths).toEqual(["a"]);
    expect(s.attention).toEqual(["b"]);
    expect(s.falling).toEqual(["c"]);
  });
  it("alerts in plain kinds", () => {
    const a = buildAlerts({ risk: ["absence_streak", "low_attendance"], streak: 3, attendancePercent: 80, average: 4, todayStatus: "absent", recentLow: [{ subject_id: "x", date: "2026-10-01", score: 2 }], unexcusedRecent: 3 });
    expect(a.map((x) => x.kind)).toEqual(["absent_today", "streak", "low_attendance", "low_grade"]);
    expect(buildAlerts({ risk: [], streak: 0, attendancePercent: 99, average: 5, todayStatus: "present", recentLow: [], unexcusedRecent: 0 })).toEqual([]);
  });
});

describe("formatting", () => {
  it("gpa and counts", () => {
    expect(fmtGpa(4.5)).toBe("4.50");
    expect(fmtGpa(null)).toBe("-");
    expect(countDays([{ status: "present" }, { status: "late" }, { status: "absent" }, { status: "excused" }]).percent).toBe(50);
  });
  it("fmt, sparkline, goals", () => {
    expect(fmt("Hi {name}, {n}", { name: "Ali", n: 2 })).toBe("Hi Ali, 2");
    expect(sparkPoints([1, 5], 80, 24)).toBe("0.0,24.0 80.0,0.0");
    expect(parseGoals("not json")).toEqual({ average: 4.5, attendance: 95 });
    expect(parseGoals('{"average":4,"attendance":90}')).toEqual({ average: 4, attendance: 90 });
    expect(parseGoals('{"average":9}').average).toBe(4.5);
  });
});

describe("family i18n", () => {
  it("every key has uz, ru and en text with matching placeholders", () => {
    for (const [k, v] of Object.entries(FAMILY_UI)) {
      for (const lang of ["uz", "ru", "en"] as const) expect(v[lang], `${k}.${lang}`).toBeTruthy();
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(v.ru), k).toBe(ph(v.en));
      expect(ph(v.uz), k).toBe(ph(v.en));
    }
  });
});
