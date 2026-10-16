"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { Badge, Button, Card, cn, gradeTone, inputCls } from "@/components/school/ui/kit";
import { ATTENDANCE_LABEL } from "@/lib/school/i18n";
import { sget } from "@/lib/school/client";
import { addDays, weightedAverage } from "@/lib/school/grading";
import type { AttendanceStatus, Gradebook, ReportCard, StudentListItem, StudentPerformance } from "@/lib/school/types";
import { ErrorState, Field, fmtDate, Gate, PageHead, selectCls, Skeleton, ToastHost, useApi, useBase, useToasts, type Base } from "./common";
import { useTT } from "./use-tt";

const LETTER: Record<AttendanceStatus, string> = { present: "+", absent: "Н", late: "К", excused: "У", sick: "Б" };

export function ReportsPage() {
  const state = useBase();
  return <Gate state={state}>{(b) => <Inner b={b} />}</Gate>;
}

function Inner({ b }: { b: Base }) {
  const { tt, t, L, errText } = useTT();
  const params = useSearchParams();
  const toasts = useToasts();
  const today = b.me.today;
  const [classId, setClassId] = useState(b.ov.classes[0]?.id ?? "");
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [pair, setPair] = useState(b.ov.assignments[0] ? `${b.ov.assignments[0].class_id}|${b.ov.assignments[0].subject_id}` : "");
  const [termId, setTermId] = useState(b.me.term?.id ?? "");
  const [studentId, setStudentId] = useState(params.get("student") ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const studs = useApi<{ students: StudentListItem[] }>(classId ? `/students?class_id=${classId}&status=active` : null);
  const card = useApi<{ report: ReportCard }>(studentId ? `/reports/report-card?student_id=${studentId}` : null);
  const perf = useApi<{ performance: StudentPerformance }>(studentId ? `/reports/student-performance?student_id=${studentId}` : null);

  const attendanceXlsx = async () => {
    setBusy("att");
    try {
      const r = await sget<{ sheet: { dates: string[]; students: { last_name: string; first_name: string; cells: (AttendanceStatus | null)[] }[] } }>(`/attendance/sheet?class_id=${classId}&from=${from}&to=${to}`);
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([[tt("student"), ...r.sheet.dates.map(fmtDate)], ...r.sheet.students.map((s) => [`${s.last_name} ${s.first_name}`, ...s.cells.map((c) => (c ? t(ATTENDANCE_LABEL[c]) : ""))])]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      XLSX.writeFile(wb, `attendance-${b.ov.classes.find((c) => c.id === classId)?.name}-${from}_${to}.xlsx`);
    } catch (e) {
      toasts.push("error", errText(e));
    } finally {
      setBusy(null);
    }
  };
  const journalXlsx = async () => {
    const [cid, sid] = pair.split("|");
    setBusy("jr");
    try {
      const gb = (await sget<{ gradebook: Gradebook }>(`/grades/gradebook?class_id=${cid}&subject_id=${sid}&term_id=${termId}`)).gradebook;
      const dates = [...new Set(gb.rows.flatMap((r) => r.entries.map((e) => `${e.date}|${e.kind}`)))].sort();
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([
        [tt("student"), ...dates.map((d) => `${fmtDate(d.split("|")[0])} ${d.split("|")[1]}`), tt("jr_avg"), tt("term_final")],
        ...gb.rows.map((r) => [`${r.last_name} ${r.first_name}`, ...dates.map((d) => r.entries.find((e) => `${e.date}|${e.kind}` === d)?.score ?? ""), weightedAverage(r.entries) !== null ? r.average ?? "" : "", r.term_grade?.value ?? ""]),
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Journal");
      XLSX.writeFile(wb, `journal-${b.ov.assignments.find((a) => a.class_id === cid)?.class_name}.xlsx`);
    } catch (e) {
      toasts.push("error", errText(e));
    } finally {
      setBusy(null);
    }
  };

  const rep = card.data?.report;
  const p = perf.data?.performance;
  return (
    <div className="mx-auto max-w-4xl">
      <style>{`@media print{aside,header,.no-print{display:none!important}main{padding:0!important}body{background:#fff!important}}`}</style>
      <div className="no-print">
        <PageHead title={tt("rep_title")} />
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-sm font-bold">{tt("rep_attendance")}</h2>
            <Field label={tt("class")}><select className={selectCls} value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(""); }}>{b.ov.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={tt("rep_from")}><input type="date" className={cn(inputCls, "min-h-11")} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
              <Field label={tt("rep_to")}><input type="date" className={cn(inputCls, "min-h-11")} value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field>
            </div>
            <Button loading={busy === "att"} disabled={!classId || to < from} onClick={() => void attendanceXlsx()}><Download className="size-4" />xlsx</Button>
          </Card>
          <Card className="space-y-3">
            <h2 className="text-sm font-bold">{tt("rep_journal")}</h2>
            <Field label={`${tt("class")} / ${tt("subject")}`}><select className={selectCls} value={pair} onChange={(e) => setPair(e.target.value)}>{b.ov.assignments.map((a) => <option key={`${a.class_id}|${a.subject_id}`} value={`${a.class_id}|${a.subject_id}`}>{a.class_name} · {L(b.subjects.find((s) => s.id === a.subject_id)?.name)}</option>)}</select></Field>
            <Field label={tt("term")}><select className={selectCls} value={termId} onChange={(e) => setTermId(e.target.value)}>{b.me.terms.map((x) => <option key={x.id} value={x.id}>{x.number} · {x.name}</option>)}</select></Field>
            <Button loading={busy === "jr"} disabled={!pair} onClick={() => void journalXlsx()}><Download className="size-4" />xlsx</Button>
          </Card>
        </div>
        <Card className="mt-4 space-y-3">
          <h2 className="text-sm font-bold">{tt("rep_student")}</h2>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={tt("class")} className="w-32"><select className={selectCls} value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(""); }}>{b.ov.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label={tt("student")} className="min-w-52 flex-1"><select className={selectCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">–</option>{(studs.data?.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.last_name} {s.first_name}</option>)}</select></Field>
            <Button disabled={!rep} onClick={() => window.print()}><Printer className="size-4" />{tt("rep_print")}</Button>
          </div>
        </Card>
      </div>
      {studentId && (card.error ? <ErrorState message={errText(card.error)} onRetry={card.reload} /> : !rep ? <Skeleton className="mt-4 h-64" /> : (
        <article className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 dark:border-slate-800 print:border-0 print:p-0" aria-label={tt("rep_student")}>
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-300 pb-3">
            <div><h2 className="text-xl font-bold">{rep.student.last_name} {rep.student.first_name}</h2><p className="text-sm text-slate-600">{rep.student.class_name} · {rep.year.name}{rep.term ? ` · ${rep.term.name}` : ""}</p></div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(today)}</p>
          </header>
          <div className="my-4 grid grid-cols-4 gap-2 text-center text-sm">
            <div><b className="text-lg">{rep.gpa?.toFixed(2) ?? "–"}</b><br />GPA</div>
            <div><b className="text-lg">{rep.rank_in_class ? `${rep.rank_in_class}/${rep.class_size}` : "–"}</b><br />{tt("cl_rank")}</div>
            <div><b className="text-lg">{rep.attendance.percent ?? "–"}%</b><br />{tt("cl_attendance")}</div>
            <div><b className="text-lg">{p?.overall_average?.toFixed(2) ?? "–"}</b><br />{tt("average")}</div>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-300 text-left text-xs text-slate-500 dark:text-slate-400"><th className="py-1">{tt("subject")}</th><th>{tt("rep_teacher")}</th><th className="text-center">{tt("average")}</th><th className="text-center">{tt("term_final")}</th><th className="text-center">{tt("term_year")}</th></tr></thead>
            <tbody>{rep.subjects.map((s) => (
              <tr key={s.subject_id} className="border-b border-slate-100"><td className="py-1">{L(s.subject)}</td><td className="text-slate-600">{s.teacher ?? "–"}</td><td className="text-center tabular-nums">{s.average?.toFixed(2) ?? "–"}</td><td className="text-center"><Badge tone={gradeTone(s.term_grade)}>{s.term_grade ?? "–"}</Badge></td><td className="text-center"><Badge tone={gradeTone(s.year_grade)}>{s.year_grade ?? "–"}</Badge></td></tr>
            ))}</tbody>
          </table>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{(Object.keys(LETTER) as AttendanceStatus[]).map((k) => `${t(ATTENDANCE_LABEL[k])}: ${rep.attendance[k]}`).join(" · ")}</p>
        </article>
      ))}
      <ToastHost items={toasts.items} dismiss={toasts.dismiss} />
    </div>
  );
}
