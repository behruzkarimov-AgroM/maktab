"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { AlertCircle, ArrowLeft, Clock, Flag, Loader2, Volume2, VolumeX } from "lucide-react";
import { tr, type Locale } from "@/lib/types";
import { getMuted, getMutedServer, playSound, setMuted, subscribeSound, unlockAudio } from "@/lib/sound";
import { recordRecent } from "@/components/assessment/recent";
import { quizDict } from "./i18n";
import QuizResult from "./QuizResult";
import type { QuizStartResponse, SubmitResult } from "./types";

type Phase = "loading" | "error" | "notfound" | "intro" | "running" | "submitting" | "done";

function maskPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("998") && (raw.trim().startsWith("+") || d.length > 9)) d = d.slice(3);
  d = d.slice(0, 9);
  let out = "+998";
  if (d.length) out += " " + d.slice(0, 2);
  if (d.length > 2) out += " " + d.slice(2, 5);
  if (d.length > 5) out += " " + d.slice(5, 7);
  if (d.length > 7) out += " " + d.slice(7, 9);
  return out;
}

export interface BestAttempt {
  name: string;
  pct: number;
}
const BEST_KEY = "maktab.quiz.best";
function readBest(id: string): BestAttempt | null {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || "{}") as Record<string, BestAttempt>;
    return all[id] ?? null;
  } catch {
    return null;
  }
}
/** Stores only the first name + best percent (per browser) and returns the best known. */
function saveBest(id: string, name: string, pct: number): BestAttempt {
  const cur = readBest(id);
  if (cur && cur.pct >= pct) return cur;
  const next = { name: name.split(/\s+/)[0] ?? name, pct };
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    localStorage.setItem(BEST_KEY, JSON.stringify({ ...all, [id]: next }));
  } catch {
    /* storage unavailable */
  }
  return next;
}

