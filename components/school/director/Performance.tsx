"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { legendFormatter } from "@/components/layout/chart-legend";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { sget, spost } from "@/lib/school/client";
import { filterRisk, mean, rankDesc } from "@/lib/school/director-logic";
import { RISK_LABEL } from "@/lib/school/i18n";
import type { RiskFlag, RiskRow, BehaviorNote } from "@/lib/school/types";
import { Badge, Button, cn, gradeTone } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, DirPage, EmptyState, FilterSelect, Input, PctBadge, SectionCard, TableWrap, Tabs, exportXlsx, fmtNum, tableCls, tdCls, thCls, useApi, useClasses, useErrText, useMe, useSubjectName,
  useSubjects, useToast, useDebounced, Textarea, ConfirmDialog,
} from "./common";

interface ClassReport {
  class_id: string; class_average: number | null; distribution: { score: number; count: number }[];
  students: { student_id: string; last_name: string; first_name: string; average: number | null; rank: number | null; attendance_percent: number | null; risk: RiskFlag[] }[];
  subject_averages: { subject_id: string; subject: { uz: string; ru: string; en: string }; average: number | null }[];
}
type Tab = "ranking" | "subjects" | "trends" | "risk";

function useClassReports(classIds: string[], termId: string) {
  const key = `${classIds.join(",")}|${termId}`;
  const [st, setSt] = useState<{ key: string; reports: ClassReport[] } | null>(null);
  useEffect(() => {
    if (!classIds.length) return;
    let alive = true;
    Promise.all(classIds.map((id) => sget<{ report: ClassReport }>(`/reports/class-performance?class_id=${id}${termId ? `&term_id=${termId}` : ""}`).then((r) => ({ ...r.report, class_id: id })).catch(() => null)))
      .then((rs) => alive && setSt({ key, reports: rs.filter((x): x is ClassReport => !!x) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { reports: st?.key === key ? st.reports : null };
}

export function Performance({ initialTab }: { initialTab?: string }) {
  const { t, L } = useSchool();
  const sn = useSubjectName();
  const me = useMe();
  const { classes } = useClasses();
  const { subjects } = useSubjects();
  const [tab, setTab] = useState<Tab>((["ranking", "subjects", "trends", "risk"] as string[]).includes(initialTab ?? "") ? (initialTab as Tab) : "ranking");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState("");
  const grades = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b);
  const ids = useMemo(() => classes.filter((c) => !grade || c.grade === Number(grade)).map((c) => c.id), [classes, grade]);
  const { reports } = useClassReports(tab === "risk" || tab === "trends" ? [] : ids, term);
  const subjAvg = (r: ClassReport) => (subject ? r.subject_averages.find((s) => s.subject_id === subject)?.average ?? null : r.class_average);

  const classRank = useMemo(() => rankDesc(reports ?? [], subjAvg), [reports, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const studentRank = useMemo(() => {
    const all = (reports ?? []).flatMap((r) => r.students.map((s) => ({ ...s, class_name: classes.find((c) => c.id === r.class_id)?.name ?? "" })));
    return rankDesc(all, (s) => s.average).slice(0, 30);
  }, [reports, classes]);
  const subjectTable = useMemo(() => {
    return subjects.map((s) => {
      const per = (reports ?? []).map((r) => ({ cls: classes.find((c) => c.id === r.class_id)?.name ?? "", v: r.subject_averages.find((x) => x.subject_id === s.id)?.average ?? null }));
      return { s, avg: mean(per.map((p) => p.v)), per };
    }).filter((x) => x.avg !== null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [reports, subjects, classes]);

  const filters = (
    <div className="flex flex-wrap gap-2">
      <FilterSelect label={t("d_grade")} value={grade} onChange={setGrade}><option value="">{t("d_grade")}: {t("d_all")}</option>{grades.map((g) => <option key={g} value={g}>{g}</option>)}</FilterSelect>
      <FilterSelect label={t("subject")} value={subject} onChange={setSubject}><option value="">{t("subject")}: {t("d_all")}</option>{subjects.map((s) => <option key={s.id} value={s.id}>{sn(s)}</option>)}</FilterSelect>
      <FilterSelect label={t("term")} value={term} onChange={setTerm}><option value="">{t("term")}: {t("d_year_to_date")}</option>{me.data?.terms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</FilterSelect>
    </div>
  );

  return (
    <DirPage title={t("d_performance")}>
      <Tabs value={tab} onChange={setTab} tabs={(["ranking", "subjects", "trends", "risk"] as Tab[]).map((k) => ({ key: k, label: t(`d_pt_${k}` as "d_pt_ranking") }))} />
      {tab !== "risk" && tab !== "trends" && filters}
      {tab === "ranking" && (
        <Wait reports={reports}>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={t("d_class_ranking")} actions={<Button size="sm" onClick={() => exportXlsx("class_ranking", [{ name: "classes", rows: [["#", t("class"), t("average")], ...classRank.map((x) => [x.rank, classes.find((c) => c.id === x.item.class_id)?.name, subjAvg(x.item)])] }])}><Download className="size-3.5" /> xlsx</Button>}>
              <TableWrap>
                <table className={tableCls}><thead><tr><th className={thCls}>#</th><th className={thCls}>{t("class")}</th><th className={thCls}>{t("average")}</th></tr></thead>
                  <tbody>{classRank.map(({ item, rank }) => <tr key={item.class_id}><td className={tdCls}>{rank ?? "-"}</td><td className={`${tdCls} font-bold`}>{classes.find((c) => c.id === item.class_id)?.name}</td><td className={tdCls}><Badge tone={gradeTone(subjAvg(item))}>{fmtNum(subjAvg(item))}</Badge></td></tr>)}</tbody>
                </table>
              </TableWrap>
            </SectionCard>
            <SectionCard title={t("d_student_ranking")} actions={<Button size="sm" onClick={() => exportXlsx("student_ranking", [{ name: "students", rows: [["#", t("d_full_name"), t("class"), t("average"), "%"], ...studentRank.map((x) => [x.rank, `${x.item.last_name} ${x.item.first_name}`, x.item.class_name, x.item.average, x.item.attendance_percent])] }])}><Download className="size-3.5" /> xlsx</Button>}>
              <TableWrap className="max-h-[32rem] overflow-y-auto">
                <table className={tableCls}><thead><tr><th className={thCls}>#</th><th className={thCls}>{t("d_full_name")}</th><th className={thCls}>{t("class")}</th><th className={thCls}>{t("average")}</th></tr></thead>
                  <tbody>{studentRank.map(({ item, rank }) => <tr key={item.student_id}><td className={tdCls}>{rank}</td><td className={tdCls}><Link className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center hover:underline" href={`/school/director/students/${item.student_id}`}>{item.last_name} {item.first_name}</Link></td><td className={tdCls}>{item.class_name}</td><td className={tdCls}><Badge tone={gradeTone(item.average)}>{fmtNum(item.average)}</Badge></td></tr>)}</tbody>
                </table>
              </TableWrap>
            </SectionCard>
          </div>
        </Wait>
      )}
      {tab === "subjects" && (
        <Wait reports={reports}>
          <SectionCard title={t("d_subject_avgs")}>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={subjectTable.map((x) => ({ name: (x.s.short || sn(x.s)).slice(0, 10), v: x.avg }))}>
                  <CartesianGrid stroke="rgba(148,163,184,.25)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} /><YAxis domain={[2, 5]} width={30} tick={{ fontSize: 11 }} /><Tooltip />
                  <Bar dataKey="v" fill="#4a78a8" radius={[4, 4, 0, 0]} name={t("average")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <TableWrap className="mt-3">
              <table className={tableCls}><thead><tr><th className={thCls}>{t("subject")}</th><th className={thCls}>{t("average")}</th><th className={thCls}>{t("d_best_class")}</th><th className={thCls}>{t("d_worst_class")}</th></tr></thead>
                <tbody>{subjectTable.map((x) => {
                  const ps = x.per.filter((p) => p.v !== null).sort((a, b) => (b.v ?? 0) - (a.v ?? 0));
                  return <tr key={x.s.id}><td className={tdCls}>{L(x.s.name)}</td><td className={tdCls}><Badge tone={gradeTone(x.avg)}>{fmtNum(x.avg)}</Badge></td><td className={tdCls}>{ps[0]?.cls} ({fmtNum(ps[0]?.v)})</td><td className={tdCls}>{ps[ps.length - 1]?.cls} ({fmtNum(ps[ps.length - 1]?.v)})</td></tr>;
                })}</tbody>
              </table>
            </TableWrap>
          </SectionCard>
        </Wait>
      )}
      {tab === "trends" && <Trends />}
      {tab === "risk" && <RiskList grades={grades} />}
    </DirPage>
  );
}

function Wait({ reports, children }: { reports: ClassReport[] | null; children: React.ReactNode }) {
  return <Async state={{ data: reports, error: null, loading: !reports, reload: () => {} }} rows={6}>{children}</Async>;
}

function Trends() {
  const { t } = useSchool();
  const res = useApi<{ termAverages: Record<string, number | null>[]; terms: { id: string; number: number }[] }>("/director/overview");
  const palette = ["#1d3557", "#4a78a8", "#f4b942", "#10b981", "#ef4444", "#8b5cf6", "#64748b", "#06b6d4", "#f97316", "#84cc16", "#ec4899"];
  const data = res.data ? res.data.terms.map((tm) => Object.fromEntries([["name", `${t("term")} ${tm.number}`], ...res.data!.termAverages.map((g) => [`g${g.grade}`, g[`t${tm.number}`]])])) : [];
  return (
    <Async state={res}>
      <SectionCard title={t("d_trend_by_grade")}>
        <div className="h-80" role="img" aria-label={t("d_trend_by_grade")}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(148,163,184,.25)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[2, 5]} width={30} tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} formatter={legendFormatter} />
              {res.data?.termAverages.map((g, i) => <Line key={String(g.grade)} dataKey={`g${g.grade}`} name={`${g.grade}`} stroke={palette[i % palette.length]} strokeWidth={2} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </Async>
  );
}

function RiskList({ grades }: { grades: number[] }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const res = useApi<{ risk: RiskRow[] }>("/reports/risk?limit=200");
  const [grade, setGrade] = useState("");
  const [flag, setFlag] = useState<RiskFlag | "">("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [open, setOpen] = useState<RiskRow | null>(null);
  const rows = useMemo(() => filterRisk(res.data?.risk ?? [], { grade: grade ? Number(grade) : null, flag, q: dq, nameOf: (r) => r.name }), [res.data, grade, flag, dq]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <FilterSelect label={t("d_grade")} value={grade} onChange={setGrade}><option value="">{t("d_grade")}: {t("d_all")}</option>{grades.map((g) => <option key={g} value={g}>{g}</option>)}</FilterSelect>
        <FilterSelect label={t("d_risk")} value={flag} onChange={(v) => setFlag(v as RiskFlag | "")}><option value="">{t("d_risk")}: {t("d_all")}</option>{(Object.keys(RISK_LABEL) as RiskFlag[]).map((f) => <option key={f} value={f}>{t(RISK_LABEL[f])}</option>)}</FilterSelect>
        <Button disabled={!rows.length} onClick={() => exportXlsx("risk", [{ name: "risk", rows: [[t("d_full_name"), t("class"), t("d_risk"), "%", t("average"), t("d_streak")], ...rows.map((r) => [r.name, r.class_name, r.flags.map((f) => t(RISK_LABEL[f])).join(", "), r.attendance_percent, r.average, r.streak])] }])}><Download className="size-4" /> {t("d_export")}</Button>
      </div>
      <Async state={res} empty={!!res.data && rows.length === 0}>
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>{t("d_full_name")}</th><th className={thCls}>{t("class")}</th><th className={thCls}>{t("d_risk")}</th><th className={thCls}>%</th><th className={thCls}>{t("average")}</th><th className={thCls}>{t("d_streak")}</th><th className={thCls}><span className="sr-only">{t("d_actions")}</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student_id}>
                  <td className={tdCls}><Link className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center font-semibold hover:underline" href={`/school/director/students/${r.student_id}`}>{r.name}</Link></td>
                  <td className={tdCls}>{r.class_name}</td>
                  <td className={tdCls}><div className="flex flex-wrap gap-1">{r.flags.map((f) => <Badge key={f} tone="red">{t(RISK_LABEL[f])}</Badge>)}</div></td>
                  <td className={tdCls}><PctBadge v={r.attendance_percent} /></td>
                  <td className={tdCls}>{fmtNum(r.average)}</td>
                  <td className={tdCls}>{r.streak}</td>
                  <td className={`${tdCls} text-right`}><Button size="sm" onClick={() => setOpen(r)}>{t("d_actions")}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {rows.length === 0 && <EmptyState />}
      </Async>
      {open && <RiskActions row={open} onClose={() => setOpen(null)} errText={errText} toast={toast} />}
    </div>
  );
}

function RiskActions({ row, onClose, errText, toast }: { row: RiskRow; onClose: () => void; errText: (e: unknown) => string; toast: (tone: "ok" | "err", text: string) => void }) {
  const { t } = useSchool();
  const notes = useApi<{ notes: BehaviorNote[] }>(`/director/notes?student_id=${row.student_id}`);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function add() {
    try {
      await spost("/director/notes", { student_id: row.student_id, kind: "negative", text: `[${t("d_risk_action")}] ${text}` });
      setText("");
      setConfirm(false);
      notes.reload();
      toast("ok", t("d_saved"));
    } catch (e) {
      toast("err", errText(e));
    }
  }
  return (
    <SectionCard title={`${row.name} · ${row.class_name ?? ""}`} actions={<Button size="sm" onClick={onClose}>{t("close")}</Button>} className={cn("border-indigo-300 dark:border-indigo-700")}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Textarea aria-label={t("d_risk_action")} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("d_risk_action_ph")} />
          <Button variant="primary" disabled={!text.trim()} onClick={() => setConfirm(true)}>{t("d_log_action")}</Button>
        </div>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {(notes.data?.notes ?? []).map((n) => <li key={n.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50"><span className="text-xs text-slate-500 dark:text-slate-400">{n.date}</span> {n.text}</li>)}
          {notes.data && notes.data.notes.length === 0 && <EmptyState />}
        </ul>
      </div>
      <ConfirmDialog open={confirm} title={t("d_log_action")} text={text} onClose={() => setConfirm(false)} onConfirm={add} />
    </SectionCard>
  );
}
