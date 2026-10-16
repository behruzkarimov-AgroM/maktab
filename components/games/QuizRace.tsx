"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { tr, type LocalizedText } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { quizAccuracy, quizInit, quizPoints, quizResolve, quizUseLifeline, type Lifeline, type QuizOutcome, type QuizState } from "./content-logic";
import type { ContentGameExtra, QuizQuestion } from "./content-types";
import { GameHud, Stat } from "./GameHud";
import { useGameT } from "./i18n";
import type { GameProps } from "./types";
import { postAnswer, postFifty, useContentRound } from "./useContentRound";
import { useFinishOnce, useGameClock } from "./useGameClock";
import { timeProgress } from "./utils";

const EXTRA_TIME_MS = 10_000;
const LETTERS = "ABCDEF";

type Action = { type: "resolve"; outcome: QuizOutcome } | { type: "lifeline"; lifeline: Lifeline };
const reducer = (s: QuizState, a: Action): QuizState => (a.type === "resolve" ? quizResolve(s, a.outcome) : quizUseLifeline(s, a.lifeline));

export function QuizRace({ config, onFinish, set }: GameProps & ContentGameExtra) {
  const { t } = useGameT();
  const r = useContentRound(set.id, Math.min(Math.max(1, config.grid), set.item_count));
  if (r.status === "loading") return <p className="py-10 text-center text-slate-500">{t.roundLoading}</p>;
  if (r.status === "error" || r.round.game_type !== "quiz_race") return <p className="py-10 text-center text-red-600">{t.roundError}</p>;
  return <QuizBoard questions={r.round.questions} token={r.round.token} config={config} onFinish={onFinish} />;
}

function QuizBoard({ questions, token, config, onFinish }: { questions: QuizQuestion[]; token: string } & Pick<GameProps, "config" | "onFinish">) {
  const [s, dispatch] = useReducer(reducer, questions.length, quizInit);
  const finish = useFinishOnce(onFinish);
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (!s.over) return;
    finish({
      score: s.score,
      timeMs: Math.max(300, performance.now() - startRef.current),
      accuracy: quizAccuracy(s),
      completed: s.correct > 0,
    });
  }, [s, finish]);

  const q = questions[s.index];
  if (!q) return null;
  return (
    <QuestionView
      key={q.id}
      q={q}
      s={s}
      token={token}
      perQuestionSec={Math.max(5, config.time_limit)}
      multiplier={config.multiplier}
      onResolve={(outcome) => dispatch({ type: "resolve", outcome })}
      onLifeline={(lifeline) => dispatch({ type: "lifeline", lifeline })}
    />
  );
}

type View =
  | { phase: "answering" }
  | { phase: "checking"; chosen: string }
  | { phase: "revealed"; chosen: string; correct: boolean; correctId: string; explanation: LocalizedText | null; points: number; timedOut: boolean }
  | { phase: "failed" };

