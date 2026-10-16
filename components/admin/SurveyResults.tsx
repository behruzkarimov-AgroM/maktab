"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { legendFormatter } from "@/components/layout/chart-legend";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/admin/cn";
import { exportCsv, exportXlsx } from "@/lib/admin/export";
import { canWrite, RESOURCE_MAP } from "@/lib/admin/resources";
import { l, type Row } from "@/lib/admin/types";
import type { ExportResponse } from "@/lib/admin/surveys";
import { csvSafe } from "@/lib/admin/validation";
import { responsesTable } from "@/lib/surveys/aggregate";
import type { QuestionStats, SurveyQuestionRow, SurveyStats } from "@/lib/surveys/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { tr } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { Badge, Button, Card, EmptyState, inputCls, PageHeader, Spinner } from "./ui";

const T = {
  results: l("Natijalar", "Результаты", "Results"),
  responses: l("Javoblar", "Ответы", "Responses"),
  from: l("Dan", "С", "From"),
  to: l("Gacha", "По", "To"),
  reset: l("Tozalash", "Сбросить", "Reset"),
  firstLast: l("Birinchi / oxirgi javob", "Первый / последний ответ", "First / last response"),
  avg: l("O'rtacha ball (shkalalar)", "Средняя оценка (шкалы)", "Average rating (scales)"),
  byRole: l("Respondentlar guruhi", "Группы респондентов", "Respondent groups"),
  perDay: l("Kunlar bo'yicha javoblar", "Ответы по дням", "Responses per day"),
  answered: l("javob berdi", "ответили", "answered"),
  of: l("dan", "из", "of"),
  noResponses: l("Hali javoblar yo'q", "Ответов пока нет", "No responses yet"),
  noTexts: l("Matnli javoblar yo'q", "Текстовых ответов нет", "No text answers"),
  showAll: l("Hammasini ko'rsatish", "Показать все", "Show all"),
  avgShort: l("O'rtacha", "Среднее", "Average"),
  min: l("Min", "Мин", "Min"),
  max: l("Max", "Макс", "Max"),
  yes: l("Ha", "Да", "Yes"),
  no: l("Yo'q", "Нет", "No"),
  date: l("Sana", "Дата", "Date"),
  role: l("Guruh", "Группа", "Group"),
  grade: l("Sinf", "Класс", "Grade"),
  exportCsv: l("CSV", "CSV", "CSV"),
  exportXlsx: l("XLSX", "XLSX", "XLSX"),
  exportFailed: l("Eksport amalga oshmadi", "Не удалось экспортировать", "Export failed"),
  truncated: l("Eksport 10 000 qatorga cheklangan", "Экспорт ограничен 10 000 строками", "Export is limited to 10,000 rows"),
  edit: l("Tahrirlash", "Редактировать", "Edit"),
  unknown: l("Noma'lum", "Не указано", "Unknown"),
  roles: {
    parent: l("Ota-ona", "Родитель", "Parent"),
    student: l("O'quvchi", "Ученик", "Student"),
    teacher: l("O'qituvchi", "Учитель", "Teacher"),
    other: l("Boshqa", "Другое", "Other"),
  },
  types: {
    single: l("Bitta javob", "Один ответ", "Single choice"),
    multiple: l("Bir nechta javob", "Несколько ответов", "Multiple choice"),
    scale: l("Shkala", "Шкала", "Scale"),
    yesno: l("Ha / Yo'q", "Да / Нет", "Yes / No"),
    text: l("Matn", "Текст", "Free text"),
  },
} as const;

// colour-blind friendly categorical palette (navy / steel / gold family first)
const COLORS = ["#1e3a8a", "#3b82f6", "#d4a017", "#0f766e", "#7c3aed", "#e11d48", "#64748b", "#16a34a", "#ea580c", "#0891b2"];

interface ResultsPayload {
  survey: Row;
  questions: SurveyQuestionRow[];
  stats: SurveyStats;
  responses?: ExportResponse[];
  truncated?: boolean;
}

