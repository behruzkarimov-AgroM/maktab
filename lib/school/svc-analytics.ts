// Service functions: performance analytics, risk lists, report data, role-aware dashboard.
import { SchoolError } from "./errors";
import { average2, countAttendance, gpa, rankBy, toPercent, yearGrade, absenceStreak } from "./grading";
import { announcementVisible, isDirector } from "./permissions";
import {
  assertClassManage, classNameOf, computeStats, currentTerm, fullName, getVisibleStudent, need, scopedStudents, teacherName, toListItem, visibleClassIds, type Ctx,
} from "./svc-core";
import { termValuesFor } from "./svc-grades";
import type {
  Announcement, AttendanceStatus, DashboardData, GradeEntry, PerformancePoint, ReportCard, RiskRow, Student, StudentPerformance, SubjectPerformance,
} from "./types";

async function classRank(c: Ctx, student: Student): Promise<{ rank: number | null; size: number }> {
  if (!student.class_id) return { rank: null, size: 0 };
  const mates = (await c.db.select("students", { eq: { class_id: student.class_id, status: "active" } }));
  const stats = await computeStats(c, mates);
  const ranks = rankBy(mates, (m) => stats.get(m.id)?.average ?? null);
  return { rank: ranks.get(mates.find((m) => m.id === student.id)!) ?? null, size: mates.length };
}

export async function studentPerformance(c: Ctx, studentId: string): Promise<StudentPerformance> {
  const st = await getVisibleStudent(c, studentId);
  const year = need(c.year);
  const [entries, termGrades, att] = await Promise.all([
    c.db.select("grade_entries", { eq: { student_id: studentId } }),
    c.db.select("term_grades", { eq: { student_id: studentId } }),
    c.db.select("attendance", { eq: { student_id: studentId }, gte: { date: year.start_date }, lte: { date: c.today } }),
  ]);
  const inYear = entries.filter((e) => c.terms.some((t) => t.id === e.term_id));
  const trend: PerformancePoint[] = c.terms.map((t) => {
    const es = inYear.filter((e) => e.term_id === t.id);
    return { term_id: t.id, number: t.number, name: t.name, average: average2(es, c.rules), count: es.filter((e) => !c.rules.excludeKinds.includes(e.kind)).length };
  });
  const subjectIds = [...new Set(inYear.map((e) => e.subject_id))];
  const subjects: SubjectPerformance[] = subjectIds
    .map((sid) => {
      const es = inYear.filter((e) => e.subject_id === sid);
      const tv = termValuesFor(c, inYear, termGrades, studentId, sid);
      return {
        subject_id: sid, subject: c.subjects.find((s) => s.id === sid)?.name ?? { uz: "", ru: "", en: "" }, average: average2(es, c.rules),
        count: es.length, term_values: tv, year_value: yearGrade(tv),
      };
    })
    .sort((a, b) => (c.subjects.findIndex((s) => s.id === a.subject_id)) - c.subjects.findIndex((s) => s.id === b.subject_id));
  const stats = (await computeStats(c, [st])).get(st.id)!;
  const g = gpa(subjects.map((s) => s.year_value ?? (s.average === null ? null : Math.round(s.average))));
  const { rank, size } = await classRank(c, st);
  const k = countAttendance(att);
  return {
    student_id: studentId, year_id: year.id, overall_average: average2(inYear, c.rules), gpa: g, percent: toPercent(g), rank_in_class: rank, class_size: size,
    trend, subjects, attendance: { ...k, streak: absenceStreak(att) }, risk: stats.risk,
  };
}

export async function classPerformance(c: Ctx, classId: string, termId?: string) {
  assertClassManage(c, classId);
  const term = termId ? need(c.terms.find((t) => t.id === termId)) : null;
  const students = await scopedStudents(c, { class_id: classId, status: "active" });
  const [entriesAll, att] = await Promise.all([
    c.db.select("grade_entries", { eq: { class_id: classId } }),
    c.db.select("attendance", { eq: { class_id: classId }, gte: { date: c.year?.start_date ?? "1970-01-01" }, lte: { date: c.today } }),
  ]);
  const entries = entriesAll.filter((e) => (term ? e.term_id === term.id : c.terms.some((t) => t.id === e.term_id)));
  const stats = await computeStats(c, students);
  const avg = new Map(students.map((s) => [s.id, average2(entries.filter((e) => e.student_id === s.id), c.rules)]));
  const ranks = rankBy(students, (s) => avg.get(s.id) ?? null);
  const dist = [1, 2, 3, 4, 5].map((score) => ({ score, count: entries.filter((e) => !c.rules.excludeKinds.includes(e.kind) && Math.round(e.score) === score).length }));
  const subjectAverages = [...new Set(entries.map((e) => e.subject_id))].map((sid) => ({
    subject_id: sid, subject: c.subjects.find((s) => s.id === sid)?.name ?? { uz: "", ru: "", en: "" }, average: average2(entries.filter((e) => e.subject_id === sid), c.rules),
  }));
  void att;
  return {
    class_id: classId, term_id: term?.id ?? null,
    students: students.map((s) => ({
      student_id: s.id, last_name: s.last_name, first_name: s.first_name, average: avg.get(s.id) ?? null, rank: ranks.get(s) ?? null,
      attendance_percent: stats.get(s.id)?.att.percent ?? null, streak: stats.get(s.id)?.streak ?? 0, risk: stats.get(s.id)?.risk ?? [],
    })),
    class_average: average2(entries, c.rules),
    distribution: dist,
    subject_averages: subjectAverages,
  };
}

