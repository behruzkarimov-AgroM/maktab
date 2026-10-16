"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { sget } from "@/lib/school/client";
import { ATTENDANCE_LABEL } from "@/lib/school/i18n";
import type { AttendanceStatus, ReportCard, StudentListItem } from "@/lib/school/types";
import { Button, Card } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, DirPage, Field, Input, SectionCard, Select, Tabs, escapeHtml, exportXlsx, printHtml, studentName, useApi, useClasses, useDebounced, useErrText, useMe, useToast,
} from "./common";
import { downloadReportPdf, reportCardHtml, type ReportCardL, type ReportLabels } from "./report-render";

type Tab = "card" | "attendance" | "performance";
interface Sheet { dates: string[]; students: { last_name: string; first_name: string; cells: (AttendanceStatus | null)[] }[] }
interface ClassPerf {
  class_average: number | null; distribution: { score: number; count: number }[];
  students: { last_name: string; first_name: string; average: number | null; rank: number | null; attendance_percent: number | null; streak: number }[];
  subject_averages: { subject: { uz: string; ru: string; en: string }; average: number | null }[];
}
const LETTER: Record<AttendanceStatus, string> = { present: "+", absent: "A", late: "L", excused: "E", sick: "S" };

export function ReportsHub({ initialStudent }: { initialStudent?: string }) {
  const { t } = useSchool();
  const [tab, setTab] = useState<Tab>("card");
  return (
    <DirPage title={t("navReports")}>
      <Tabs value={tab} onChange={setTab} tabs={(["card", "attendance", "performance"] as Tab[]).map((k) => ({ key: k, label: t(`d_rep_${k}` as "d_rep_card") }))} />
      {tab === "card" && <CardReports initialStudent={initialStudent} />}
      {tab === "attendance" && <AttendanceSheet />}
      {tab === "performance" && <ClassPerformance />}
    </DirPage>
  );
}

function useLabels(): ReportLabels {
  const { t } = useSchool();
  return useMemo(() => ({
    title: t("d_report_card"), student: t("d_student"), cls: t("class"), code: t("d_student_code"), year: t("d_year"), term: t("term"), wholeYear: t("d_whole_year"), subject: t("subject"),
    teacher: t("d_teacher"), average: t("average"), termGrade: t("d_term_grade"), yearGrade: t("d_year_grade"), gpa: "GPA", rank: t("d_rank"), attendance: t("d_att_pct"),
    present: t("stPresent"), absent: t("stAbsent"), late: t("stLate"), excused: t("stExcused"), sick: t("stSick"), homeroom: t("d_homeroom"), school: t("schoolName"), date: t("date"),
    signHomeroom: t("d_sign_homeroom"), signDirector: t("d_sign_director"), signParent: t("d_sign_parent"),
  }), [t]);
}

