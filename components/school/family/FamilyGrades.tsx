"use client";

import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Info, Minus, ThumbsUp, TriangleAlert, TrendingDown } from "lucide-react";
import { weightedAverage } from "@/lib/school/grading";
import type { GradeEntry, SubjectPerformance } from "@/lib/school/types";
import { Badge, Card, cn, gradeTone } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { BundleGate, useFamily, type Bundle } from "./FamilyProvider";
import { fmt, fmtGpa, runningAverage, summarizeSubjects } from "./logic";
import { useDateFmt, useSubjectName } from "./useNames";
import { EmptyBox, PageTitle, Sparkline } from "./widgets";

export function FamilyGrades() {
  const { t } = useSchool();
  return (
    <>
      <PageTitle title={t("navGrades")} sub={t("f_gradesSub")} />
      <BundleGate>{(b) => <Body b={b} />}</BundleGate>
    </>
  );
}

const KIND_KEY = { daily: "f_kDaily", quiz: "f_kQuiz", test: "f_kTest", exam: "f_kExam", homework: "f_kHomework", term: "f_kTerm", year: "f_kYear" } as const;

function Body({ b }: { b: Bundle }) {
  const { t } = useSchool();
  const subj = useSubjectName();
  const { me, child } = useFamily();
  const [sel, setSel] = useState<string | null>(null);
  const counted = (e: GradeEntry) => e.kind !== "term" && e.kind !== "year";
  const bySubject = (id: string) => b.grades.filter((e) => e.subject_id === id);

  if (b.perf.subjects.length === 0) return <EmptyBox text={t("f_noGrades")} />;
  if (sel) {
    const sp = b.perf.subjects.find((s) => s.subject_id === sel);
    if (sp) return <Detail sp={sp} entries={bySubject(sel)} onBack={() => setSel(null)} />;
  }
  const sum = summarizeSubjects(b.perf.subjects);
  const names = (ids: string[]) => ids.map(subj).join(", ");

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 text-sm font-semibold">{t("f_summary")}</h2>
        <ul className="space-y-2 text-sm">
          {sum.strengths.length > 0 && <li className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100"><ThumbsUp className="mt-0.5 size-4 shrink-0" aria-hidden />{fmt(t("f_strengths"), { name: child.first_name, subjects: names(sum.strengths) })}</li>}
          {sum.attention.length > 0 && <li className="flex gap-2 rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{fmt(t("f_attention"), { subjects: names(sum.attention) })}</li>}
          {sum.falling.length > 0 && <li className="flex gap-2 rounded-xl bg-sky-50 p-3 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100"><TrendingDown className="mt-0.5 size-4 shrink-0" aria-hidden />{fmt(t("f_falling"), { subjects: names(sum.falling) })}</li>}
          {!sum.strengths.length && !sum.attention.length && !sum.falling.length && <li className="text-slate-600 dark:text-slate-300">{t("f_summaryNeutral")}</li>}
        </ul>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {b.perf.subjects.map((sp) => {
          const es = bySubject(sp.subject_id).filter(counted);
          const latest = es.slice(-4).reverse();
          return (
            <button key={sp.subject_id} onClick={() => setSel(sp.subject_id)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{subj(sp.subject_id)}</p>
                <Badge tone={gradeTone(sp.average)}>{fmtGpa(sp.average)}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex gap-1" aria-label={t("f_latest")}>
                  {latest.length ? latest.map((e) => <span key={e.id} className={cn("grid size-7 place-items-center rounded-lg text-sm font-bold", chip(e.score))}>{e.score}</span>) : <span className="text-xs text-slate-500 dark:text-slate-400">-</span>}
                </div>
                <Sparkline values={runningAverage(es)} />
              </div>
              <ClassAvgMarker mine={weightedAverage(es.filter((e) => e.term_id === me.term?.id))} avg={b.classAvg.bySubject[sp.subject_id] ?? null} />
            </button>
          );
        })}
      </div>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">{t("a_cls_avg")}</h2>
        <p className="mb-3 flex gap-2 text-xs text-slate-600 dark:text-slate-300"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("a_cls_avg_rule")}</p>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="class-average-list">
          {b.perf.subjects.map((sp) => {
            const avg = b.classAvg.bySubject[sp.subject_id];
            return (
              <li key={sp.subject_id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 dark:border-slate-800">
                <span className="min-w-0 truncate">{subj(sp.subject_id)}</span>
                {avg == null ? <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">{t("a_cls_avg_hidden")}</span> : <span className="shrink-0 font-semibold tabular-nums">{fmtGpa(avg)}</span>}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("f_termGrades")}</h2>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[460px] text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr><th className="py-1 text-left">{t("subject")}</th>{me.terms.map((tm) => <th key={tm.id} className="px-1 text-center">{tm.number}</th>)}<th className="px-1 text-center">{t("f_year")}</th></tr>
            </thead>
            <tbody>
              {b.perf.subjects.map((sp) => (
                <tr key={sp.subject_id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-2">{subj(sp.subject_id)}</td>
                  {me.terms.map((tm, i) => <td key={tm.id} className="px-1 text-center"><GradeCell v={sp.term_values[i] ?? null} /></td>)}
                  <td className="px-1 text-center"><GradeCell v={sp.year_value} strong /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold dark:border-slate-700"><td className="py-2">{t("f_gpa")}</td><td colSpan={me.terms.length} /><td className="px-1 text-center tabular-nums">{fmtGpa(b.perf.gpa)}</td></tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** subtle per-subject marker: arrow + text (colour is never the only signal) */
function ClassAvgMarker({ mine, avg }: { mine: number | null; avg: number | null }) {
  const { t } = useSchool();
  if (avg == null) return null;
  const d = mine == null ? 0 : mine - avg;
  const kind = mine == null || Math.abs(d) < 0.15 ? "near" : d > 0 ? "above" : "below";
  const Icon = kind === "above" ? ArrowUp : kind === "below" ? ArrowDown : Minus;
  const label = `${t("a_cls_avg")} ${fmtGpa(avg)}`;
  return (
    <p className="mt-2 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400" title={label} data-class-avg={kind}>
      <Icon className="size-3" aria-hidden />
      <span>{t("a_cls_avg_short")} {fmtGpa(avg)}</span>
      {mine != null && <span className="sr-only">{t(kind === "above" ? "a_cls_avg_above" : kind === "below" ? "a_cls_avg_below" : "a_cls_avg_near")}</span>}
    </p>
  );
}

const chip = (v: number) => (v >= 4.5 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" : v >= 3.5 ? "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200" : v >= 2.5 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200");

function GradeCell({ v, strong }: { v: number | null; strong?: boolean }) {
  if (v === null) return <span className="text-slate-500 dark:text-slate-400">-</span>;
  return <span className={cn("inline-grid size-7 place-items-center rounded-lg tabular-nums", chip(v), strong && "font-bold")}>{v}</span>;
}

function Detail({ sp, entries, onBack }: { sp: SubjectPerformance; entries: GradeEntry[]; onBack: () => void }) {
  const { t } = useSchool();
  const subj = useSubjectName();
  const df = useDateFmt();
  const list = [...entries].reverse();
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300"><ArrowLeft className="size-4" />{t("f_back")}</button>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{subj(sp.subject_id)}</h2>
          <Badge tone={gradeTone(sp.average)}>{t("average")}: {fmtGpa(sp.average)}</Badge>
        </div>
        <div className="mt-2"><Sparkline values={runningAverage(entries.filter((e) => e.kind !== "term" && e.kind !== "year"))} className="h-10 w-40" /></div>
      </Card>
      <Card>
        {list.length === 0 ? <EmptyBox text={t("f_noGrades")} /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2.5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-base font-bold", chip(e.score))}>{e.score}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{t(KIND_KEY[e.kind])} <span className="font-normal text-slate-500 dark:text-slate-400">- {df(e.date)}</span></p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("f_weight")}: {e.weight}</p>
                  {e.comment && <p className="mt-0.5 text-slate-600 dark:text-slate-300">{e.comment}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t("f_privacyNote")}</p>
      </Card>
    </div>
  );
}