export async function listRisk(c: Ctx, f: { class_id?: string; limit?: number } = {}): Promise<RiskRow[]> {
  if (c.s.role === "parent" || c.s.role === "student") throw new SchoolError("forbidden");
  if (f.class_id) assertClassManage(c, f.class_id);
  const students = await scopedStudents(c, { class_id: f.class_id, status: "active" });
  const stats = await computeStats(c, students);
  return students
    .map((s) => ({ s, st: stats.get(s.id)! }))
    .filter((x) => x.st.risk.length)
    .sort((a, b) => b.st.risk.length - a.st.risk.length || (a.st.average ?? 9) - (b.st.average ?? 9))
    .slice(0, f.limit ?? 100)
    .map(({ s, st }) => ({
      student_id: s.id, name: fullName(s), class_id: s.class_id, class_name: classNameOf(c, s.class_id), flags: st.risk,
      attendance_percent: st.att.percent, average: st.average, streak: st.streak,
    }));
}

export async function reportCard(c: Ctx, studentId: string, termId?: string): Promise<ReportCard> {
  const st = await getVisibleStudent(c, studentId);
  const perf = await studentPerformance(c, studentId);
  const term = termId ? need(c.terms.find((t) => t.id === termId)) : null;
  const termGrades = await c.db.select("term_grades", { eq: { student_id: studentId } });
  const entries = await c.db.select("grade_entries", { eq: { student_id: studentId } });
  const teachers = await c.db.select("teachers");
  const rows = perf.subjects.map((sp) => {
    const es = entries.filter((e) => e.subject_id === sp.subject_id && (!term || e.term_id === term.id));
    const tv = term ? sp.term_values[c.terms.findIndex((t) => t.id === term.id)] ?? null : null;
    void termGrades;
    const a = c.assignments.find((x) => x.class_id === st.class_id && x.subject_id === sp.subject_id);
    return {
      subject_id: sp.subject_id, subject: sp.subject, teacher: teacherName(teachers, a?.teacher_id ?? null),
      average: average2(es, c.rules), term_grade: tv, year_grade: sp.year_value,
    };
  });
  const g = gpa(rows.map((r) => (term ? r.term_grade : r.year_grade)));
  const cls = c.classes.find((x) => x.id === st.class_id);
  return {
    student: toListItem(c, st), year: need(c.year), term, generated_at: new Date().toISOString(), subjects: rows, gpa: g,
    rank_in_class: perf.rank_in_class, class_size: perf.class_size, attendance: perf.attendance, homeroom_teacher: teacherName(teachers, cls?.homeroom_teacher_id ?? null),
  };
}

/* ------------------------------ dashboard ------------------------------ */
async function visibleAnnouncements(c: Ctx, limit = 5): Promise<Announcement[]> {
  const vis = await visibleClassIds(c);
  const all = await c.db.select("announcements", { order: [["publish_at", "desc"]] });
  const now = new Date();
  return all
    .filter((a) => announcementVisible(c.s, a, now, vis))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.publish_at < b.publish_at ? 1 : -1))
    .slice(0, limit);
}
export { visibleAnnouncements };