function CardReports({ initialStudent }: { initialStudent?: string }) {
  const { t, L } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const labels = useLabels();
  const me = useMe();
  const { classes } = useClasses();
  const [mode, setMode] = useState<"student" | "class">("student");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [studentId, setStudentId] = useState(initialStudent ?? "");
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ReportCardL[] | null>(null);
  const found = useApi<{ students: StudentListItem[] }>(mode === "student" && dq.length >= 2 ? `/students?q=${encodeURIComponent(dq)}&status=active&limit=8` : null);
  const initial = useApi<{ student: StudentListItem }>(initialStudent ? `/students/${initialStudent}` : null);
  const picked = found.data?.students.find((s) => s.id === studentId) ?? (initial.data?.student.id === studentId ? initial.data.student : null);

  async function load(): Promise<ReportCardL[]> {
    const ids = mode === "student" ? [studentId] : (await sget<{ students: StudentListItem[] }>(`/students?class_id=${classId}&status=active&limit=200`)).students.map((s) => s.id);
    const out: ReportCardL[] = [];
    for (const id of ids) {
      const r = (await sget<{ report: ReportCard }>(`/reports/report-card?student_id=${id}${termId ? `&term_id=${termId}` : ""}`)).report;
      out.push({ ...r, subjectNames: r.subjects.map((s) => L(s.subject)) });
    }
    return out;
  }
  async function run(kind: "preview" | "print" | "pdf") {
    setBusy(true);
    try {
      const reports = await load();
      if (!reports.length) return;
      if (kind === "preview") setPreview(reports);
      else if (kind === "print") {
        if (!printHtml(t("d_report_card"), reports.map((r) => reportCardHtml(r, labels)).join(""))) toast("err", t("d_popup_blocked"));
      } else await downloadReportPdf(reports, labels, `report_${reports.length === 1 ? reports[0].student.last_name : reports[0].student.class_name}`);
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  const ready = mode === "student" ? !!studentId : !!classId;
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Field label={t("d_report_for")}>
            <Select value={mode} onChange={(e) => { setMode(e.target.value as "student" | "class"); setPreview(null); }}><option value="student">{t("d_student")}</option><option value="class">{t("d_whole_class")}</option></Select>
          </Field>
          {mode === "class" ? (
            <Field label={t("class")}><Select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">-</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          ) : (
            <Field label={t("d_student")} hint={picked ? studentName(picked) : undefined}>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} />
            </Field>
          )}
          <Field label={t("term")}><Select value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">{t("d_whole_year")}</option>{me.data?.terms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        </div>
        {mode === "student" && found.data && (
          <ul className="flex flex-wrap gap-2" role="listbox" aria-label={t("d_student")}>
            {found.data.students.map((s) => (
              <li key={s.id}><button role="option" aria-selected={studentId === s.id} onClick={() => setStudentId(s.id)} className={`rounded-lg border px-2.5 py-1 text-sm max-sm:min-h-11 ${studentId === s.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 dark:border-slate-700"}`}>{studentName(s)} · {s.class_name}</button></li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready} loading={busy} onClick={() => run("preview")}><FileText className="size-4" /> {t("d_preview")}</Button>
          <Button disabled={!ready} loading={busy} onClick={() => run("print")}><Printer className="size-4" /> {t("d_print")}</Button>
          <Button variant="primary" disabled={!ready} loading={busy} onClick={() => run("pdf")}><Download className="size-4" /> {t("d_pdf")}</Button>
        </div>
      </Card>
      {preview && (
        <SectionCard title={`${t("d_preview")} (${preview.length})`}>
          <div className="max-h-[36rem] space-y-6 overflow-auto rounded-lg bg-white p-4 text-slate-900 [&_.hdr]:flex [&_.hdr]:justify-between [&_.hdr]:border-b-4 [&_.hdr]:border-amber-300 [&_.muted]:text-slate-500 [&_h1]:text-xl [&_h1]:font-bold [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs [&_.sig]:mt-8 [&_.sig]:flex [&_.sig]:gap-8">
            {preview.map((r) => <div key={r.student.id} dangerouslySetInnerHTML={{ __html: reportCardHtml(r, labels) }} />)}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function monthRange(today: string) {
  const from = `${today.slice(0, 8)}01`;
  return { from, to: today };
}

function AttendanceSheet() {
  const { t } = useSchool();
  const me = useMe();
  const { classes } = useClasses();
  const toast = useToast();
  const [classId, setClassId] = useState("");
  const [rangeState, setRange] = useState<{ from: string; to: string } | null>(null);
  const range = rangeState ?? (me.data ? monthRange(me.data.today) : null);
  const cur = classId || classes[0]?.id || "";
  const res = useApi<{ sheet: Sheet }>(cur && range ? `/reports/class-attendance?class_id=${cur}&from=${range.from}&to=${range.to}` : null);
  const name = classes.find((c) => c.id === cur)?.name ?? "";
  const s = res.data?.sheet;
  function print() {
    if (!s) return;
    const html = `<div class="hdr"><div><h1>${escapeHtml(t("d_rep_attendance"))}: ${escapeHtml(name)}</h1><div class="muted">${range?.from} - ${range?.to}</div></div></div><table><tr><th>#</th><th>${escapeHtml(t("d_full_name"))}</th>${s.dates.map((d) => `<th class="c">${d.slice(8)}.${d.slice(5, 7)}</th>`).join("")}</tr>${s.students.map((x, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(`${x.last_name} ${x.first_name}`)}</td>${x.cells.map((c) => `<td class="c">${c ? LETTER[c] : ""}</td>`).join("")}</tr>`).join("")}</table><p class="muted">+ ${escapeHtml(t("stPresent"))}, A ${escapeHtml(t("stAbsent"))}, L ${escapeHtml(t("stLate"))}, E ${escapeHtml(t("stExcused"))}, S ${escapeHtml(t("stSick"))}</p>`;
    if (!printHtml(t("d_rep_attendance"), html, true)) toast("err", t("d_popup_blocked"));
  }
  return (
    <SectionCard>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label={t("class")}><Select value={cur} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label={t("d_from")}><Input type="date" value={range?.from ?? ""} onChange={(e) => range && setRange({ ...range, from: e.target.value })} /></Field>
        <Field label={t("d_to")}><Input type="date" value={range?.to ?? ""} onChange={(e) => range && setRange({ ...range, to: e.target.value })} /></Field>
        <Button disabled={!s} onClick={print}><Printer className="size-4" /> {t("d_print")}</Button>
        <Button disabled={!s} onClick={() => s && exportXlsx(`attendance_${name}`, [{ name, rows: [[t("d_full_name"), ...s.dates], ...s.students.map((x) => [`${x.last_name} ${x.first_name}`, ...x.cells.map((c) => (c ? t(ATTENDANCE_LABEL[c]) : ""))])] }])}><Download className="size-4" /> {t("d_export")}</Button>
      </div>
      <Async state={res} rows={4} empty={!!s && s.dates.length === 0}>
        {s && <p className="text-sm text-slate-500 dark:text-slate-400">{s.students.length} {t("d_students_count")} · {s.dates.length} {t("d_days_marked")}</p>}
      </Async>
    </SectionCard>
  );
}

function ClassPerformance() {
  const { t, L } = useSchool();
  const me = useMe();
  const { classes } = useClasses();
  const toast = useToast();
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const cur = classId || classes[0]?.id || "";
  const res = useApi<{ report: ClassPerf }>(cur ? `/reports/class-performance?class_id=${cur}${termId ? `&term_id=${termId}` : ""}` : null);
  const name = classes.find((c) => c.id === cur)?.name ?? "";
  const r = res.data?.report;
  function print() {
    if (!r) return;
    const html = `<div class="hdr"><div><h1>${escapeHtml(t("d_rep_performance"))}: ${escapeHtml(name)}</h1><div class="muted">${escapeHtml(t("average"))}: ${r.class_average ?? "-"}</div></div></div>
<h2>${escapeHtml(t("d_student_ranking"))}</h2><table><tr><th>#</th><th>${escapeHtml(t("d_full_name"))}</th><th class="c">${escapeHtml(t("average"))}</th><th class="c">%</th></tr>${[...r.students].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((x) => `<tr><td>${x.rank ?? "-"}</td><td>${escapeHtml(`${x.last_name} ${x.first_name}`)}</td><td class="c">${x.average ?? "-"}</td><td class="c">${x.attendance_percent ?? "-"}</td></tr>`).join("")}</table>
<h2>${escapeHtml(t("d_subject_avgs"))}</h2><table>${r.subject_averages.map((s) => `<tr><td>${escapeHtml(L(s.subject))}</td><td class="c">${s.average ?? "-"}</td></tr>`).join("")}</table>
<h2>${escapeHtml(t("d_chart_grade_dist"))}</h2><table><tr>${r.distribution.map((d) => `<th class="c">${d.score}</th>`).join("")}</tr><tr>${r.distribution.map((d) => `<td class="c">${d.count}</td>`).join("")}</tr></table>`;
    if (!printHtml(t("d_rep_performance"), html)) toast("err", t("d_popup_blocked"));
  }
  return (
    <SectionCard>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label={t("class")}><Select value={cur} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label={t("term")}><Select value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">{t("d_whole_year")}</option>{me.data?.terms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Button disabled={!r} onClick={print}><Printer className="size-4" /> {t("d_print")}</Button>
        <Button disabled={!r} onClick={() => r && exportXlsx(`performance_${name}`, [
          { name: "students", rows: [["#", t("d_full_name"), t("average"), "%", t("d_streak")], ...r.students.map((x) => [x.rank, `${x.last_name} ${x.first_name}`, x.average, x.attendance_percent, x.streak])] },
          { name: "subjects", rows: [[t("subject"), t("average")], ...r.subject_averages.map((s) => [L(s.subject), s.average])] },
        ])}><Download className="size-4" /> {t("d_export")}</Button>
      </div>
      <Async state={res} rows={4}>{r && <p className="text-sm text-slate-500 dark:text-slate-400">{t("average")}: <b>{r.class_average ?? "-"}</b> · {r.students.length} {t("d_students_count")}</p>}</Async>
    </SectionCard>
  );
}