function QuestionView({
  q, s, token, perQuestionSec, multiplier, onResolve, onLifeline,
}: {
  q: QuizQuestion;
  s: QuizState;
  token: string;
  perQuestionSec: number;
  multiplier: number;
  onResolve: (o: QuizOutcome) => void;
  onLifeline: (l: Lifeline) => void;
}) {
  const { t, locale } = useGameT();
  const [view, setView] = useState<View>({ phase: "answering" });
  const [hidden, setHidden] = useState<string[]>([]);
  const mounted = useRef(true);
  const totalMsRef = useRef(perQuestionSec * 1000);
  const timeoutRef = useRef<() => void>(() => {});
  const clock = useGameClock(perQuestionSec, () => timeoutRef.current());
  const { stop, addMs, getRemaining } = clock;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function timedOut() {
    if (view.phase !== "answering") return;
    setView({ phase: "checking", chosen: "" });
    playSound("wrong");
    const res = await postAnswer(token, q.id, "");
    if (!mounted.current) return;
    if (!res) return setView({ phase: "failed" });
    setView({ phase: "revealed", chosen: "", correct: false, correctId: res.correct_option_id ?? "", explanation: res.explanation, points: 0, timedOut: true });
  }
  useEffect(() => {
    timeoutRef.current = () => void timedOut();
  });

  async function choose(optionId: string) {
    if (view.phase !== "answering") return;
    const remaining = getRemaining();
    stop();
    setView({ phase: "checking", chosen: optionId });
    const res = await postAnswer(token, q.id, optionId);
    if (!mounted.current) return;
    if (!res) return setView({ phase: "failed" });
    const points = res.correct ? quizPoints({ remainingMs: remaining, totalMs: totalMsRef.current, streak: s.streak + 1, multiplier }) : 0;
    playSound(res.correct ? ((s.streak + 1) % 3 === 0 ? "combo" : "correct") : "wrong");
    setView({ phase: "revealed", chosen: optionId, correct: res.correct, correctId: res.correct_option_id ?? "", explanation: res.explanation, points, timedOut: false });
  }

  async function doFifty() {
    if (view.phase !== "answering" || s.lifelines.fifty) return;
    onLifeline("fifty");
    playSound("tap");
    const remove = await postFifty(token, q.id);
    if (mounted.current && remove) setHidden(remove);
  }
  function doSkip() {
    if (view.phase !== "answering" || s.lifelines.skip) return;
    stop();
    onLifeline("skip");
    playSound("tap");
    onResolve({ kind: "skip" });
  }
  function doTime() {
    if (view.phase !== "answering" || s.lifelines.time) return;
    onLifeline("time");
    playSound("tap");
    addMs(EXTRA_TIME_MS);
    totalMsRef.current += EXTRA_TIME_MS;
  }
  function next() {
    if (view.phase === "revealed") onResolve(view.correct ? { kind: "correct", points: view.points } : view.timedOut ? { kind: "timeout" } : { kind: "wrong" });
    else if (view.phase === "failed") onResolve({ kind: "skip" });
  }

  const visible = q.options.filter((o) => !hidden.includes(o.id));
  // keyboard: 1..6 pick an option
  const visibleIds = visible.map((o) => o.id).join("|");
  useEffect(() => {
    if (view.phase !== "answering") return;
    const ids = visibleIds.split("|");
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < ids.length) void choose(ids[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, visibleIds]);

  const revealed = view.phase === "revealed" ? view : null;
  const score = s.score + (revealed ? revealed.points : 0);
  const lifelineBtn = (kind: Lifeline, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={s.lifelines[kind] || view.phase !== "answering"}
      className="rounded-full border-2 border-amber-400 bg-amber-50 px-4 py-1.5 text-sm font-bold text-amber-800 transition hover:bg-amber-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:bg-amber-950 dark:text-amber-200 dark:disabled:border-slate-700 dark:disabled:bg-slate-800"
    >
      {label}
    </button>
  );

  return (
    <div>
      <GameHud
        score={score}
        timeLeftMs={clock.remainingMs}
        progress={timeProgress(clock.elapsedMs, clock.remainingMs)}
        extra={
          <>
            <Stat label={t.question} value={t.questionOf.replace("{i}", String(s.index + 1)).replace("{n}", String(s.total))} />
            <Stat label={t.streak} value={`x${s.streak}`} tone={s.streak >= 3 ? "amber" : "slate"} />
          </>
        }
      />

      <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-6 text-center dark:bg-slate-800">
        <p className="text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl" aria-live="polite" data-testid="quiz-question">
          {tr(q.question, locale)}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-center gap-2" role="group" aria-label={t.lifelines}>
        {lifelineBtn("fifty", t.fifty, () => void doFifty())}
        {lifelineBtn("skip", t.skipQ, doSkip)}
        {lifelineBtn("time", t.plusTime, doTime)}
      </div>

      <ul className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">
        {visible.map((o) => {
          const i = q.options.findIndex((x) => x.id === o.id);
          const isChosen = (view.phase === "checking" || view.phase === "revealed") && view.chosen === o.id;
          const isRight = revealed && revealed.correctId === o.id;
          const isWrong = revealed && isChosen && !revealed.correct;
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={view.phase !== "answering"}
                onClick={() => void choose(o.id)}
                data-state={isRight ? "correct" : isWrong ? "wrong" : "idle"}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left font-medium transition active:scale-[0.98] motion-reduce:transition-none ${
                  isRight
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                    : isWrong
                      ? "border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
                      : isChosen
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                        : "border-slate-200 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200" aria-hidden>
                  {LETTERS[i] ?? i + 1}
                </span>
                <span className="break-words [overflow-wrap:anywhere]">{tr(o.text, locale)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 min-h-12" aria-live="polite">
        {view.phase === "checking" && <p className="text-center text-sm text-slate-500">{t.checking}</p>}
        {view.phase === "failed" && (
          <div className="text-center">
            <p className="mb-2 text-sm text-red-600">{t.roundError}</p>
            <button type="button" autoFocus onClick={next} className="rounded-full bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-700">
              {t.next} →
            </button>
          </div>
        )}
        {revealed && (
          <div className="space-y-3 text-center" data-testid="quiz-feedback">
            <p className={`text-lg font-bold ${revealed.correct ? "text-emerald-600" : "text-red-600"}`}>
              {revealed.correct ? `✓ ${t.rightMsg} +${revealed.points}` : revealed.timedOut ? `⏱ ${t.timeoutMsg}` : `✗ ${t.wrongMsg}`}
            </p>
            {!revealed.correct && revealed.correctId && (
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {t.correctIs}: <strong>{tr(q.options.find((o) => o.id === revealed.correctId)?.text, locale)}</strong>
              </p>
            )}
            {revealed.explanation && (revealed.explanation.uz || revealed.explanation.ru || revealed.explanation.en) && (
              <p className="mx-auto max-w-xl rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{tr(revealed.explanation, locale)}</p>
            )}
            <button type="button" autoFocus onClick={next} className="rounded-full bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-700">
              {t.next} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
