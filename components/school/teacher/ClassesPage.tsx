"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Phone, Send, Search, Star } from "lucide-react";
import { Badge, Button, Card, cn, gradeTone, inputCls } from "@/components/school/ui/kit";
import { ATTENDANCE_LABEL, RISK_LABEL } from "@/lib/school/i18n";
import { spost } from "@/lib/school/client";
import { addDays } from "@/lib/school/grading";
import type { AttendanceStatus, BehaviorNote, Guardian, RiskFlag, StudentDetail, StudentPerformance } from "@/lib/school/types";
import { EmptyState, ErrorState, Drawer, fmtDate, Gate, PageHead, selectCls, Skeleton, Tabs, ToastHost, useApi, useBase, useToasts, type Base } from "./common";
import type { TClass } from "./types";
import { useTT } from "./use-tt";

const DAY_CLS: Record<AttendanceStatus, string> = { present: "bg-emerald-500", absent: "bg-red-500", late: "bg-amber-400", excused: "bg-sky-500", sick: "bg-indigo-500" };

interface ClassReport {
  students: { student_id: string; last_name: string; first_name: string; average: number | null; rank: number | null; attendance_percent: number | null; streak: number; risk: RiskFlag[] }[];
  class_average: number | null;
  distribution: { score: number; count: number }[];
  subject_averages: { subject_id: string; subject: Record<string, string>; average: number | null }[];
}

export function ClassesPage() {
  const state = useBase();
  return <Gate state={state}>{(b) => <Inner b={b} />}</Gate>;
}

function Inner({ b }: { b: Base }) {
  const { tt, L } = useTT();
  const params = useSearchParams();
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(params.get("class"));
  const [studentId, setStudentId] = useState<string | null>(params.get("student"));
  if (!b.ov.classes.length) return <EmptyState text={tt("noClasses")} />;
  const cls = b.ov.classes.find((c) => c.id === sel) ?? null;
  void router;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHead title={tt("cl_title")} sub={tt("cl_sub")} />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {b.ov.classes.map((c) => (
          <li key={c.id}>
            <button onClick={() => setSel(c.id)} aria-pressed={sel === c.id} className={cn("w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-indigo-400 dark:bg-slate-900", sel === c.id ? "border-indigo-500 ring-2 ring-indigo-500/30" : "border-slate-200 dark:border-slate-800")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold">{c.name}</span>
                <span className="flex gap-1">
                  {c.homeroom && <Badge tone="navy"><Star className="mr-1 size-3" />{tt("cl_homeroom")}</Badge>}
                  <Badge tone={c.marked_today ? "green" : "amber"}>{c.marked_today ? tt("att_stateSaved") : tt("att_stateNotMarked")}</Badge>
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{c.subject_ids.map((id) => L(b.subjects.find((s) => s.id === id)?.name)).join(", ") || "–"}</p>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Mini label={tt("cl_students")} v={c.student_count} />
                <Mini label={tt("cl_attendance")} v={c.attendance_percent !== null ? `${c.attendance_percent}%` : "–"} />
                <Mini label={tt("average")} v={c.average?.toFixed(2) ?? "–"} />
                <Mini label={tt("cl_risk")} v={c.risk_count} bad={c.risk_count > 0} />
              </dl>
            </button>
          </li>
        ))}
      </ul>
      {cls && <ClassDetail key={cls.id} b={b} cls={cls} onStudent={setStudentId} />}
      <StudentDrawer b={b} id={studentId} onClose={() => setStudentId(null)} />
    </div>
  );
}

function Mini({ label, v, bad }: { label: string; v: string | number; bad?: boolean }) {
  return (
    <div>
      <dd className={cn("text-base font-bold tabular-nums", bad && "text-red-600")}>{v}</dd>
      <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
    </div>
  );
}

