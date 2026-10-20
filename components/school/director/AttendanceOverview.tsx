"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { spost } from "@/lib/school/client";
import { rangeFor, shiftRange, type RangeView } from "@/lib/school/director-logic";
import { ATTENDANCE_LABEL } from "@/lib/school/i18n";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/school/types";
import { Badge, Button, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, DirPage, EmptyState, Field, Input, Kpi, Modal, PctBadge, SectionCard, Select, TableWrap, exportXlsx, fmtDate, tableCls, tdCls, thCls, useApi, useErrText, useMe, useToast,
} from "./common";

interface Overview {
  from: string; to: string; dates: string[];
  classes: { class_id: string; class_name: string; grade: number; students: number; counts: Record<AttendanceStatus, number>; total: number; percent: number | null; days: (number | null)[] }[];
  day_percent: { date: string; percent: number | null }[];
  reasons: { key: string; reason: string; count: number }[];
}
interface Sheet { class_id: string; dates: string[]; students: { student_id: string; last_name: string; first_name: string; cells: (AttendanceStatus | null)[] }[] }
const CELL: Record<AttendanceStatus, string> = {
  present: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200", absent: "bg-red-500 text-white", late: "bg-amber-300 text-slate-900",
  excused: "bg-sky-300 text-slate-900", sick: "bg-indigo-300 text-slate-900",
};
const LETTER: Record<AttendanceStatus, string> = { present: "+", absent: "A", late: "L", excused: "E", sick: "S" };

