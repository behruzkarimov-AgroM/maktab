"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { legendFormatter } from "@/components/layout/chart-legend";
import { Activity, ClipboardList, Eye, FileQuestion, Inbox, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, Legend } from "recharts";
import { api } from "@/lib/admin/api";
import type { DashData } from "@/lib/admin/dashboard";
import { applicationStatus } from "@/lib/admin/resources";
import { formatDateTime, formatNumber } from "@/lib/format";
import { tr } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { Badge, Card, PageHeader, Spinner } from "./ui";

const C = { indigo: "#457b9d", emerald: "#10b981", amber: "#f4b942", rose: "#f43f5e", violet: "#2f5d83", sky: "#7ec3ea", slate: "#94a3b8" };
const STATUS_COLOR: Record<string, string> = { new: C.sky, contacted: C.amber, interview_scheduled: C.violet, accepted: C.emerald, rejected: C.rose };
const tooltipStyle = { background: "var(--tt-bg)", border: "1px solid var(--tt-border)", borderRadius: 10, fontSize: 12, color: "var(--tt-fg)" };

function Stat({ icon, label, value, hint, accent }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; accent: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        <span className="flex size-9 items-center justify-center rounded-xl" style={{ background: `${accent}22`, color: accent }}>
          {icon}
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </Card>
  );
}

function ChartCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-4 ${className ?? ""}`}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="h-64 text-xs text-slate-500 [--tt-bg:#fff] [--tt-border:#e2e8f0] [--tt-fg:#0f172a] dark:text-slate-400 dark:[--tt-bg:#0f172a] dark:[--tt-border:#334155] dark:[--tt-fg:#f1f5f9]">{children}</div>
    </Card>
  );
}

const short = (d: string) => d.slice(5).replace("-", "/");

export function Dashboard() {
  const { t, L, lang, toast } = useAdmin();
  const [d, setD] = useState<DashData | null>(null);

  useEffect(() => {
    api.dashboard().then(setD).catch((e) => toast(e instanceof Error ? e.message : t("networkError"), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!d)
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-8" />
      </div>
    );

  const trend = d.cards.visitsTrend;
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />;
  const axis = { stroke: "currentColor", tickLine: false, axisLine: false, tick: { fill: "currentColor" } } as const;

  return (
    <div>
      <PageHeader title={t("dashboard")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          accent={C.indigo}
          icon={<Eye className="size-5" />}
          label={t("visits30")}
          value={formatNumber(lang, d.cards.visits30)}
          hint={
            <span className={`inline-flex items-center gap-1 ${trend >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
              {trend >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />} {trend > 0 ? "+" : ""}
              {trend}% <span className="text-slate-500">{t("vsPrev")}</span>
            </span>
          }
        />
        <Stat accent={C.emerald} icon={<FileQuestion className="size-5" />} label={t("attempts30")} value={d.cards.attempts30} />
        <Stat accent={C.amber} icon={<ClipboardList className="size-5" />} label={t("regsTotal")} value={d.cards.registrations} />
        <Stat accent={C.rose} icon={<Inbox className="size-5" />} label={t("newApps")} value={d.cards.applicationsNew} hint={`${t("appsTotal")}: ${d.cards.applicationsTotal}`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title={t("visitsChart")} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d.visitsPerDay} margin={{ left: -20, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.indigo} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.indigo} stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid}
              <XAxis dataKey="date" tickFormatter={short} interval={4} {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => String(v)} />
              <Area type="monotone" dataKey="visits" name={t("visitsChart")} stroke={C.indigo} strokeWidth={2} fill="url(#gv)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("appsStatusChart")}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={d.appsByStatus.filter((x) => x.count > 0).map((x) => ({ ...x, name: L(applicationStatus.find((s) => s.value === x.status)?.label) }))}
                dataKey="count"
                nameKey="name"
                innerRadius={52}
                outerRadius={84}
                paddingAngle={2}
                stroke="none"
              >
                {d.appsByStatus.filter((x) => x.count > 0).map((x) => (
                  <Cell key={x.status} fill={STATUS_COLOR[x.status] ?? C.slate} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} formatter={legendFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("attemptsChart")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.attemptsPerDay} margin={{ left: -20, right: 8, top: 4 }}>
              {grid}
              <XAxis dataKey="date" tickFormatter={short} interval={4} {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "currentColor", fillOpacity: 0.08 }} />
              <Bar dataKey="attempts" name={t("attemptsChart")} fill={C.emerald} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("regsChart")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.regsPerOlympiad.map((x) => ({ name: tr(x.name, lang).slice(0, 22), count: x.count }))} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
              {grid}
              <XAxis type="number" allowDecimals={false} {...axis} />
              <YAxis type="category" dataKey="name" width={110} {...axis} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "currentColor", fillOpacity: 0.08 }} />
              <Bar dataKey="count" name={t("regsTotal")} fill={C.amber} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("appsTimeChart")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.appsOverTime} margin={{ left: -20, right: 8, top: 4 }}>
              {grid}
              <XAxis dataKey="date" tickFormatter={short} {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" name={t("appsTimeChart")} stroke={C.rose} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-indigo-500" /> {t("recent")}
        </h2>
        {d.recent.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noData")}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {d.recent.map((r, i) => (
              <li key={i}>
                <Link href={r.href} className="flex items-center gap-3 py-2 text-sm hover:text-indigo-600">
                  <Badge tone={r.type === "application" ? "blue" : "amber"}>{r.type === "application" ? t("recentApp") : t("recentReg")}</Badge>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatDateTime(lang, r.at, { month: "short" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