function ClassDetail({ b, cls, onStudent }: { b: Base; cls: TClass; onStudent: (id: string) => void }) {
  const { tt, t, L, errText } = useTT();
  const [tab, setTab] = useState<"students" | "performance">("students");
  const [q, setQ] = useState("");
  const rep = useApi<{ report: ClassReport }>(`/reports/class-performance?class_id=${cls.id}`);
  const sheet = useApi<{ sheet: { dates: string[]; students: { student_id: string; cells: (AttendanceStatus | null)[] }[] } }>(cls.homeroom ? `/attendance/sheet?class_id=${cls.id}&from=${addDays(b.me.today, -20)}&to=${b.me.today}` : null);
  const students = useMemo(() => (rep.data?.report.students ?? []).filter((s) => `${s.last_name} ${s.first_name}`.toLowerCase().includes(q.toLowerCase())), [rep.data, q]);

  return (
    <section className="mt-6" aria-label={cls.name}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{cls.name}</h2>
        <Tabs value={tab} onChange={setTab} items={[{ key: "students", label: tt("cl_students") }, { key: "performance", label: tt("cl_performance") }]} />
        <Link href={`/school/teacher/attendance?class=${cls.id}`}><Button size="sm" className="min-h-11">{tt("att_title")}</Button></Link>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input className={cn(inputCls, "min-h-11 pl-8")} placeholder={tt("search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tt("search")} />
        </div>
      </div>
      {rep.error ? <ErrorState message={errText(rep.error)} onRetry={rep.reload} /> : !rep.data ? <Skeleton className="h-64 w-full" /> : tab === "students" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:text-slate-400 dark:bg-slate-800/60">
              <tr><th className="px-3 py-2">{tt("student")}</th><th className="px-2 text-center">{tt("cl_attendance")}</th><th className="px-2 text-center">{tt("average")}</th><th className="px-2 text-center">{tt("cl_rank")}</th><th className="px-2">{tt("cl_risk")}</th>{cls.homeroom && <th className="px-2">{tt("cl_last20")}</th>}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {students.map((s) => {
                const cells = sheet.data?.sheet.students.find((x) => x.student_id === s.student_id)?.cells ?? [];
                return (
                  <tr key={s.student_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-1.5"><button className="min-h-11 text-left font-medium text-indigo-700 hover:underline dark:text-indigo-300" onClick={() => onStudent(s.student_id)}>{s.last_name} {s.first_name}</button></td>
                    <td className="px-2 text-center tabular-nums">{s.attendance_percent ?? "–"}%</td>
                    <td className="px-2 text-center"><Badge tone={gradeTone(s.average)}>{s.average?.toFixed(2) ?? "–"}</Badge></td>
                    <td className="px-2 text-center tabular-nums">{s.rank ?? "–"}</td>
                    <td className="px-2"><div className="flex flex-wrap gap-1">{s.risk.map((f) => <Badge key={f} tone="red">{t(RISK_LABEL[f])}</Badge>)}</div></td>
                    {cls.homeroom && <td className="px-2"><div className="flex gap-0.5">{cells.map((c, i) => <span key={i} title={c ? t(ATTENDANCE_LABEL[c]) : ""} className={cn("size-2.5 rounded-sm", c ? DAY_CLS[c] : "bg-slate-200 dark:bg-slate-700")} />)}</div></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-bold">{tt("cl_subjectAvg")}</h3>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={rep.data.report.subject_averages.map((s) => ({ name: L(s.subject), v: s.average }))} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis type="number" domain={[0, 5]} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="v" fill="#457b9d" radius={4} />
              </BarChart>
            </ResponsiveContainer></div>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-bold">{tt("cl_distribution")} · {tt("jr_classAvg")} {rep.data.report.class_average?.toFixed(2) ?? "–"}</h3>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={rep.data.report.distribution}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="score" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#f4b942" radius={4} /></BarChart>
            </ResponsiveContainer></div>
          </Card>
        </div>
      )}
    </section>
  );
}

const tg = (v: string) => v.replace(/[^\d+]/g, "");

function StudentDrawer({ b, id, onClose }: { b: Base; id: string | null; onClose: () => void }) {
  const { tt, t, L, errText } = useTT();
  const toasts = useToasts();
  const st = useApi<{ student: StudentDetail }>(id ? `/students/${id}` : null);
  const perf = useApi<{ performance: StudentPerformance }>(id ? `/reports/student-performance?student_id=${id}` : null);
  const hist = useApi<{ history: { days: { date: string; status: AttendanceStatus }[]; summary: { percent: number | null; streak: number } } }>(id ? `/attendance?student_id=${id}&from=${addDays(b.me.today, -55)}` : null);
  const notes = useApi<{ notes: BehaviorNote[] }>(id ? `/teacher/notes?student_id=${id}` : null);
  // the note draft belongs to one student: opening another student shows an empty field (no reset effect needed)
  const [draft, setDraft] = useState<{ id: string | null; text: string }>({ id, text: "" });
  const text = draft.id === id ? draft.text : "";
  const setText = (v: string) => setDraft({ id, text: v });
  const [kind, setKind] = useState<"positive" | "negative" | "neutral">("neutral");
  const [busy, setBusy] = useState(false);
  const s = st.data?.student;
  const p = perf.data?.performance;
  const days = new Map((hist.data?.history.days ?? []).map((d) => [d.date, d.status]));
  const cal: string[] = [];
  for (let i = 55; i >= 0; i--) cal.push(addDays(b.me.today, -i));

  const addNote = async () => {
    if (!id || !text.trim()) return;
    setBusy(true);
    try {
      await spost("/teacher/notes", { student_id: id, kind, text });
      setText("");
      notes.reload();
      toasts.push("ok", tt("saved"));
    } catch (e) {
      toasts.push("error", errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={!!id} onClose={onClose} title={s ? `${s.last_name} ${s.first_name}` : tt("loading")} wide>
      {st.error ? <ErrorState message={errText(st.error)} onRetry={st.reload} /> : !s ? <Skeleton className="h-48 w-full" /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="navy">{s.class_name}</Badge><Badge>{s.student_code}</Badge>
            {p?.risk.map((f) => <Badge key={f} tone="red">{t(RISK_LABEL[f])}</Badge>)}
          </div>
          {p && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <Mini label={tt("average")} v={p.overall_average?.toFixed(2) ?? "–"} />
              <Mini label="GPA" v={p.gpa?.toFixed(2) ?? "–"} />
              <Mini label={tt("cl_rank")} v={p.rank_in_class ? `${p.rank_in_class}/${p.class_size}` : "–"} />
              <Mini label={tt("cl_attendance")} v={p.attendance.percent !== null ? `${p.attendance.percent}%` : "–"} />
            </div>
          )}
          <section>
            <h3 className="mb-1.5 text-sm font-bold">{tt("sd_calendar")}</h3>
            <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1" role="img" aria-label={tt("sd_calendar")}>
              {cal.map((d) => {
                const stt = days.get(d);
                return <span key={d} title={`${fmtDate(d)}${stt ? ` — ${t(ATTENDANCE_LABEL[stt])}` : ""}`} className={cn("aspect-square rounded-sm", stt ? DAY_CLS[stt] : "bg-slate-200 dark:bg-slate-700")} />;
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{(Object.keys(DAY_CLS) as AttendanceStatus[]).map((k) => `${t(ATTENDANCE_LABEL[k])}`).join(" · ")}</p>
          </section>
          {p && p.trend.some((x) => x.average !== null) && (
            <section>
              <h3 className="mb-1.5 text-sm font-bold">{tt("sd_trend")}</h3>
              <div className="h-40"><ResponsiveContainer width="100%" height="100%">
                <LineChart data={p.trend.map((x) => ({ name: `${x.number}`, v: x.average }))}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" /><YAxis domain={[1, 5]} width={24} /><Tooltip /><Line type="monotone" dataKey="v" stroke="#1d3557" strokeWidth={2} connectNulls /></LineChart>
              </ResponsiveContainer></div>
            </section>
          )}
          {p && (
            <section>
              <h3 className="mb-1.5 text-sm font-bold">{tt("sd_grades")}</h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {p.subjects.map((x) => (
                  <li key={x.subject_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{L(x.subject)}</span>
                    <span className="flex gap-1">{x.term_values.map((v, i) => <span key={i} className="w-5 text-center text-xs text-slate-500 dark:text-slate-400">{v ?? "·"}</span>)}</span>
                    <Badge tone={gradeTone(x.average)}>{x.average?.toFixed(2) ?? "–"}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mb-1.5 text-sm font-bold">{tt("sd_guardians")}</h3>
            {s.guardians.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{tt("noData")}</p> : (
              <ul className="space-y-2">
                {s.guardians.map((g: Guardian & { is_primary: boolean }) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{g.full_name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{g.relation}{g.is_primary ? " ★" : ""} · {g.phone ?? "–"}</p></div>
                    {g.phone && <a href={`tel:${tg(g.phone)}`} aria-label={tt("sd_call")} className="grid size-11 place-items-center rounded-xl bg-emerald-600 text-white"><Phone className="size-4" /></a>}
                    {g.phone && <a href={`https://t.me/${tg(g.phone)}`} target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="grid size-11 place-items-center rounded-xl bg-sky-600 text-white"><Send className="size-4" /></a>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-1.5 text-sm font-bold">{tt("sd_notes")}</h3>
            <div className="mb-2 flex flex-wrap gap-2">
              <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label={tt("sd_noteKind")}>
                {(["neutral", "positive", "negative"] as const).map((k) => <option key={k} value={k}>{tt(`note_${k}` as never)}</option>)}
              </select>
              <input className={cn(inputCls, "min-h-11 min-w-40 flex-1")} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={tt("sd_notePh")} aria-label={tt("sd_notes")} />
              <Button variant="primary" className="min-h-11" loading={busy} disabled={!text.trim()} onClick={() => void addNote()}>{tt("add")}</Button>
            </div>
            <ul className="space-y-1.5">
              {(notes.data?.notes ?? []).map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/60"><Badge tone={n.kind === "positive" ? "green" : n.kind === "negative" ? "red" : "gray"}>{fmtDate(n.date)}</Badge> {n.text}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <ToastHost items={toasts.items} dismiss={toasts.dismiss} />
    </Drawer>
  );
}
