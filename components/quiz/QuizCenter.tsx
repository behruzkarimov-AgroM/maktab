"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { BookOpen, Clock, Loader2, Target } from "lucide-react";
import { tr, type Difficulty, type Locale } from "@/lib/types";
import { quizDict } from "./i18n";
import type { QuizListResponse } from "./types";

const diffStyle: Record<Difficulty, string> = {
  easy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  hard: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
};

const selCls =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-2 focus:outline-indigo-500 dark:border-white/15 dark:bg-slate-900/60 dark:text-white";

export default function QuizCenter() {
  const locale = useLocale() as Locale;
  const t = quizDict[locale] ?? quizDict.uz;
  const [data, setData] = useState<QuizListResponse | null>(null);
  const [error, setError] = useState(false);
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [diff, setDiff] = useState("");

  const load = useCallback(async () => {
    setError(false);
    setData(null);
    try {
      const r = await fetch("/api/quiz", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setData((await r.json()) as QuizListResponse);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    data?.quizzes.forEach((q) => m.set(q.subjectKey, tr(q.subjectName, locale)));
    return [...m.entries()];
  }, [data, locale]);

  const list = (data?.quizzes ?? []).filter(
    (q) => (!grade || q.grade === Number(grade)) && (!subject || q.subjectKey === subject) && (!diff || q.difficulty === diff),
  );

  return (
    <div>
      <section className="bg-gradient-to-br from-indigo-800 via-indigo-600 to-violet-600 px-4 pb-14 pt-28 text-white">
        <div className="mx-auto max-w-5xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur">
            <BookOpen className="h-4 w-4" aria-hidden /> {t.badge}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold sm:text-5xl">{t.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-white/85">{t.sub}</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex flex-wrap gap-4" role="search">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            {t.filterGrade}
            <select className={selCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">{t.all}</option>
              {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            {t.filterSubject}
            <select className={selCls} value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">{t.all}</option>
              {subjects.map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            {t.filterDifficulty}
            <select className={selCls} value={diff} onChange={(e) => setDiff(e.target.value)}>
              <option value="">{t.all}</option>
              {(["easy", "medium", "hard"] as const).map((d) => (
                <option key={d} value={d}>
                  {t[d]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {data?.demo && <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{t.demoNote}</p>}

        {error ? (
          <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {t.loadError}
            <button type="button" onClick={load} className="ml-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white">
              {t.retry}
            </button>
          </div>
        ) : !data ? (
          <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t.loading}
          </p>
        ) : list.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">{t.empty}</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((q) => (
              <li key={q.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">
                    {tr(q.subjectName, locale)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                    {t.grade} {q.grade}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 ${diffStyle[q.difficulty]}`}>{t[q.difficulty]}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{tr(q.title, locale)}</h2>
                {q.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(q.description, locale)}</p>}
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" aria-hidden /> {q.durationMinutes} {t.minutes}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Target className="h-4 w-4" aria-hidden /> {t.passing}: {q.passingScorePercent}%
                  </span>
                  {q.questionCount != null && (
                    <span>
                      {q.questionCount} {t.questions}
                    </span>
                  )}
                </div>
                <Link
                  href={`/${locale}/quizzes/${q.id}`}
                  className="mt-5 inline-flex justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  {t.start}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
