import { api } from "@/lib/school/api-helpers";
import { weekdayOf } from "@/lib/school/grading";
import { classNameOf, computeStats, currentTerm, fullName, scopedStudents } from "@/lib/school/service";
import type { AttendanceStatus, RiskFlag, ScheduleSlot } from "@/lib/school/types";

/**
 * GET /api/school/teacher/overview (teacher) - one round trip for the teacher dashboard, class cards and schedule pages.
 * { teacher_id, today, term, assignments[], classes[], today_lessons[], risk[], pending_terms[] }
 */
export const GET = api({ roles: ["teacher"] }, async ({ c, s }) => {
  const tid = s.teacherId;
  const mine = tid ? c.assignments.filter((a) => a.teacher_id === tid) : [];
  const classIds = [...c.classIds];
  const term = currentTerm(c);
  const students = await scopedStudents(c, { status: "active" });
  const stats = await computeStats(c, students);

  const [attToday, lessonsToday, slots, termGrades] = await Promise.all([
    classIds.length ? c.db.select("attendance", { in: { class_id: classIds }, eq: { date: c.today } }) : Promise.resolve([]),
    classIds.length ? c.db.select("lessons", { in: { class_id: classIds }, eq: { date: c.today } }) : Promise.resolve([]),
    tid ? c.db.select("schedule_slots", { eq: { teacher_id: tid } }) : Promise.resolve([] as ScheduleSlot[]),
    term && classIds.length ? c.db.select("term_grades", { in: { class_id: classIds }, eq: { term_id: term.id } }) : Promise.resolve([]),
  ]);

  const classes = c.classes
    .filter((x) => c.classIds.has(x.id))
    .map((cls) => {
      const sts = students.filter((x) => x.class_id === cls.id);
      const st = sts.map((x) => stats.get(x.id)!);
      const att = st.reduce((n, x) => ({ ok: n.ok + x.att.present + x.att.late, total: n.total + x.att.total }), { ok: 0, total: 0 });
      const avgs = st.map((x) => x.average).filter((x): x is number => x !== null);
      const todayRows = attToday.filter((r) => r.class_id === cls.id && r.lesson_no === null);
      const counts: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0, sick: 0 };
      for (const r of todayRows) counts[r.status]++;
      return {
        id: cls.id, name: cls.name, grade: cls.grade, letter: cls.letter, room: cls.room,
        homeroom: cls.homeroom_teacher_id === tid,
        subject_ids: mine.filter((a) => a.class_id === cls.id).map((a) => a.subject_id),
        student_count: sts.length,
        attendance_percent: att.total ? Math.round((att.ok / att.total) * 1000) / 10 : null,
        average: avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100 : null,
        risk_count: st.filter((x) => x.risk.length).length,
        today: { marked: todayRows.length, counts },
        marked_today: attToday.some((r) => r.class_id === cls.id),
      };
    });

  const wd = weekdayOf(c.today);
  const today_lessons = slots
    .filter((x) => x.weekday === wd)
    .sort((a, b) => a.lesson_no - b.lesson_no)
    .map((slot) => {
      const lesson = lessonsToday.find((l) => l.class_id === slot.class_id && l.lesson_no === slot.lesson_no) ?? null;
      return {
        slot, class_name: classNameOf(c, slot.class_id) ?? "",
        attendance_marked: attToday.some((r) => r.class_id === slot.class_id && (r.lesson_no === null || r.lesson_no === slot.lesson_no)),
        topic: lesson?.topic ?? null, homework: lesson?.homework ?? null, lesson_filled: !!lesson?.topic,
      };
    });

  const risk = students
    .filter((x) => stats.get(x.id)!.risk.length)
    .sort((a, b) => stats.get(b.id)!.risk.length - stats.get(a.id)!.risk.length || (stats.get(a.id)!.average ?? 9) - (stats.get(b.id)!.average ?? 9))
    .slice(0, 15)
    .map((x) => {
      const st = stats.get(x.id)!;
      return {
        student_id: x.id, name: fullName(x), class_id: x.class_id, class_name: classNameOf(c, x.class_id), flags: st.risk as RiskFlag[],
        attendance_percent: st.att.percent, average: st.average, streak: st.streak,
      };
    });

  const pending_terms = term
    ? mine.map((a) => {
        const total = students.filter((x) => x.class_id === a.class_id).length;
        const confirmed = termGrades.filter((g) => g.class_id === a.class_id && g.subject_id === a.subject_id && g.value !== null).length;
        return { class_id: a.class_id, class_name: classNameOf(c, a.class_id) ?? "", subject_id: a.subject_id, term_id: term.id, total, confirmed, locked: term.is_locked };
      })
    : [];

  return {
    teacher_id: tid, today: c.today, term,
    assignments: mine.map((a) => ({ class_id: a.class_id, class_name: classNameOf(c, a.class_id) ?? "", grade: c.classes.find((x) => x.id === a.class_id)?.grade ?? 0, subject_id: a.subject_id, hours_per_week: a.hours_per_week })),
    classes, today_lessons, risk, pending_terms,
  };
});
