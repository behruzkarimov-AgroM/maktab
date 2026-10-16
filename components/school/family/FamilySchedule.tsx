"use client";

import { useState } from "react";
import { DoorOpen, UserRound } from "lucide-react";
import type { ScheduleSlot } from "@/lib/school/types";
import { Card, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { BundleGate, useFamily, type Bundle } from "./FamilyProvider";
import { nextSchoolDay, weekdayIso } from "./logic";
import { useDateFmt, useSubjectName } from "./useNames";
import { EmptyBox, PageTitle } from "./widgets";

const WEEK = [1, 2, 3, 4, 5, 6];
// 2024-01-01 is a Monday: used only to get localized weekday names
const dayName = (w: number) => `2024-01-0${w}`;

export function FamilySchedule() {
  const { t } = useSchool();
  return (
    <>
      <PageTitle title={t("navSchedule")} sub={t("f_scheduleSub")} />
      <BundleGate>{(b) => <Body b={b} />}</BundleGate>
    </>
  );
}

function Body({ b }: { b: Bundle }) {
  const { t } = useSchool();
  const { me } = useFamily();
  const df = useDateFmt();
  const subj = useSubjectName();
  const todayW = weekdayIso(nextSchoolDay(me.today));
  const [day, setDay] = useState(todayW);
  const teacherOf = (id: string) => b.info.subjects.find((s) => s.subject_id === id)?.teacher ?? null;
  const slotsOf = (w: number) => b.slots.filter((s) => s.weekday === w).sort((a, z) => a.lesson_no - z.lesson_no);
  const maxLesson = Math.max(0, ...b.slots.map((s) => s.lesson_no));
  const homework = b.lessons.filter((l) => l.homework).sort((a, z) => (a.date < z.date ? 1 : -1));
  const byDate = new Map<string, typeof homework>();
  for (const l of homework) (byDate.get(l.date) ?? byDate.set(l.date, []).get(l.date)!).push(l);

  if (!b.slots.length) return <EmptyBox text={t("f_noSchedule")} />;

  const SlotCard = ({ s }: { s: ScheduleSlot }) => (
    <div className="rounded-xl border border-slate-100 p-2.5 text-sm dark:border-slate-800">
      <p className="font-semibold">{subj(s.subject_id)}</p>
      <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><UserRound className="size-3" aria-hidden />{teacherOf(s.subject_id) ?? "-"}</p>
      {s.room && <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><DoorOpen className="size-3" aria-hidden />{s.room}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* mobile: one day at a time */}
      <Card className="md:hidden">
        <div className="mb-3 flex gap-1 overflow-x-auto" role="tablist" aria-label={t("navSchedule")}>
          {WEEK.map((w) => (
            <button key={w} role="tab" aria-selected={day === w} onClick={() => setDay(w)} className={cn("min-h-11 min-w-11 rounded-full px-3 py-1.5 text-sm font-medium", day === w ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
              {df(dayName(w), { weekday: "short" })}
            </button>
          ))}
        </div>
        {slotsOf(day).length === 0 ? <EmptyBox text={t("f_noLessons")} /> : (
          <ol className="space-y-2">
            {slotsOf(day).map((s) => (
              <li key={s.id} className="flex gap-3">
                <div className="w-12 shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400"><b className="block text-sm text-slate-800 dark:text-slate-100">{s.lesson_no}</b>{s.start_time.slice(0, 5)}</div>
                <div className="flex-1"><SlotCard s={s} /></div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* desktop: week grid */}
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-1 text-left">
          <thead>
            <tr><th className="w-14"><span className="sr-only">{t("t_lesson")}</span></th>{WEEK.map((w) => <th key={w} className={cn("rounded-lg py-1.5 text-center text-xs font-semibold", w === weekdayIso(me.today) ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800")}>{df(dayName(w), { weekday: "long" })}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: maxLesson }, (_, i) => i + 1).map((n) => (
              <tr key={n}>
                <td className="text-center align-top text-xs text-slate-500 dark:text-slate-400"><b className="block text-sm">{n}</b>{b.slots.find((s) => s.lesson_no === n)?.start_time.slice(0, 5)}</td>
                {WEEK.map((w) => {
                  const s = slotsOf(w).find((x) => x.lesson_no === n);
                  return <td key={w} className="align-top">{s ? <SlotCard s={s} /> : null}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("f_homeworkByDate")}</h2>
        {byDate.size === 0 ? <EmptyBox text={t("f_noHomework")} /> : (
          <div className="space-y-3">
            {[...byDate.entries()].map(([d, ls]) => (
              <div key={d}>
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{df(d, { weekday: "long", day: "numeric", month: "long" })}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {ls.map((l) => <li key={l.id}><b>{subj(l.subject_id)}</b>: {l.homework}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