export async function dashboard(c: Ctx): Promise<DashboardData> {
  const base = { role: c.s.role, year: c.year, term: currentTerm(c), today: c.today };
  const announcements = await visibleAnnouncements(c);
  if (c.s.role === "parent" || c.s.role === "student") {
    const kids = await scopedStudents(c);
    const stats = await computeStats(c, kids);
    const todays = await c.db.select("attendance", { in: { student_id: kids.map((k) => k.id) }, eq: { date: c.today } });
    return {
      ...base, cards: [{ key: "children", value: kids.length }], charts: {}, risk: [], announcements,
      children: kids.map((k) => ({
        student: toListItem(c, k, stats.get(k.id)), today_status: (todays.find((t) => t.student_id === k.id)?.status ?? null) as AttendanceStatus | null,
        average: stats.get(k.id)?.average ?? null, attendance_percent: stats.get(k.id)?.att.percent ?? null, risk: stats.get(k.id)?.risk ?? [],
      })),
    };
  }

  const students = await scopedStudents(c, { status: "active" });
  const stats = await computeStats(c, students);
  const classIds = isDirector(c.s) ? c.classes.map((x) => x.id) : [...c.classIds];
  const yearStart = c.year?.start_date ?? "1970-01-01";
  const att = classIds.length ? await c.db.select("attendance", { in: { class_id: classIds }, gte: { date: yearStart }, lte: { date: c.today } }) : [];
  const pct = (rows: { status: string }[]) => countAttendance(rows as { status: AttendanceStatus }[]).percent;

  const byDate = new Map<string, typeof att>();
  for (const a of att) (byDate.get(a.date) ?? byDate.set(a.date, []).get(a.date)!).push(a);
  const dates = [...byDate.keys()].sort();
  const lastDate = dates[dates.length - 1] ?? null;
  const todayRows = byDate.get(c.today) ?? [];
  const lastRows = lastDate ? byDate.get(lastDate)! : [];
  const attendanceByClass = classIds.map((id) => ({ class_id: id, class_name: classNameOf(c, id) ?? "", percent: pct(lastRows.filter((r) => r.class_id === id)) }));
  const attendanceTrend = dates.slice(-14).map((d) => ({ date: d, percent: pct(byDate.get(d)!) }));
  const term = currentTerm(c);
  const entries: GradeEntry[] = term && classIds.length ? await c.db.select("grade_entries", { in: { class_id: classIds }, eq: { term_id: term.id } }) : [];
  const counted = entries.filter((e) => !c.rules.excludeKinds.includes(e.kind));
  const gradeDistribution = [1, 2, 3, 4, 5].map((score) => ({ score, count: counted.filter((e) => Math.round(e.score) === score).length }));
  const subjectAverages = c.subjects
    .map((s) => ({ subject_id: s.id, subject: s.name, average: average2(entries.filter((e) => e.subject_id === s.id), c.rules) }))
    .filter((x) => x.average !== null);
  const risk: RiskRow[] = students
    .filter((s) => stats.get(s.id)!.risk.length)
    .sort((a, b) => stats.get(b.id)!.risk.length - stats.get(a.id)!.risk.length || (stats.get(a.id)!.average ?? 9) - (stats.get(b.id)!.average ?? 9))
    .slice(0, 8)
    .map((s) => {
      const st = stats.get(s.id)!;
      return { student_id: s.id, name: fullName(s), class_id: s.class_id, class_name: classNameOf(c, s.class_id), flags: st.risk, attendance_percent: st.att.percent, average: st.average, streak: st.streak };
    });
  const allAvg = average2(counted, c.rules);

  if (isDirector(c.s)) {
    const teachers = await c.db.select("teachers", { eq: { status: "active" } });
    return {
      ...base, announcements, risk, charts: { attendanceByClass, attendanceTrend, gradeDistribution, subjectAverages },
      cards: [
        { key: "students", value: students.length },
        { key: "teachers", value: teachers.length },
        { key: "classes", value: c.classes.length },
        { key: "attendanceToday", value: pct(todayRows), hint: todayRows.length ? undefined : lastDate ?? undefined },
        { key: "absentToday", value: todayRows.filter((r) => r.status === "absent").length },
        { key: "averageGrade", value: allAvg },
        { key: "atRisk", value: students.filter((s) => stats.get(s.id)!.risk.length).length },
      ],
    };
  }
  // teacher
  const marked = new Set(todayRows.map((r) => r.class_id));
  const pending = [...c.classIds].filter((id) => !marked.has(id)).map((id) => ({ class_id: id, class_name: classNameOf(c, id) ?? "" }));
  const mine = c.assignments.filter((a) => a.teacher_id === c.s.teacherId);
  return {
    ...base, announcements, risk, pending, charts: { attendanceByClass, attendanceTrend, gradeDistribution, subjectAverages },
    cards: [
      { key: "myClasses", value: c.classIds.size },
      { key: "myStudents", value: students.length },
      { key: "hoursPerWeek", value: mine.reduce((n, a) => n + a.hours_per_week, 0) },
      { key: "pendingAttendance", value: pending.length },
      { key: "averageGrade", value: allAvg },
      { key: "atRisk", value: students.filter((s) => stats.get(s.id)!.risk.length).length },
    ],
  };
}

