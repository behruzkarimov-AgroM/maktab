"use client";

import { useState } from "react";
import { Card, cn } from "@/components/school/ui/kit";
import { weekdayOf } from "@/lib/school/grading";
import type { ScheduleSlot } from "@/lib/school/types";
import { EmptyState, ErrorState, Gate, hhmm, PageHead, Skeleton, Tabs, useApi, useBase, type Base } from "./common";
import { useTT } from "./use-tt";

type Slot = ScheduleSlot & { class_name: string | null };

export function SchedulePage() {
  const state = useBase();
  return <Gate state={state}>{(b) => <Inner b={b} />}</Gate>;
}

function Inner({ b }: { b: Base }) {
  const { tt, L, errText } = useTT();
  const api = useApi<{ slots: Slot[] }>(b.ov.teacher_id ? `/schedule?teacher_id=${b.ov.teacher_id}` : null);
  const todayWd = weekdayOf(b.me.today);
  const [day, setDay] = useState<number>(todayWd > 6 ? 1 : todayWd);
  const subj = (id: string) => L(b.subjects.find((s) => s.id === id)?.name);
  const days = [1, 2, 3, 4, 5, 6];
  if (api.error) return <ErrorState message={errText(api.error)} onRetry={api.reload} />;
  if (!api.data) return <Skeleton className="h-72 w-full" />;
  const slots = api.data.slots;
  if (!slots.length) return <EmptyState text={tt("sch_empty")} />;
  const nos = [...new Set(slots.map((s) => s.lesson_no))].sort((a, b2) => a - b2);
  const at = (wd: number, no: number) => slots.find((s) => s.weekday === wd && s.lesson_no === no);
  const Cell = ({ s }: { s: Slot }) => (
    <div className="rounded-lg bg-indigo-50 p-2 text-xs dark:bg-indigo-950/40">
      <p className="font-bold">{s.class_name}</p>
      <p className="truncate">{subj(s.subject_id)}</p>
      <p className="text-slate-500 dark:text-slate-400">{hhmm(s.start_time)}{s.room ? ` · ${s.room}` : ""}</p>
    </div>
  );
  return (
    <div className="mx-auto max-w-6xl">
      <PageHead title={tt("sch_title")} sub={tt("sch_hours", { n: b.ov.assignments.reduce((n, a) => n + a.hours_per_week, 0) })} />
      {/* phone: one day at a time */}
      <div className="md:hidden">
        <Tabs value={String(day)} onChange={(k) => setDay(Number(k))} items={days.map((d) => ({ key: String(d), label: tt(`wd_${d}` as never) }))} />
        <ul className="mt-3 space-y-2">
          {slots.filter((s) => s.weekday === day).map((s) => (
            <li key={s.id}><Card className="flex items-center gap-3 p-3"><span className="grid size-9 place-items-center rounded-lg bg-indigo-600 font-bold text-white">{s.lesson_no}</span><div className="min-w-0"><p className="font-bold">{s.class_name} · {subj(s.subject_id)}</p><p className="text-xs text-slate-500 dark:text-slate-400">{hhmm(s.start_time)}–{hhmm(s.end_time)}{s.room ? ` · ${s.room}` : ""}</p></div></Card></li>
          ))}
          {!slots.some((s) => s.weekday === day) && <EmptyState text={tt("dash_noLessons")} />}
        </ul>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
          <thead><tr><th className="w-10"><span className="sr-only">{tt("lesson")}</span></th>{days.map((d) => <th key={d} className={cn("rounded-lg px-2 py-2 text-xs font-bold", d === todayWd ? "bg-fuchsia-400 text-slate-900" : "bg-slate-100 dark:bg-slate-800")}>{tt(`wd_${d}` as never)}</th>)}</tr></thead>
          <tbody>
            {nos.map((n) => (
              <tr key={n}><th className="text-center text-xs text-slate-500 dark:text-slate-400">{n}</th>{days.map((d) => { const s = at(d, n); return <td key={d} className="align-top">{s ? <Cell s={s} /> : null}</td>; })}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
