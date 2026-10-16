"use client";

import Link from "next/link";
import { legendFormatter } from "@/components/layout/chart-legend";
import { AlertTriangle, CalendarCheck, GraduationCap, Megaphone, Pin, School, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RISK_LABEL } from "@/lib/school/i18n";
import type { DashboardData } from "@/lib/school/types";
import { Badge } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { Async, DirPage, EmptyState, Kpi, PctBadge, SectionCard, fmtDate, fmtNum, useApi } from "./common";

interface Overview {
  pending: { class_id: string; class_name: string }[];
  attendanceWeek: { class_id: string; class_name: string; percent: number | null }[];
  termAverages: Record<string, number | null>[];
  terms: { id: string; number: number }[];
}
const NAVY = "#1d3557";
const STEEL = "#4a78a8";
const GOLD = "#f4b942";
const GRID = "rgba(148,163,184,0.25)";
const tip = { contentStyle: { borderRadius: 10, border: "1px solid rgba(148,163,184,.4)", fontSize: 12 } };

export function Dashboard() {
  const { t } = useSchool();
  const dash = useApi<{ dashboard: DashboardData }>("/dashboard");
  const ov = useApi<Overview & { ok: true }>("/director/overview");
  const d = dash.data?.dashboard;
  const card = (k: string) => d?.cards.find((c) => c.key === k);
  const pending = ov.data?.pending ?? [];
  const att = card("attendanceToday");

  return (
    <DirPage title={t("navDashboard")} subtitle={d ? `${d.year?.name ?? ""} · ${d.term?.name ?? ""} · ${fmtDate(d.today)}` : undefined}>
      <Async state={dash} rows={4}>
        {d && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label={t("d_kpi_students")} value={card("students")?.value ?? "-"} icon={<Users className="size-4" />} />
              <Kpi label={t("d_kpi_teachers")} value={card("teachers")?.value ?? "-"} icon={<GraduationCap className="size-4" />} />
              <Kpi label={t("d_kpi_classes")} value={card("classes")?.value ?? "-"} icon={<School className="size-4" />} />
              <Kpi
                label={t("d_kpi_att_today")} icon={<CalendarCheck className="size-4" />}
                value={att?.hint ? "-" : `${att?.value ?? "-"}%`}
                hint={att?.hint ? t("d_not_marked_yet") : `${t("d_kpi_absent")}: ${card("absentToday")?.value ?? 0}`}
                tone={typeof att?.value === "number" && !att.hint && att.value < 90 ? "warn" : "default"}
              />
              <Kpi label={t("d_kpi_pending")} value={ov.data ? pending.length : "…"} hint={t("d_kpi_pending_hint")} tone={pending.length ? "warn" : "good"} icon={<AlertTriangle className="size-4" />} />
              <Kpi label={t("d_kpi_term_avg")} value={fmtNum(card("averageGrade")?.value as number | null)} hint={`${t("d_kpi_at_risk")}: ${card("atRisk")?.value ?? 0}`} tone={Number(card("atRisk")?.value) > 0 ? "warn" : "default"} icon={<TrendingUp className="size-4" />} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title={t("d_chart_att_class_week")}>
                {ov.data ? (
                  <div className="h-64" role="img" aria-label={t("d_chart_att_class_week")}>
                    <ResponsiveContainer>
                      <BarChart data={ov.data.attendanceWeek.map((r) => ({ name: r.class_name, v: r.percent }))}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                        <YAxis domain={[50, 100]} tick={{ fontSize: 11 }} width={34} />
                        <Tooltip {...tip} formatter={(v) => `${v}%`} />
                        <Bar dataKey="v" name="%" radius={[4, 4, 0, 0]}>
                          {ov.data.attendanceWeek.map((r) => <Cell key={r.class_id} fill={(r.percent ?? 100) < 90 ? GOLD : NAVY} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState />}
              </SectionCard>
              <SectionCard title={t("d_chart_att_trend")}>
                <div className="h-64" role="img" aria-label={t("d_chart_att_trend")}>
                  <ResponsiveContainer>
                    <LineChart data={(d.charts.attendanceTrend ?? []).map((r) => ({ name: r.date.slice(5), v: r.percent }))}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[70, 100]} tick={{ fontSize: 11 }} width={34} />
                      <Tooltip {...tip} formatter={(v) => `${v}%`} />
                      <Line type="monotone" dataKey="v" stroke={STEEL} strokeWidth={2.5} dot={false} name="%" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
              <SectionCard title={t("d_chart_grade_dist")}>
                <div className="h-64" role="img" aria-label={t("d_chart_grade_dist")}>
                  <ResponsiveContainer>
                    <BarChart data={(d.charts.gradeDistribution ?? []).map((r) => ({ name: String(r.score), v: r.count }))}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={40} />
                      <Tooltip {...tip} />
                      <Bar dataKey="v" fill={STEEL} radius={[4, 4, 0, 0]} name="#" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
              <SectionCard title={t("d_chart_term_by_grade")}>
                {ov.data ? (
                  <div className="h-64" role="img" aria-label={t("d_chart_term_by_grade")}>
                    <ResponsiveContainer>
                      <BarChart data={ov.data.termAverages.map((r) => ({ ...r, name: `${r.grade}` }))}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis domain={[2, 5]} tick={{ fontSize: 11 }} width={30} />
                        <Tooltip {...tip} />
                        <Legend wrapperStyle={{ fontSize: 11 }} formatter={legendFormatter} />
                        {ov.data.terms.map((tm, i) => <Bar key={tm.id} dataKey={`t${tm.number}`} name={`${t("term")} ${tm.number}`} fill={[NAVY, STEEL, GOLD, "#94a3b8"][i % 4]} radius={[3, 3, 0, 0]} />)}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState />}
              </SectionCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title={`${t("d_missing_att")} (${pending.length})`}>
                {!ov.data ? <EmptyState text={t("loading")} /> : pending.length === 0 ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("d_all_marked")}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {pending.map((p) => (
                      <Link key={p.class_id} href={`/school/director/attendance?class_id=${p.class_id}`} className="max-sm:inline-flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center max-sm:justify-center rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                        {p.class_name}
                      </Link>
                    ))}
                  </div>
                )}
              </SectionCard>
              <SectionCard title={t("d_at_risk")} className="lg:col-span-1" actions={<Link href="/school/director/grades?tab=risk" className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-xs font-semibold text-indigo-700 hover:underline dark:text-fuchsia-300">{t("d_view_all")}</Link>}>
                {d.risk.length === 0 ? <EmptyState text={t("d_no_risk")} /> : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {d.risk.map((r) => (
                      <li key={r.student_id} className="py-2">
                        <Link href={`/school/director/students/${r.student_id}`} className="flex max-sm:min-h-11 items-center justify-between gap-2 hover:underline">
                          <span className="min-w-0 truncate text-sm font-medium">{r.name} <span className="text-slate-500 dark:text-slate-400">{r.class_name}</span></span>
                          <PctBadge v={r.attendance_percent} />
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.flags.map((f) => <Badge key={f} tone="red">{t(RISK_LABEL[f])}</Badge>)}
                          <Badge tone="gray">{t("average")}: {fmtNum(r.average)}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
              <SectionCard title={t("d_latest_ann")} actions={<Link href="/school/director/announcements" className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-xs font-semibold text-indigo-700 hover:underline dark:text-fuchsia-300">{t("d_view_all")}</Link>}>
                {d.announcements.length === 0 ? <EmptyState /> : (
                  <ul className="space-y-3">
                    {d.announcements.map((a) => (
                      <li key={a.id} className="text-sm">
                        <p className="flex items-center gap-1.5 font-semibold">{a.pinned ? <Pin className="size-3.5 text-fuchsia-500" /> : <Megaphone className="size-3.5 text-slate-500 dark:text-slate-400" />}{a.title}</p>
                        <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{a.body}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{fmtDate(a.publish_at.slice(0, 10))} · {t(`d_aud_${a.audience}` as "d_aud_all")}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </Async>
    </DirPage>
  );
}
