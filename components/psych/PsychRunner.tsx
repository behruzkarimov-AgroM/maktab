"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import { formatDate } from "@/lib/format";
import { tr } from "@/lib/types";
import { recordRecent } from "@/components/assessment/recent";
import type { PsychResult, PublicTest } from "./types";
import { usePsychT } from "./i18n";
import { Mascot } from "./Mascot";
import { badgeStyle } from "./badge";

type Stage = "intro" | "questions" | "submitting" | "result" | "error";

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #psych-print, #psych-print * { visibility: visible !important; }
  #psych-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; color: #111 !important; background: #fff !important; }
  .no-print { display: none !important; }
}`;

export function PsychRunner({ test }: { test: PublicTest }) {
  const { t, locale } = usePsychT();
  const [stage, setStage] = useState<Stage>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [result, setResult] = useState<PsychResult | null>(null);
  const [dir, setDir] = useState(1);
  const advanceTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
      abortRef.current?.abort();
    },
    [],
  );

  const total = test.questions.length;
  const question = test.questions[index];

  async function submit(all: Record<string, string>) {
    setStage("submitting");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const ageNum = Number(age);
      const res = await fetch("/api/psych/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          testId: test.id,
          answers: all,
          studentName: name.trim() || undefined,
          studentAge: Number.isInteger(ageNum) && ageNum >= 3 && ageNum <= 99 ? ageNum : undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { result: PsychResult };
      setResult(json.result);
      // server-scored result: remember name only (no answers) in this browser
      recordRecent({ kind: "psychology", title: tr(test.title, locale), label: tr(json.result.title, locale) });
      setStage("result");
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setStage("error");
    }
  }

  function choose(optionId: string) {
    if (advanceTimer.current !== null) return; // ignore double taps while auto-advancing
    const next = { ...answers, [question.id]: optionId };
    setAnswers(next);
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      if (index + 1 >= total) {
        void submit(next);
      } else {
        setDir(1);
        setIndex(index + 1);
      }
    }, 320);
  }

  function back() {
    if (advanceTimer.current !== null || index === 0) return;
    setDir(-1);
    setIndex(index - 1);
  }

  function reset() {
    setAnswers({});
    setIndex(0);
    setResult(null);
    setStage("intro");
  }

  const pct = Math.round((index / total) * 100);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <style>{PRINT_CSS}</style>
      <Link href={`/${locale}/psychology`} className="no-print mb-4 inline-block text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
        ← {t.allTests}
      </Link>

      {stage === "intro" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
          <div className="mx-auto w-fit">
            <Mascot size={130} />
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-50 sm:text-3xl">{tr(test.title, locale)}</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{tr(test.description, locale)}</p>
          <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">
            {tr(test.instruction, locale)}
          </p>
          <div className="mt-5 grid gap-3 text-left sm:grid-cols-[1fr_8rem]">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">{t.nameOpt}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">{t.ageOpt}</span>
              <input
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
                inputMode="numeric"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
          </div>
          <p className="mt-2 text-left text-xs text-slate-500">{t.optionalHint}</p>
          <button
            type="button"
            onClick={() => setStage("questions")}
            className="mt-6 w-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 px-6 py-3 text-lg font-semibold text-white shadow transition hover:brightness-110 active:scale-[0.98]"
          >
            {t.start}
          </button>
        </div>
      )}

      {stage === "questions" && question && (
        <div>
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>
              {t.question} {index + 1} {t.of} {total}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div
            className="mb-6 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={question.id}
              custom={dir}
              initial={{ opacity: 0, x: 40 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 * dir }}
              transition={{ duration: 0.25 }}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-7"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="shrink-0">
                  <Mascot size={64} mood="think" />
                </div>
                <h2 className="pt-2 text-lg font-bold text-slate-900 dark:text-slate-50 sm:text-xl">{tr(question.text, locale)}</h2>
              </div>
              <ul className="space-y-3">
                {question.options.map((o) => {
                  const selected = answers[question.id] === o.id;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => choose(o.id)}
                        aria-pressed={selected}
                        className={`w-full rounded-2xl border-2 px-4 py-3 text-left font-medium transition active:scale-[0.99] ${
                          selected
                            ? "border-indigo-600 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
                            : "border-slate-200 text-slate-800 hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        {tr(o.text, locale)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </AnimatePresence>
          <button
            type="button"
            onClick={back}
            disabled={index === 0}
            className="mt-4 rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ← {t.back}
          </button>
        </div>
      )}

      {stage === "submitting" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto w-fit">
            <Mascot size={120} mood="think" />
          </div>
          <p className="mt-4 font-medium text-slate-700 dark:text-slate-200" aria-live="polite">
            {t.submitting}
          </p>
        </div>
      )}

      {stage === "error" && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900 dark:bg-rose-950">
          <p className="mb-4 font-semibold text-rose-800 dark:text-rose-200">{t.errorTitle}</p>
          <button type="button" onClick={() => void submit(answers)} className="rounded-full bg-rose-600 px-6 py-2 font-semibold text-white hover:bg-rose-700">
            {t.retry}
          </button>
        </div>
      )}

      {stage === "result" && result && (
        <ResultView test={test} result={result} name={name.trim()} onReset={reset} />
      )}
    </div>
  );
}

function ResultView({ test, result, name, onReset }: { test: PublicTest; result: PsychResult; name: string; onReset: () => void }) {
  const { t, locale } = usePsychT();
  const badge = badgeStyle(result.badge_color);
  const date = formatDate(locale, new Date());
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div id="psych-print" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
        <div className="no-print mx-auto mb-2 w-fit">
          <Mascot size={110} mood="celebrate" />
        </div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{t.result}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50">{tr(test.title, locale)}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {name ? `${t.forWho}: ${name} · ` : ""}
          {t.date}: {date}
        </p>
        <div className={`mt-5 inline-block rounded-2xl px-5 py-3 text-xl font-extrabold ring-2 ${badge.className}`} style={badge.style}>
          {tr(result.title, locale)}
        </div>
        <section className="mt-6">
          <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-slate-50">{t.analysis}</h2>
          <p className="leading-relaxed text-slate-700 dark:text-slate-200">{tr(result.analysis, locale)}</p>
        </section>
        <section className="mt-5">
          <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-slate-50">{t.recommendations}</h2>
          <p className="leading-relaxed text-slate-700 dark:text-slate-200">{tr(result.recommendations, locale)}</p>
        </section>
        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          ⚠️ {t.disclaimer}
        </p>
      </div>
      <div className="no-print mt-5 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.print()} className="rounded-full bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-700">
          🖨️ {t.print}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-slate-300 px-6 py-2.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {t.again}
        </button>
      </div>
    </motion.div>
  );
}
