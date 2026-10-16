"use client";

import { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Send, XCircle } from "lucide-react";
import { spost } from "@/lib/school/client";
import { ATTENDANCE_LABEL } from "@/lib/school/i18n";
import { ATTENDANCE_STATUSES, type AttendanceRecord, type AttendanceStatus } from "@/lib/school/types";
import { Badge, Button, Card, cn, inputCls, STATUS_TONE } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { BundleGate, useFamily, type Bundle, type Excuse } from "./FamilyProvider";
import { useErrorText } from "./hooks";
import { buildMonthGrid, countDays, fmt, fmtPct, monthOf, shiftMonth, termTotals, toStatusMap } from "./logic";
import { useDateFmt } from "./useNames";
import { EmptyBox, PageTitle, STATUS_VIEW } from "./widgets";

export function FamilyAttendance() {
  const { t } = useSchool();
  return (
    <>
      <PageTitle title={t("navAttendance")} sub={t("f_attSub")} />
      <BundleGate>{(b) => <Body b={b} />}</BundleGate>
    </>
  );
}

function Body({ b }: { b: Bundle }) {
  const { t } = useSchool();
  const { me, isStudent } = useFamily();
  const df = useDateFmt();
  const [month, setMonth] = useState(monthOf(me.today));
  const [picked, setPicked] = useState<string | null>(null);
  const map = toStatusMap(b.att.days);
  const weeks = buildMonthGrid(month, map, me.today);
  const monthDays = b.att.days.filter((d) => monthOf(d.date) === month);
  const mc = countDays(monthDays);
  const first = b.att.days[0]?.date ?? me.year?.start_date ?? me.today;
  const canPrev = shiftMonth(month, -1) >= monthOf(first);
  const canNext = shiftMonth(month, 1) <= monthOf(me.today);
  const totals = termTotals(b.att.days, me.terms);
  const absences = b.att.rows.filter((r) => r.status !== "present" && r.lesson_no === null).sort((a, z) => (a.date < z.date ? 1 : -1));
  const pickedRow = picked ? b.att.rows.find((r) => r.date === picked) : null;

  return (
    <div className="space-y-4">
      <Card className="max-sm:px-2">
        <div className="mb-3 flex items-center justify-between">
          <button aria-label={t("f_prevMonth")} disabled={!canPrev} onClick={() => setMonth(shiftMonth(month, -1))} className="grid size-11 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronLeft className="size-5" /></button>
          <h2 className="text-base font-semibold capitalize">{df(`${month}-01`, { month: "long", year: "numeric" })}</h2>
          <button aria-label={t("f_nextMonth")} disabled={!canNext} onClick={() => setMonth(shiftMonth(month, 1))} className="grid size-11 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronRight className="size-5" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium max-sm:gap-0.5 text-slate-500 dark:text-slate-400" aria-hidden>
          {[1, 2, 3, 4, 5, 6, 7].map((w) => (
            <div key={w}>{df(`2024-01-0${w}`, { weekday: "short" })}</div>
          ))}
        </div>
        <div role="grid" aria-label={t("navAttendance")} className="mt-1 space-y-1">
          {weeks.map((w, i) => (
            <div role="row" key={i} className="grid grid-cols-7 gap-1 max-sm:gap-0.5">
              {w.map((c) => {
                const v = c.status ? STATUS_VIEW[c.status] : null;
                const Icon = v?.icon;
                return (
                  <button
                    role="gridcell"
                    key={c.date}
                    disabled={!c.inMonth || !c.status}
                    onClick={() => setPicked(c.date)}
                    aria-label={`${df(c.date)}${c.status ? `: ${t(ATTENDANCE_LABEL[c.status])}` : ""}`}
                    className={cn(
                      "relative flex aspect-square max-sm:aspect-auto max-sm:min-h-11 flex-col items-center justify-center rounded-lg text-xs font-medium",
                      !c.inMonth && "invisible",
                      v ? v.cell : c.weekend ? "bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-600" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                      c.isToday && "ring-2 ring-indigo-600 dark:ring-fuchsia-400",
                      picked === c.date && "outline outline-2 outline-offset-1 outline-indigo-500",
                    )}
                  >
                    <span>{c.day}</span>
                    {Icon && <Icon className="size-3.5" aria-hidden />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t("f_legend")}>
          {ATTENDANCE_STATUSES.map((s) => {
            const I = STATUS_VIEW[s].icon;
            return (
              <li key={s} className="flex items-center gap-1.5">
                <span className={cn("grid size-5 place-items-center rounded", STATUS_VIEW[s].cell)}><I className="size-3" aria-hidden /></span>
                {t(ATTENDANCE_LABEL[s])}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {mc.total ? fmt(t("f_monthSummary"), { present: mc.present + mc.late, total: mc.total, pct: fmtPct(mc.percent) }) : t("f_noRecordsMonth")}
        </p>
        {pickedRow && <DayDetail row={pickedRow} />}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("f_termTotals")}</h2>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400"><tr><th className="py-1 text-left">{t("term")}</th>{ATTENDANCE_STATUSES.map((s) => <th key={s} className="px-1 text-center">{t(ATTENDANCE_LABEL[s])}</th>)}<th className="px-1 text-center">%</th></tr></thead>
            <tbody>
              {totals.map(({ term, counts }) => (
                <tr key={term.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 font-medium">{term.number}</td>
                  {ATTENDANCE_STATUSES.map((s) => <td key={s} className="px-1 text-center tabular-nums">{counts[s]}</td>)}
                  <td className="px-1 text-center font-semibold tabular-nums">{fmtPct(counts.percent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("f_absenceList")}</h2>
        {absences.length === 0 ? <EmptyBox text={t("f_noAbsences")} /> : (
          <ul className="space-y-2">
            {absences.slice(0, 30).map((r) => (
              <AbsenceRow key={r.id} r={r} excuse={b.excuses.find((e) => e.date === r.date)} canExplain={!isStudent && (r.status === "absent" || r.status === "late")} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DayDetail({ row }: { row: AttendanceRecord }) {
  const { t } = useSchool();
  const df = useDateFmt();
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
      <b>{df(row.date, { weekday: "long", day: "numeric", month: "long" })}</b>: {t(ATTENDANCE_LABEL[row.status])}
      {row.status === "late" && row.minutes_late > 0 && ` (${row.minutes_late} ${t("f_min")})`}
      {row.note && <p className="text-slate-600 dark:text-slate-300">{row.note}</p>}
    </div>
  );
}

function AbsenceRow({ r, excuse, canExplain }: { r: AttendanceRecord; excuse?: Excuse; canExplain: boolean }) {
  const { t } = useSchool();
  const df = useDateFmt();
  const { child, reloadBundle } = useFamily();
  const errText = useErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"sick" | "family" | "other">("sick");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await spost<{ delivered: boolean }>("/family/excuse", { student_id: child.id, date: r.date, reason, note });
      setMsg({ ok: true, text: res.delivered ? t("f_excuseSent") : t("f_excuseSavedNoTeacher") });
      setOpen(false);
      reloadBundle();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }
  const St = r.status as AttendanceStatus;
  const verdict = excuse?.status === "rejected" ? "rejected" : excuse?.resolved || excuse?.status === "accepted" ? "accepted" : "pending";
  return (
    <li className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{df(r.date, { weekday: "short", day: "numeric", month: "short" })}</span>
        <Badge tone={STATUS_TONE[St]}>{t(ATTENDANCE_LABEL[St])}</Badge>
        {excuse && <Badge tone="gray">{t("f_explained")}</Badge>}
        {excuse && (
          <Badge tone={verdict === "accepted" ? "green" : verdict === "rejected" ? "red" : "amber"} className="gap-1">
            {verdict === "accepted" ? <CheckCircle2 className="size-3" aria-hidden /> : verdict === "rejected" ? <XCircle className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />}
            {t(verdict === "accepted" ? "a_exs_accepted" : verdict === "rejected" ? "a_exs_rejected" : "a_exs_pending")}
          </Badge>
        )}
        {canExplain && !excuse && <Button size="sm" className="ml-auto" onClick={() => setOpen((v) => !v)} aria-expanded={open}><Send className="size-3.5" />{t("f_sendExplanation")}</Button>}
      </div>
      {r.note && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("f_schoolNote")}: {r.note}</p>}
      {excuse && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("f_yourExplanation")}: {t(excuse.reason === "sick" ? "stSick" : excuse.reason === "family" ? "f_reasonFamily" : "f_reasonOther")}{excuse.note ? ` - ${excuse.note}` : ""}</p>}
      {open && (
        <div className="mt-2 space-y-2">
          <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} aria-label={t("f_reason")}>
            <option value="sick">{t("stSick")}</option>
            <option value="family">{t("f_reasonFamily")}</option>
            <option value="other">{t("f_reasonOther")}</option>
          </select>
          <textarea className={inputCls} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("f_notePlaceholder")} aria-label={t("f_note")} />
          <Button variant="primary" size="sm" loading={busy} onClick={send}>{t("f_send")}</Button>
        </div>
      )}
      {msg && <p role="status" className={cn("mt-2 text-xs", msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600")}>{msg.text}</p>}
    </li>
  );
}