export function AttendanceOverview({ initialClass }: { initialClass?: string }) {
  const { t } = useSchool();
  const me = useMe();
  const today = me.data?.today ?? null;
  const [view, setView] = useState<RangeView>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [drill, setDrill] = useState<string | null>(initialClass ?? null);
  const date = anchor ?? today;
  const range = date ? rangeFor(view, date) : null;
  const res = useApi<Overview>(range ? `/director/attendance-overview?from=${range.from}&to=${range.to}` : null);
  const d = res.data;
  const total = useMemo(() => {
    const ok = (d?.classes ?? []).reduce((n, c) => n + c.counts.present + c.counts.late, 0);
    const all = (d?.classes ?? []).reduce((n, c) => n + c.total, 0);
    return { pct: all ? Math.round((ok / all) * 1000) / 10 : null, absent: (d?.classes ?? []).reduce((n, c) => n + c.counts.absent, 0), all };
  }, [d]);

  return (
    <DirPage
      title={t("navAttendance")} subtitle={range ? `${fmtDate(range.from)} - ${fmtDate(range.to)}` : undefined}
      actions={
        <Button
          disabled={!d}
          onClick={() => d && exportXlsx(`attendance_${d.from}_${d.to}`, [{
            name: "classes",
            rows: [[t("class"), t("d_students_count"), "%", ...ATTENDANCE_STATUSES.map((s) => t(ATTENDANCE_LABEL[s]))], ...d.classes.map((c) => [c.class_name, c.students, c.percent, ...ATTENDANCE_STATUSES.map((s) => c.counts[s])])],
          }, { name: "reasons", rows: [[t("d_reason"), "#"], ...d.reasons.map((r) => [r.reason || t("d_no_reason"), r.count])] }])}
        >
          <Download className="size-4" /> {t("d_export")}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("d_view_mode")} className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
          {(["day", "week", "month"] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium max-sm:min-h-11 max-sm:min-w-11", view === v ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300")}>{t(`d_view_${v}` as "d_view_day")}</button>
          ))}
        </div>
        <Button size="icon" aria-label={t("d_page_prev")} disabled={!date} onClick={() => date && setAnchor(shiftRange(view, date, -1))}><ChevronLeft className="size-4" /></Button>
        <Input aria-label={t("date")} type="date" value={date ?? ""} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="w-auto" />
        <Button size="icon" aria-label={t("d_page_next")} disabled={!date} onClick={() => date && setAnchor(shiftRange(view, date, 1))}><ChevronRight className="size-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setAnchor(null)}>{t("today")}</Button>
      </div>

      <Async state={res} rows={6} empty={!!d && d.classes.length === 0}>
        {d && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label={t("d_att_pct")} value={total.pct === null ? "-" : `${total.pct}%`} tone={total.pct !== null && total.pct < 90 ? "warn" : "default"} />
              <Kpi label={t("stAbsent")} value={total.absent} />
              <Kpi label={t("d_records")} value={total.all} />
              <Kpi label={t("d_days_marked")} value={d.dates.length} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title={t("d_att_by_class")}>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={d.classes.map((c) => ({ name: c.class_name, v: c.percent }))}>
                      <CartesianGrid stroke="rgba(148,163,184,.25)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} /><YAxis domain={[50, 100]} width={34} tick={{ fontSize: 11 }} /><Tooltip />
                      <Bar dataKey="v" fill="#1d3557" radius={[4, 4, 0, 0]} name="%" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
              <SectionCard title={d.dates.length > 1 ? t("d_chart_att_trend") : t("d_absence_reasons")}>
                {d.dates.length > 1 ? (
                  <div className="h-64">
                    <ResponsiveContainer>
                      <LineChart data={d.day_percent.map((x) => ({ name: x.date.slice(5), v: x.percent }))}>
                        <CartesianGrid stroke="rgba(148,163,184,.25)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[50, 100]} width={34} tick={{ fontSize: 11 }} /><Tooltip />
                        <Line dataKey="v" stroke="#f4b942" strokeWidth={2.5} dot={false} name="%" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <Reasons d={d} />}
              </SectionCard>
            </div>
            {d.dates.length > 1 && <SectionCard title={t("d_absence_reasons")}><Reasons d={d} /></SectionCard>}
            <TableWrap>
              <table className={tableCls}>
                <thead><tr><th className={thCls}>{t("class")}</th><th className={thCls}>%</th>{ATTENDANCE_STATUSES.map((s) => <th key={s} className={`${thCls} hidden sm:table-cell`}>{t(ATTENDANCE_LABEL[s])}</th>)}<th className={`${thCls} relative`}><span className="sr-only">{t("d_actions")}</span></th></tr></thead>
                <tbody>
                  {d.classes.map((c) => (
                    <tr key={c.class_id} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/40", drill === c.class_id && "bg-indigo-50 dark:bg-indigo-900/20")}>
                      <td className={`${tdCls} font-bold`}>{c.class_name}</td><td className={tdCls}><PctBadge v={c.percent} /></td>
                      {ATTENDANCE_STATUSES.map((s) => <td key={s} className={`${tdCls} hidden tabular-nums sm:table-cell`}>{c.counts[s]}</td>)}
                      <td className={`${tdCls} text-right`}><Button size="sm" onClick={() => setDrill(drill === c.class_id ? null : c.class_id)}>{drill === c.class_id ? t("close") : t("d_open_sheet")}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {drill && range && <ClassSheet key={`${drill}${range.from}${range.to}`} classId={drill} name={d.classes.find((c) => c.class_id === drill)?.class_name ?? ""} from={range.from} to={range.to} onChanged={res.reload} />}
          </div>
        )}
      </Async>
    </DirPage>
  );
}

function Reasons({ d }: { d: Overview }) {
  const { t } = useSchool();
  if (d.reasons.length === 0) return <EmptyState />;
  const max = Math.max(...d.reasons.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {d.reasons.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate">{r.reason || <i className="text-slate-500 dark:text-slate-400">{t("d_no_reason")}</i>}</span><b className="tabular-nums">{r.count}</b></div>
          <div className="mt-0.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${(r.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function ClassSheet({ classId, name, from, to, onChanged }: { classId: string; name: string; from: string; to: string; onChanged: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const sheet = useApi<{ sheet: Sheet }>(`/attendance/sheet?class_id=${classId}&from=${from}&to=${to}`);
  const [fix, setFix] = useState<{ student_id: string; name: string; date: string; status: AttendanceStatus | null } | null>(null);
  const [f, setF] = useState<{ status: AttendanceStatus; minutes: number; note: string }>({ status: "present", minutes: 0, note: "" });
  const [busy, setBusy] = useState(false);
  const s = sheet.data?.sheet;

  async function save() {
    if (!fix) return;
    setBusy(true);
    try {
      await spost("/attendance/bulk", { class_id: classId, date: fix.date, lesson_no: null, records: [{ student_id: fix.student_id, status: f.status, minutes_late: f.status === "late" ? f.minutes : 0, note: f.note }] });
      toast("ok", t("d_correction_saved"));
      sheet.reload();
      onChanged();
      setFix(null);
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard
      title={`${t("d_class_sheet")}: ${name}`}
      actions={s && <Button size="sm" onClick={() => exportXlsx(`attendance_${name}_${from}_${to}`, [{ name, rows: [[t("d_full_name"), ...s.dates], ...s.students.map((x) => [`${x.last_name} ${x.first_name}`, ...x.cells.map((c) => (c ? LETTER[c] : ""))])] }])}><Download className="size-3.5" /> xlsx</Button>}
    >
      <Async state={sheet} rows={5} empty={!!s && s.dates.length === 0}>
        {s && (
          <>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{t("d_correction_hint")}</p>
            <TableWrap>
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className={`${thCls} sticky left-0 z-10`}>{t("d_full_name")}</th>{s.dates.map((dt) => <th key={dt} className={`${thCls} text-center`}>{dt.slice(8)}<br />{dt.slice(5, 7)}</th>)}</tr></thead>
                <tbody>
                  {s.students.map((st) => (
                    <tr key={st.student_id}>
                      <td className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-100 bg-white px-2 py-1 font-medium dark:border-slate-800 dark:bg-slate-900">{st.last_name} {st.first_name}</td>
                      {st.cells.map((c, i) => (
                        <td key={i} className="border-b border-slate-100 p-0.5 text-center dark:border-slate-800">
                          <button
                            aria-label={`${st.last_name} ${s.dates[i]}: ${c ? t(ATTENDANCE_LABEL[c]) : "-"}`}
                            onClick={() => { setFix({ student_id: st.student_id, name: `${st.last_name} ${st.first_name}`, date: s.dates[i], status: c }); setF({ status: c ?? "present", minutes: 0, note: "" }); }}
                            className={cn("size-6 rounded text-[11px] font-bold hover:ring-2 hover:ring-indigo-400", c ? CELL[c] : "bg-slate-100 text-slate-500 dark:text-slate-400 dark:bg-slate-800")}
                          >
                            {c ? LETTER[c] : "·"}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
      </Async>
      <Modal
        open={!!fix} onClose={() => setFix(null)} size="sm" title={`${t("d_correct_mark")}: ${fix?.name ?? ""}`}
        footer={<><Button onClick={() => setFix(null)}>{t("cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("save")}</Button></>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">{fmtDate(fix?.date)} {fix?.status && <Badge>{t(ATTENDANCE_LABEL[fix.status])}</Badge>}</p>
          <Field label={t("d_status")}><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as AttendanceStatus })}>{ATTENDANCE_STATUSES.map((s2) => <option key={s2} value={s2}>{t(ATTENDANCE_LABEL[s2])}</option>)}</Select></Field>
          {f.status === "late" && <Field label={t("d_minutes_late")}><Input type="number" min={0} max={240} value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) || 0 })} /></Field>}
          <Field label={t("d_reason")}><Input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("d_audit_note")}</p>
        </div>
      </Modal>
    </SectionCard>
  );
}
