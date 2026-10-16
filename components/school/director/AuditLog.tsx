"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { AuditRow } from "@/lib/school/db";
import { qs } from "@/lib/school/client";
import { Badge, Button } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { Async, DirPage, FilterSelect, Input, TableWrap, exportXlsx, fmtDateTime, tableCls, tdCls, thCls, useApi, useDebounced } from "./common";

const RESOURCES = ["students", "teachers", "classes", "subjects", "teaching_assignments", "schedule_slots", "attendance", "grade_entries", "term_grades", "terms", "school_years", "announcements", "guardians", "student_guardians", "behavior_notes", "auth"];

export function AuditLog() {
  const { t } = useSchool();
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dq = useDebounced(q);
  const res = useApi<{ rows: AuditRow[] }>(`/director/audit${qs({ resource, action, q: dq, from, to, limit: 300 })}`);
  const rows = res.data?.rows ?? [];
  const actions = [...new Set(rows.map((r) => r.action))];
  return (
    <DirPage
      title={t("d_audit_log")}
      actions={<Button disabled={!rows.length} onClick={() => exportXlsx("audit", [{ name: "audit", rows: [[t("date"), t("d_user"), t("d_action"), t("d_resource"), "id", t("d_details")], ...rows.map((r) => [r.created_at, r.user_email, r.action, r.resource, r.record_id, r.diff ? JSON.stringify(r.diff) : ""])] }])}><Download className="size-4" /> {t("d_export")}</Button>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <FilterSelect label={t("d_resource")} value={resource} onChange={setResource}><option value="">{t("d_resource")}: {t("d_all")}</option>{RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}</FilterSelect>
        <FilterSelect label={t("d_action")} value={action} onChange={setAction}><option value="">{t("d_action")}: {t("d_all")}</option>{actions.map((r) => <option key={r} value={r}>{r}</option>)}{action && !actions.includes(action) && <option value={action}>{action}</option>}</FilterSelect>
        <Input aria-label={t("d_from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        <Input aria-label={t("d_to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
      </div>
      <Async state={res} empty={!!res.data && rows.length === 0}>
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>{t("date")}</th><th className={thCls}>{t("d_user")}</th><th className={thCls}>{t("d_action")}</th><th className={thCls}>{t("d_resource")}</th><th className={thCls}>{t("d_details")}</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="align-top">
                  <td className={`${tdCls} whitespace-nowrap text-xs`}>{fmtDateTime(r.created_at)}</td>
                  <td className={`${tdCls} text-xs`}>{r.user_email ?? "-"}</td>
                  <td className={tdCls}><Badge tone={r.action.includes("delete") ? "red" : r.action.includes("create") ? "green" : "blue"}>{r.action}</Badge></td>
                  <td className={`${tdCls} text-xs`}>{r.resource}<br /><span className="font-mono text-slate-500 dark:text-slate-400">{r.record_id?.slice(0, 8)}</span></td>
                  <td className={`${tdCls} max-w-md break-all font-mono text-xs text-slate-500 dark:text-slate-400`}>{r.diff ? JSON.stringify(r.diff) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Async>
    </DirPage>
  );
}