const fmt =(s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function QuizRunner({ quizId }: { quizId: string }) {
  const locale = useLocale() as Locale;
  const t = quizDict[locale] ?? quizDict.uz;
  const muted = useSyncExternalStore(subscribeSound, getMuted, getMutedServer);

  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<QuizStartResponse | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("+998");
  const [touched, setTouched] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [spent, setSpent] = useState(0);

  const startedAt = useRef(0);
  const startToken = useRef("");
  const endAt = useRef(0);
  const sent = useRef(false);
  const failed = useRef(false);
  const carry = useRef<Record<string, string>>({});
  const snapshot = useRef<Record<string, string> | null>(null);
  const [subset, setSubset] = useState<string[] | null>(null);
  const [best, setBest] = useState<BestAttempt | null>(null);
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const r = await fetch(`/api/quiz/${encodeURIComponent(quizId)}`, { cache: "no-store" });
      if (r.status === 404) return setPhase("notfound");
      if (!r.ok) throw new Error();
      const j = (await r.json()) as QuizStartResponse;
      setData(j);
      setBest(readBest(quizId));
      setGrade(String(j.quiz.grade));
      setPhase("intro");
    } catch {
      setPhase("error");
    }
  }, [quizId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const phoneVal = phone.replace(/\D/g, "").replace(/^998/, "");
  const nameOk = name.trim().length >= 2;
  const phoneOk = phoneVal.length === 0 || phoneVal.length === 9;
  const introValid = nameOk && phoneOk;

  const submit = useCallback(
    async (auto: boolean) => {
      if (!data || sent.current) return;
      sent.current = true;
      // time is up: freeze the answers once, so a failed auto-submit can be retried without any edits after the deadline
      if (auto && !snapshot.current) snapshot.current = { ...carry.current, ...answersRef.current };
      setConfirm(false);
      setTimeUp(auto);
      setSubmitError(false);
      setPhase("submitting");
      const secs = Math.max(0, Math.min(Math.round((Date.now() - startedAt.current) / 1000), data.quiz.durationMinutes * 60));
      setSpent(secs);
      try {
        const r = await fetch(`/api/quiz/${encodeURIComponent(quizId)}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: snapshot.current ?? { ...carry.current, ...answersRef.current },
            name: name.trim(),
            grade: Number(grade),
            phone: phoneVal ? "+998" + phoneVal : "",
            seconds: secs,
            ...(startToken.current ? { startToken: startToken.current } : {}),
          }),
        });
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { result: SubmitResult };
        setResult(j.result);
        recordRecent({ kind: "academic", title: tr(data.quiz.title, locale), score: j.result.scorePercent });
        setBest(saveBest(quizId, name.trim(), j.result.scorePercent));
        setPhase("done");
        playSound(j.result.passed ? "win" : "lose");
      } catch {
        sent.current = false;
        failed.current = true; // stop auto-retry loop; user can press Finish to retry
        setSubmitError(true);
        setPhase("running");
      }
    },
    [data, quizId, name, grade, phoneVal, locale],
  );

  // countdown driven by wall clock so background-tab throttling can't stretch the quiz
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !failed.current) void submit(true);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phase, submit]);

  function begin(only?: string[], keep?: Record<string, string>) {
    setTouched(true);
    if (!introValid || !data) return;
    unlockAudio();
    playSound("start");
    sent.current = false;
    failed.current = false;
    snapshot.current = null;
    setSubset(only ?? null);
    carry.current = keep ?? {};
    // retrying a subset gets a proportional time budget (at least 1 minute)
    const secs = only
      ? Math.max(60, Math.ceil((data.quiz.durationMinutes * 60 * only.length) / data.questions.length))
      : data.quiz.durationMinutes * 60;
    startedAt.current = Date.now();
    endAt.current = startedAt.current + secs * 1000;
    // server-side clock for this attempt (best effort; without it no certificate token is issued)
    startToken.current = "";
    fetch(`/api/quiz/${encodeURIComponent(quizId)}/start`, { method: "POST", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { startToken?: string }) => {
        startToken.current = j.startToken ?? "";
      })
      .catch(() => {});
    setRemaining(secs);
    setAnswers({});
    setFlags({});
    setIdx(0);
    setResult(null);
    setPhase("running");
  }

  const wrap = (children: React.ReactNode) => <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">{children}</div>;
  const backLink = (
    <Link href={`/${locale}/quizzes`} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {t.back}
    </Link>
  );

  if (phase === "loading")
    return wrap(
      <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t.loading}
      </p>,
    );
  if (phase === "error" || phase === "notfound")
    return wrap(
      <>
        {backLink}
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {phase === "notfound" ? t.empty : t.loadError}
          {phase === "error" && (
            <button type="button" onClick={load} className="ml-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white">
              {t.retry}
            </button>
          )}
        </div>
      </>,
    );
  if (!data) return null;

  const { quiz } = data;
  const questions = subset ? data.questions.filter((x) => subset.includes(x.id)) : data.questions;
  const quizTitle = tr(quiz.title, locale);

  if (phase === "done" && result)
    return wrap(
      <>
        {backLink}
        <QuizResult
          quiz={quiz}
          questions={data.questions}
          result={result}
          studentName={name.trim()}
          grade={Number(grade)}
          seconds={spent}
          timeUp={timeUp}
          best={best}
          onRetake={() => {
            setSubset(null);
            setPhase("intro");
            setResult(null);
          }}
          onRetryWrong={() => {
            const wrong = result.review.filter((r) => !r.isCorrect).map((r) => r.questionId);
            const keep: Record<string, string> = {};
            for (const r of result.review) if (r.isCorrect && r.selected) keep[r.questionId] = r.selected;
            begin(wrong, keep);
          }}
        />
      </>,
    );

  if (phase === "intro") {
    const inp =
      "w-full rounded-xl border bg-white px-4 py-2.5 text-slate-900 focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:bg-slate-900/60 dark:text-white";
    return wrap(
      <>
        {backLink}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{quizTitle}</h1>
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" aria-hidden /> {quiz.durationMinutes} {t.minutes}
            </span>
            <span>
              {questions.length} {t.questions}
            </span>
            <span>
              {t.passing}: {quiz.passingScorePercent}%
            </span>
          </p>
          {best && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              {t.bestPrev}: {best.pct}% ({best.name})
            </p>
          )}
          <h2 className="mb-2 mt-6 font-semibold text-slate-900 dark:text-white">{t.rulesTitle}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            {t.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

          <form
            className="mt-6 space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              begin();
            }}
          >
            <div>
              <label htmlFor="qz-name" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {t.yourName}
              </label>
              <input
                id="qz-name"
                className={`${inp} ${touched && !nameOk ? "border-red-500" : "border-slate-300 dark:border-white/15"}`}
                value={name}
                maxLength={80}
                autoComplete="name"
                placeholder={t.yourNamePh}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={touched && !nameOk}
              />
              {touched && !nameOk && (
                <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {t.errName}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="qz-grade" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t.yourGrade}
                </label>
                <select id="qz-grade" className={`${inp} border-slate-300 dark:border-white/15`} value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="qz-phone" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t.phone}
                </label>
                <input
                  id="qz-phone"
                  type="tel"
                  inputMode="tel"
                  className={`${inp} ${touched && !phoneOk ? "border-red-500" : "border-slate-300 dark:border-white/15"}`}
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  aria-invalid={touched && !phoneOk}
                />
                {touched && !phoneOk && (
                  <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {t.errPhone}
                  </p>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={!introValid}
              className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.startQuiz}
            </button>
          </form>
        </div>
      </>,
    );
  }

  // running / submitting
  const q = questions[idx];
  const answeredCount = questions.filter((x) => answers[x.id]).length;
  const flaggedCount = Object.values(flags).filter(Boolean).length;
  const low = remaining <= 30;
  const submitting = phase === "submitting";

  return wrap(
    <>
      <div className="sticky top-16 z-10 -mx-4 mb-5 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-slate-950/90">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-base font-bold text-slate-900 dark:text-white">{quizTitle}</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setMuted(!muted);
              }}
              aria-pressed={!muted}
              aria-label={t.sound}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {muted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
            </button>
            <span
              role="timer"
              aria-label={t.timeLeft}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-mono text-lg font-bold tabular-nums ${
                low ? "animate-pulse bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white"
              }`}
            >
              <Clock className="h-4 w-4" aria-hidden /> {fmt(remaining)}
            </span>
          </div>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answeredCount}
          aria-label={t.answered}
        >
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {t.answered}: {answeredCount}/{questions.length}
          </span>
          <span>{flaggedCount > 0 ? `${t.flagged}: ${flaggedCount}` : ""}</span>
        </div>
      </div>

      {timeUp && submitting && <p role="status" className="mb-4 rounded-xl bg-amber-100 p-3 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">{t.timeUp}</p>}
      {submitError && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="h-4 w-4" aria-hidden /> {t.submitError}
        </p>
      )}

      <section aria-labelledby="qz-q" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>
            {t.question} {idx + 1} {t.of} {questions.length}
          </span>
          <button
            type="button"
            onClick={() => setFlags((f) => ({ ...f, [q.id]: !f[q.id] }))}
            aria-pressed={!!flags[q.id]}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-medium ${
              flags[q.id] ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" : "hover:bg-slate-100 dark:hover:bg-white/10"
            }`}
          >
            <Flag className="h-4 w-4" aria-hidden /> {flags[q.id] ? t.unflag : t.flag}
          </button>
        </div>
        <h2 id="qz-q" className="text-xl font-bold text-slate-900 dark:text-white">
          {tr(q.text, locale)}
        </h2>
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt="" className="mt-4 max-h-64 rounded-xl" />
        )}
        <div role="radiogroup" aria-labelledby="qz-q" className="mt-5 space-y-3">
          {q.options.map((o, oi) => {
            const sel = answers[q.id] === o.id;
            const hasSel = q.options.some((x) => x.id === answers[q.id]);
            const choose = (id: string) => {
              unlockAudio();
              playSound("tap");
              setAnswers((a) => ({ ...a, [q.id]: id }));
            };
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={sel}
                // answers are frozen once the time is up (a failed auto-submit is retried with the snapshot)
                disabled={submitting || remaining <= 0}
                tabIndex={sel || (!hasSel && oi === 0) ? 0 : -1}
                onKeyDown={(e) => {
                  const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
                  if (!step) return;
                  e.preventDefault();
                  const next = (oi + step + q.options.length) % q.options.length;
                  choose(q.options[next].id);
                  (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
                }}
                onClick={() => choose(o.id)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                  sel
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-500/20"
                    : "border-slate-200 hover:border-indigo-300 dark:border-white/15 dark:hover:border-indigo-400/60"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    sel ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"
                  }`}
                >
                  {o.id}
                </span>
                <span className="text-slate-900 dark:text-white">{tr(o.text, locale)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <nav aria-label={t.navigator} className="mt-5 flex flex-wrap gap-2">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setIdx(i)}
            aria-current={i === idx ? "step" : undefined}
            aria-label={`${t.question} ${i + 1}${answers[x.id] ? ` - ${t.answered}` : ""}${flags[x.id] ? ` - ${t.flagged}` : ""}`}
            className={`relative h-10 w-10 rounded-lg text-sm font-semibold ${
              i === idx
                ? "bg-indigo-600 text-white"
                : answers[x.id]
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200"
                  : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"
            }`}
          >
            {i + 1}
            {flags[x.id] && <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden />}
          </button>
        ))}
      </nav>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={idx === 0 || submitting}
          onClick={() => setIdx(idx - 1)}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-white/20 dark:text-slate-200"
        >
          {t.prev}
        </button>
        {idx < questions.length - 1 ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setIdx(idx + 1)}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            {t.next}
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => (answeredCount < questions.length ? setConfirm(true) : void submit(false))}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? t.submitting : t.finish}
          </button>
        )}
      </div>
      {idx < questions.length - 1 && !submitting && (
        <div className="mt-3 text-right">
          <button
            type="button"
            onClick={() => (answeredCount < questions.length ? setConfirm(true) : void submit(false))}
            className="text-sm font-medium text-emerald-700 underline dark:text-emerald-300"
          >
            {t.finish}
          </button>
        </div>
      )}

      {confirm && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="qz-confirm" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <p id="qz-confirm" className="font-semibold text-slate-900 dark:text-white">
              {t.confirmFinish} ({t.unanswered}: {questions.length - answeredCount})
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" autoFocus onClick={() => setConfirm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-white/20 dark:text-white">
                {t.no}
              </button>
              <button type="button" onClick={() => void submit(false)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                {t.yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
  );
}
