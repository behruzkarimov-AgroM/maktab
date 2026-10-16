"use client";

import { useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { qs, sget } from "@/lib/school/client";
import type { AttendanceRecord, ReportCard } from "@/lib/school/types";
import { Button, Card, inputCls } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { childName, useFamily } from "./FamilyProvider";
import { useAsync, useErrorText } from "./hooks";
import { countDays, fmtGpa, fmtPct } from "./logic";
import { drawReportCard, drawSpravka, savePdf, type PdfLabels } from "./pdf";
import { useDateFmt } from "./useNames";
import { ErrorBox, PageSkeleton, PageTitle } from "./widgets";

export function FamilyReportCard() {
  const { t, L } = useSchool();
  const { child, me } = useFamily();
  const errText = useErrorText();
  const df = useDateFmt();
  const [termId, setTermId] = useState("");
  const [busy, setBusy] = useState<"" | "report" | "spravka">("");
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState(me.term?.start_date ?? me.year?.start_date ?? me.today);
  const [to, setTo] = useState(me.today);
  const rep = useAsync(`rc:${child.id}:${termId}`, () => sget<{ report: ReportCard }>(`/reports/report-card${qs({ student_id: child.id, term_id: termId })}`));

  const labels: PdfLabels = {
    school: t("schoolName"), reportTitle: t("f_pdfReportTitle"), spravkaTitle: t("f_pdfSpravkaTitle"), student: t("f_pdfStudent"), className: t("class"), period: t("f_period"),
    year: t("f_schoolYear"), term: t("term"), wholeYear: t("f_wholeYear"), subject: t("subject"), teacher: t("f_teacher"), average: t("average"), termGrade: t("f_termGradeCol"),
    yearGrade: t("f_year"), gpa: t("f_gpa"), rank: t("f_kpiRank"), attendance: t("navAttendance"), present: t("stPresent"), absent: t("stAbsent"), late: t("stLate"),
    excused: t("stExcused"), sick: t("stSick"), homeroom: t("f_homeroom"), generated: t("f_generated"), signature: t("f_signature"), spravkaText: t("f_pdfSpravkaText"),
    spravkaNote: t("f_pdfSpravkaNote"), totalDays: t("f_totalDays"), stamp: t("f_stamp"),
  };

  async function downloadReport() {
    if (!rep.data) return;
    setBusy("report");
    setErr(null);
    try {
      const r = rep.data.report;
      const c = drawReportCard(
        {
          studentName: childName(child), className: child.class_name ?? "-", yearName: r.year.name, termName: r.term ? r.term.name : null, homeroom: r.homeroom_teacher,
          generatedAt: df(r.generated_at, { day: "numeric", month: "long", year: "numeric" }),
          rows: r.subjects.map((s) => ({ subject: L(s.subject), teacher: s.teacher ?? "-", average: fmtGpa(s.average), termGrade: s.term_grade?.toString() ?? "-", yearGrade: s.year_grade?.toString() ?? "-" })),
          gpa: fmtGpa(r.gpa), rank: r.rank_in_class ? `${r.rank_in_class}/${r.class_size}` : "-",
          att: { pct: fmtPct(r.attendance.percent), present: r.attendance.present, absent: r.attendance.absent, late: r.attendance.late, excused: r.attendance.excused, sick: r.attendance.sick },
        },
        labels,
      );
      await savePdf(c, `report-card-${childName(child)}`);
    } catch {
      setErr(t("errorGeneric"));
    } finally {
      setBusy("");
    }
  }

  async function downloadSpravka() {
    setBusy("spravka");
    setErr(null);
    try {
      const res = await sget<{ history: { rows: AttendanceRecord[]; days: { date: string; status: AttendanceRecord["status"] }[] } }>(`/attendance${qs({ student_id: child.id, from, to })}`);
      const k = countDays(res.history.days);
      const c = drawSpravka(
        { studentName: childName(child), className: child.class_name ?? "-", from: df(from, { day: "numeric", month: "long", year: "numeric" }), to: df(to, { day: "numeric", month: "long", year: "numeric" }), generatedAt: df(me.today, { day: "numeric", month: "long", year: "numeric" }), total: k.total, present: k.present, absent: k.absent, late: k.late, excused: k.excused, sick: k.sick, pct: fmtPct(k.percent) },
        labels,
      );
      await savePdf(c, `attendance-certificate-${childName(child)}`);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } #report-print, #report-print * { visibility: visible !important; } #report-print { position: absolute; left: 0; top: 0; width: 100%; border: 0; box-shadow: none; } }`}</style>
      <PageTitle title={t("f_reportCard")} sub={t("f_reportSub")} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("term")}</span>
          <select className={inputCls} value={termId} onChange={(e) => setTermId(e.target.value)}>
            <option value="">{t("f_wholeYear")}</option>
            {me.terms.map((tm) => <option key={tm.id} value={tm.id}>{tm.number}. {tm.name}</option>)}
          </select>
        </label>
        <Button variant="primary" onClick={downloadReport} loading={busy === "report"} disabled={!rep.data}><Download className="size-4" />{t("f_downloadPdf")}</Button>
        <Button onClick={() => window.print()} disabled={!rep.data}><Printer className="size-4" />{t("f_print")}</Button>
      </div>
      {err && <p role="alert" className="mb-3 text-sm text-red-600">{err}</p>}
      {rep.loading ? <PageSkeleton /> : rep.error || !rep.data ? <ErrorBox message={errText(rep.error)} onRetry={rep.reload} /> : (
        <Card className="mb-6" >
          <div id="report-print">
            <h2 className="text-lg font-bold">{childName(child)}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{child.class_name} - {rep.data.report.year.name} - {rep.data.report.term?.name ?? t("f_wholeYear")}</p>
            <div className="mt-3 overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-xs text-slate-500 dark:text-slate-400"><tr><th className="py-1 text-left">{t("subject")}</th><th className="text-left">{t("f_teacher")}</th><th>{t("average")}</th><th>{t("f_termGradeCol")}</th><th>{t("f_year")}</th></tr></thead>
                <tbody>
                  {rep.data.report.subjects.map((s) => (
                    <tr key={s.subject_id} className="border-t border-slate-100 text-center dark:border-slate-800">
                      <td className="py-1.5 text-left">{L(s.subject)}</td><td className="text-left text-slate-500 dark:text-slate-400">{s.teacher ?? "-"}</td>
                      <td className="tabular-nums">{fmtGpa(s.average)}</td><td>{s.term_grade ?? "-"}</td><td>{s.year_grade ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm"><b>{t("f_gpa")}:</b> {fmtGpa(rep.data.report.gpa)} &nbsp; <b>{t("f_kpiRank")}:</b> {rep.data.report.rank_in_class ?? "-"}/{rep.data.report.class_size} &nbsp; <b>{t("navAttendance")}:</b> {fmtPct(rep.data.report.attendance.percent)}</p>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" />{t("f_spravka")}</h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t("f_spravkaSub")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("f_from")}</span><input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("f_to")}</span><input type="date" className={inputCls} value={to} min={from} max={me.today} onChange={(e) => setTo(e.target.value)} /></label>
          <Button variant="primary" onClick={downloadSpravka} loading={busy === "spravka"} disabled={!from || !to || from > to}><Download className="size-4" />{t("f_downloadSpravka")}</Button>
        </div>
      </Card>
    </>
  );
}
