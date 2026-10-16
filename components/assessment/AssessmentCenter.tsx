"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { AnimatePresence, m as motion, useReducedMotion } from "framer-motion";
import { BookOpen, Brain, Clock, Loader2, Target } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { tr, type Difficulty, type Locale, type LocalizedText } from "@/lib/types";
import type { QuizListResponse } from "@/components/quiz/types";
import { usePsychT } from "@/components/psych/i18n";
import { AUDIENCES, TOPICS, type Audience, type Topic } from "@/components/psych/types";
import { assessmentDict } from "./i18n";
import { clearRecent, readRecent, type RecentResult } from "./recent";

export interface PsychLite {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  audience: Audience;
  topic?: Topic;
  questionCount: number;
}
type Tab = "academic" | "psychology";

const diffStyle: Record<Difficulty, string> = {
  easy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  hard: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
};
const selCls =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-2 focus:outline-indigo-500 dark:border-white/15 dark:bg-slate-900/60 dark:text-white";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-indigo-500 ${
        active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export default function AssessmentCenter({ psych, initialTab }: { psych: PsychLite[]; initialTab: Tab }) {
  const locale = useLocale() as Locale;
  const t = assessmentDict[locale] ?? assessmentDict.uz;
  const { t: pt } = usePsychT();
  const reduce = useReducedMotion();

  const [tab, setTab] = useState<Tab>(initialTab);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ academic: null, psychology: null });

  const [data, setData] = useState<QuizListResponse | null>(null);
  const [error, setError] = useState(false);
  const [grade, setGrade] = useState(0);
  const [subject, setSubject] = useState("");
  const [diff, setDiff] = useState("");
  const [aud, setAud] = useState<Audience | "all">("all");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [recent, setRecent] = useState<RecentResult[]>([]);

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
    setRecent(readRecent());
  }, [load]);

  const selectTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "psychology") url.searchParams.set("tab", "psychology");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next: Tab = e.key === "Home" ? "academic" : e.key === "End" ? "psychology" : tab === "academic" ? "psychology" : "academic";
    selectTab(next);
    tabRefs.current[next]?.focus();
  };

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    data?.quizzes.forEach((q) => m.set(q.subjectKey, tr(q.subjectName, locale)));
    return [...m.entries()];
  }, [data, locale]);

  const quizzes = (data?.quizzes ?? []).filter(
    (q) => (!grade || q.grade === grade) && (!subject || q.subjectKey === subject) && (!diff || q.difficulty === diff),
  );
  const topicsPresent = TOPICS.filter((x) => psych.some((p) => p.topic === x));
  const psychList = psych.filter((p) => (aud === "all" || p.audience === aud) && (topic === "all" || p.topic === topic));

  const totalQuestions = (data?.quizzes ?? []).reduce((s, q) => s + (q.questionCount ?? 0), 0) + psych.reduce((s, p) => s + p.questionCount, 0);
  const stats: [string, number | string][] = [
    [t.statsAcademic, data ? data.quizzes.length : "-"],
    [t.statsPsych, psych.length],
    [t.statsQuestions, data ? totalQuestions : "-"],
    [t.statsSubjects, data ? subjects.length : "-"],
  ];

  const fade = reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

  return (
    <div>
      <section className="bg-gradient-to-br from-indigo-800 via-indigo-600 to-violet-600 px-4 pb-14 pt-28 text-white">
        <motion.div className="mx-auto max-w-5xl" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur">
            <Brain className="h-4 w-4 shrink-0" aria-hidden /> {t.badge}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold sm:text-5xl">{t.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-white/85">{t.sub}</p>
        </motion.div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([label, v]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center dark:border-white/10 dark:bg-white/5">
              <dd className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-300">{v}</dd>
              <dt className="mt-1 text-xs text-slate-600 dark:text-slate-300">{label}</dt>
            </div>
          ))}
        </dl>

        <div
          role="tablist"
          aria-label={t.tabsLabel}
          onKeyDown={onTabKey}
          className="mt-8 flex flex-col gap-2 rounded-2xl bg-slate-100 p-1.5 sm:flex-row dark:bg-slate-800"
        >
          {(
            [
              ["academic", t.tabAcademic, BookOpen],
              ["psychology", t.tabPsych, Brain],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              role="tab"
              id={`tab-${id}`}
              type="button"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => selectTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                tab === id ? "bg-white text-indigo-700 shadow dark:bg-indigo-800 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden /> {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {tab === "academic" ? (
            <motion.div key="a" role="tabpanel" id="panel-academic" aria-labelledby="tab-academic" tabIndex={0} className="mt-6" {...fade} transition={{ duration: 0.25 }}>
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t.grade}>
                <Chip active={grade === 0} onClick={() => setGrade(0)}>
                  {t.all}
                </Chip>
                {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                  <Chip key={g} active={grade === g} onClick={() => setGrade(g)}>
                    {g}
                  </Chip>
                ))}
              </div>
              <div className="mb-6 flex flex-wrap gap-4">
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t.subject}
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
                  {t.difficulty}
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
              ) : quizzes.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">{t.empty}</p>
              ) : (
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {quizzes.map((q, i) => (
                    <motion.li
                      key={q.id}
                      initial={reduce ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 8) * 0.04 }}
                      className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">{tr(q.subjectName, locale)}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                          {t.grade} {q.grade}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 ${diffStyle[q.difficulty]}`}>{t[q.difficulty]}</span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{tr(q.title, locale)}</h2>
                      {q.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(q.description, locale)}</p>}
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
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
                      <Link href={`/quizzes/${q.id}`} className="mt-5 inline-flex justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
                        {t.start}
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              )}
            </motion.div>
          ) : (
            <motion.div key="p" role="tabpanel" id="panel-psychology" aria-labelledby="tab-psychology" tabIndex={0} className="mt-6" {...fade} transition={{ duration: 0.25 }}>
              <p className="mb-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-200">{t.psychNote}</p>
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t.audience}>
                <Chip active={aud === "all"} onClick={() => setAud("all")}>
                  {pt.all}
                </Chip>
                {AUDIENCES.map((a) => (
                  <Chip key={a} active={aud === a} onClick={() => setAud(a)}>
                    {pt.audience[a]}
                  </Chip>
                ))}
              </div>
              {topicsPresent.length > 0 && (
                <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label={t.topic}>
                  <Chip active={topic === "all"} onClick={() => setTopic("all")}>
                    {pt.all}
                  </Chip>
                  {topicsPresent.map((x) => (
                    <Chip key={x} active={topic === x} onClick={() => setTopic(x)}>
                      {pt.topic[x]}
                    </Chip>
                  ))}
                </div>
              )}
              {psychList.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">{t.empty}</p>
              ) : (
                <ul className="grid gap-5 sm:grid-cols-2">
                  {psychList.map((p, i) => (
                    <motion.li
                      key={p.id}
                      initial={reduce ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 8) * 0.04 }}
                      className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">{pt.audience[p.audience]}</span>
                        {p.topic && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">{pt.topic[p.topic]}</span>}
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{tr(p.title, locale)}</h2>
                      <p className="mt-1 flex-1 text-sm text-slate-600 dark:text-slate-300">{tr(p.description, locale)}</p>
                      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                        {p.questionCount} {t.questions} · {t.noTimer}
                      </p>
                      <Link href={`/psychology/${p.id}`} className="mt-4 inline-flex justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">
                        {t.start}
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <section className="mt-12" aria-labelledby="how-h">
          <h2 id="how-h" className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">
            {t.howTitle}
          </h2>
          <div tabIndex={0} className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-100">
                <tr>
                  <th scope="col" className="p-3 font-semibold">
                    {t.rowHead}
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    {t.colAcademic}
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    {t.colPsych}
                  </th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-200">
                {t.rows.map(([a, b, c]) => (
                  <tr key={a} className="border-t border-slate-200 dark:border-white/10">
                    <th scope="row" className="p-3 font-semibold">
                      {a}
                    </th>
                    <td className="p-3">{b}</td>
                    <td className="p-3">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="recent-h">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="recent-h" className="text-2xl font-bold text-slate-900 dark:text-white">
              {t.recentTitle}
            </h2>
            {recent.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearRecent();
                  setRecent([]);
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                {t.recentClear}
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">{t.recentEmpty}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((r) => (
                <li key={`${r.kind}-${r.at}`} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{r.kind === "academic" ? t.academicKind : t.psychKind}</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{r.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.score != null ? `${r.score}%` : (r.label ?? "")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
