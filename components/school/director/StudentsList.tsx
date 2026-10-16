"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Plus, Search, Upload } from "lucide-react";
import { qs } from "@/lib/school/client";
import { RISK_LABEL } from "@/lib/school/i18n";
import { STUDENT_STATUSES, type StudentListItem } from "@/lib/school/types";
import { Badge, Button, inputCls } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, DirPage, EmptyState, FilterSelect, PctBadge, TableWrap, exportXlsx, fmtDate, fmtNum, studentName, tableCls, tdCls, thCls, useApi, useClasses, useDebounced,
} from "./common";
import { StudentForm } from "./StudentForm";

const PAGE = 25;
export const STATUS_TONE_S = { active: "green", transferred: "blue", graduated: "navy", expelled: "red" } as const;

export function StudentsList() {
  const { t } = useSchool();
  const { classes } = useClasses();
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("active");
  const [risk, setRisk] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q);
  const res = useApi<{ total: number; students: StudentListItem[] }>(`/students${qs({ with_stats: 1, q: dq, class_id: classId, status, limit: 500 })}`);
  const rows = useMemo(() => {
    const all = res.data?.students ?? [];
    return risk === "any" ? all.filter((s) => s.risk?.length) : risk ? all.filter((s) => s.risk?.includes(risk as never)) : all;
  }, [res.data, risk]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PAGE, cur * PAGE + PAGE);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  return (
    <DirPage
      title={t("navStudents")}
      subtitle={res.data ? `${rows.length} / ${res.data.total}` : undefined}
      actions={
        <>
          <Button
            onClick={() => exportXlsx("students", [{
              name: "students",
              rows: [
                [t("d_student_code"), t("d_full_name"), t("class"), t("d_birth_date"), t("d_status"), t("d_phone"), t("d_att_pct"), t("average")],
                ...rows.map((s) => [s.student_code, studentName(s), s.class_name, s.birth_date, t(`d_st_${s.status}` as "d_st_active"), s.phone, s.attendance_percent, s.average]),
              ],
            }])}
            disabled={!rows.length}
          >
            <Download className="size-4" /> {t("d_export")}
          </Button>
          <Link href="/school/director/import" className="inline-flex max-sm:min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <Upload className="size-4" /> {t("navImport")}
          </Link>
          <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t("d_new_student")}</Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-500 dark:text-slate-400" />
          <input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className={`${inputCls} pl-8`} />
        </div>
        <FilterSelect label={t("class")} value={classId} onChange={reset(setClassId)}>
          <option value="">{t("class")}: {t("d_all")}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FilterSelect>
        <FilterSelect label={t("d_status")} value={status} onChange={reset(setStatus)}>
          <option value="">{t("d_status")}: {t("d_all")}</option>
          {STUDENT_STATUSES.map((s) => <option key={s} value={s}>{t(`d_st_${s}` as "d_st_active")}</option>)}
        </FilterSelect>
        <FilterSelect label={t("d_risk")} value={risk} onChange={reset(setRisk)}>
          <option value="">{t("d_risk")}: {t("d_all")}</option>
          <option value="any">{t("d_at_risk")}</option>
          <option value="low_attendance">{t("riskLowAttendance")}</option>
          <option value="low_average">{t("riskLowAverage")}</option>
          <option value="absence_streak">{t("riskAbsenceStreak")}</option>
        </FilterSelect>
      </div>

      <Async state={res} empty={!!res.data && rows.length === 0}>
        <TableWrap>
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>{t("d_full_name")}</th><th className={thCls}>{t("class")}</th><th className={`${thCls} hidden md:table-cell`}>{t("d_student_code")}</th>
                <th className={`${thCls} hidden lg:table-cell`}>{t("d_birth_date")}</th><th className={thCls}>{t("d_att_pct")}</th><th className={thCls}>{t("average")}</th>
                <th className={thCls}>{t("d_status")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className={tdCls}>
                    <Link href={`/school/director/students/${s.id}`} className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center font-semibold text-indigo-700 hover:underline dark:text-fuchsia-300">{studentName(s)}</Link>
                    {!!s.risk?.length && <span className="ml-2 inline-flex flex-wrap gap-1">{s.risk.map((r) => <Badge key={r} tone="red">{t(RISK_LABEL[r])}</Badge>)}</span>}
                  </td>
                  <td className={tdCls}>{s.class_name ?? "-"}</td>
                  <td className={`${tdCls} hidden font-mono text-xs md:table-cell`}>{s.student_code}</td>
                  <td className={`${tdCls} hidden lg:table-cell`}>{fmtDate(s.birth_date)}</td>
                  <td className={tdCls}><PctBadge v={s.attendance_percent} /></td>
                  <td className={`${tdCls} tabular-nums`}>{fmtNum(s.average)}</td>
                  <td className={tdCls}><Badge tone={STATUS_TONE_S[s.status]}>{t(`d_st_${s.status}` as "d_st_active")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {rows.length === 0 && <EmptyState />}
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <Button size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>{t("d_page_prev")}</Button>
            <span className="text-slate-500 dark:text-slate-400">{cur + 1} / {pages}</span>
            <Button size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>{t("d_page_next")}</Button>
          </div>
        )}
      </Async>
      <StudentForm open={creating} onClose={() => setCreating(false)} onSaved={() => res.reload()} />
    </DirPage>
  );
}