async function fetchResults(id: string, from: string, to: string, rows: boolean): Promise<ResultsPayload> {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  if (rows) p.set("rows", "1");
  const r = await fetch(`/api/admin/surveys/${encodeURIComponent(id)}/results?${p}`, { cache: "no-store" });
  if (r.status === 401) {
    window.location.assign("/admin/login");
    throw new Error("Unauthorized");
  }
  const body = (await r.json().catch(() => ({}))) as ResultsPayload & { error?: string };
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body;
}

export function SurveyResults({ id }: { id: string }) {
  const { L, lang, session, toast, t } = useAdmin();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const writable = !!session && canWrite(RESOURCE_MAP.surveys, session.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchResults(id, from, to, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("networkError"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeInvalid = !!from && !!to && from > to;
  const title = data ? tr(data.survey.title as never, lang) : "";

  async function runExport(kind: "csv" | "xlsx") {
    try {
      const full = await fetchResults(id, from, to, true);
      if (full.truncated) toast(L(T.truncated), "info");
      const table = responsesTable(full.questions, full.responses ?? [], (v) => tr(v as never, lang), { date: L(T.date), role: L(T.role), grade: L(T.grade) });
      // formula-injection safe: every text cell is neutralised (CSV also re-checks in toCsv)
      const safe = (v: string | number) => (typeof v === "string" ? csvSafe(v) : v);
      const header = table.header.map((h) => String(safe(h)));
      const rows = table.rows.map((r) => r.map(safe));
      const name = `survey-${id}-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "csv") exportCsv(name, header, rows);
      else await exportXlsx(name, header, rows, "responses");
    } catch (e) {
      toast(e instanceof Error ? e.message : L(T.exportFailed), "error");
    }
  }

  const stats = data?.stats;
  const scaleAvg = useMemo(() => {
    const avgs = (stats?.questions ?? []).map((q) => q.scale?.avg).filter((v): v is number => typeof v === "number");
    return avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100 : null;
  }, [stats]);

  return (
    <div>
      <Link href="/admin/surveys" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="size-4" /> {L(RESOURCE_MAP.surveys.label)}
      </Link>
      <PageHeader
        title={`${L(T.results)}${title ? `: ${title}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {writable && (
              <Link href={`/admin/surveys/${id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <Pencil className="size-4" /> {L(T.edit)}
              </Link>
            )}
            <Button size="sm" onClick={() => runExport("csv")} disabled={!stats || stats.total === 0}>
              <Download className="size-4" /> {L(T.exportCsv)}
            </Button>
            <Button size="sm" onClick={() => runExport("xlsx")} disabled={!stats || stats.total === 0}>
              <Download className="size-4" /> {L(T.exportXlsx)}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">{L(T.from)}</span>
          <input type="date" aria-label={L(T.from)} className={cn(inputCls, "w-auto")} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">{L(T.to)}</span>
          <input type="date" aria-label={L(T.to)} className={cn(inputCls, "w-auto")} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(from || to) && (
          <Button size="sm" onClick={() => { setFrom(""); setTo(""); }}>
            {L(T.reset)}
          </Button>
        )}
        {rangeInvalid && <span className="text-sm text-red-600">{from} &gt; {to}</span>}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <Card>
          <EmptyState>{error}</EmptyState>
        </Card>
      ) : stats && data ? (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="survey-summary">
            <Stat label={L(T.responses)} value={<span data-testid="response-count">{stats.total}</span>} />
            <Stat label={L(T.firstLast)} value={stats.first_at ? `${formatDate(lang, stats.first_at)} / ${formatDate(lang, stats.last_at ?? stats.first_at)}` : "—"} small />
            <Stat label={L(T.avg)} value={scaleAvg ?? "—"} />
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{L(T.byRole)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {stats.by_role.length === 0 && <span className="text-sm text-slate-400">—</span>}
                {stats.by_role.map((r) => (
                  <Badge key={r.role} tone="blue">
                    {(T.roles as Record<string, typeof T.unknown>)[r.role] ? L((T.roles as Record<string, typeof T.unknown>)[r.role]) : L(T.unknown)}: {r.count}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          {stats.total === 0 ? (
            <Card>
              <EmptyState>{L(T.noResponses)}</EmptyState>
            </Card>
          ) : (
            <>
              {stats.by_day.length > 1 && (
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">{L(T.perDay)}</h3>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.by_day} margin={{ left: -16, right: 8, top: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name={L(T.responses)} fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
              {data.questions.map((q, i) => {
                const qs = stats.questions.find((x) => x.id === q.id);
                return qs ? <QuestionCard key={q.id} index={i + 1} q={q} stats={qs} total={stats.total} /> : null;
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 font-bold tabular-nums", small ? "text-base" : "text-3xl")}>{value}</p>
    </Card>
  );
}

export function QuestionCard({ index, q, stats, total }: { index: number; q: SurveyQuestionRow; stats: QuestionStats; total: number }) {
  const { L, lang } = useAdmin();
  const [showAll, setShowAll] = useState(false);
  const optLabel = (id: string) => {
    if (q.type === "yesno") return L(id === "yes" ? T.yes : T.no);
    const o = q.options?.find((x) => x.id === id);
    return o ? tr(o.text, lang) : id;
  };
  const rows = (stats.counts ?? []).map((c) => ({
    id: c.id,
    name: optLabel(c.id),
    count: c.count,
    pct: stats.answered ? Math.round((c.count / stats.answered) * 100) : 0,
  }));
  const usePie = q.type === "single" || q.type === "yesno";

  return (
    <div data-testid="question-result">
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">{index}</span>
        <h3 className="min-w-0 flex-1 text-sm font-semibold">{tr(q.question_text, lang)}</h3>
        <Badge>{L(T.types[q.type])}</Badge>
        <span className="text-xs text-slate-500">
          {stats.answered} {L(T.of)} {total} {L(T.answered)}
        </span>
      </div>

      {q.type !== "text" && q.type !== "scale" && stats.answered === 0 && <p className="text-sm text-slate-400">{L(T.noResponses)}</p>}

      {usePie && stats.answered > 0 && (
        <div className="grid items-center gap-4 md:grid-cols-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="count" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                  {rows.map((r, i) => (
                    <Cell key={r.id} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={28} formatter={legendFormatter} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <OptionTable rows={rows} />
        </div>
      )}

      {q.type === "multiple" && stats.answered > 0 && (
        <div className="grid items-center gap-4 md:grid-cols-2">
          <div style={{ height: Math.max(180, rows.length * 38) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {rows.map((r, i) => (
                    <Cell key={r.id} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <OptionTable rows={rows} />
        </div>
      )}

      {q.type === "scale" && stats.scale && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="amber">
              {L(T.avgShort)}: {stats.scale.avg ?? "—"}
            </Badge>
            <Badge>
              {L(T.min)}: {stats.scale.min ?? "—"}
            </Badge>
            <Badge>
              {L(T.max)}: {stats.scale.max ?? "—"}
            </Badge>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.scale.distribution} margin={{ left: -16, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="value" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name={L(T.responses)} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {q.type === "text" &&
        ((stats.texts?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-400">{L(T.noTexts)}</p>
        ) : (
          <div>
            <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {(showAll ? stats.texts! : stats.texts!.slice(0, 10)).map((x, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                  {/* rendered as text only (React escapes it): never as HTML */}
                  <p className="whitespace-pre-wrap break-words">{x.text}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(lang, x.created_at)}</p>
                </li>
              ))}
            </ul>
            {!showAll && stats.texts!.length > 10 && (
              <Button size="sm" className="mt-2" onClick={() => setShowAll(true)}>
                {L(T.showAll)} ({stats.texts!.length})
              </Button>
            )}
          </div>
        ))}
    </Card>
    </div>
  );
}

function OptionTable({ rows }: { rows: { id: string; name: string; count: number; pct: number }[] }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={r.id} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {r.count} · {r.pct}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: COLORS[i % COLORS.length] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
