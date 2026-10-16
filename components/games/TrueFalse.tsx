"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { tr, type LocalizedText } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { tfAnswer, tfInit, tfSkip, tfTimeUp, type TfState } from "./content-logic";
import type { ContentGameExtra, TfQuestion } from "./content-types";
import { GameHud, Stat } from "./GameHud";
import { useGameT } from "./i18n";
import type { GameProps } from "./types";
import { postAnswer, useContentRound } from "./useContentRound";
import { useFinishOnce, useGameClock } from "./useGameClock";
import { timeProgress } from "./utils";

const MAX_QUESTIONS = 40;
const COMBO_BONUS_EVERY = 5;

type Action = { type: "answer"; correct: boolean; multiplier: number } | { type: "skip" } | { type: "timeup" };
const reducer = (s: TfState, a: Action): TfState => (a.type === "answer" ? tfAnswer(s, a.correct, a.multiplier) : a.type === "skip" ? tfSkip(s) : tfTimeUp(s));

export function TrueFalse({ config, onFinish, set }: GameProps & ContentGameExtra) {
  const { t } = useGameT();
  const r = useContentRound(set.id, Math.min(MAX_QUESTIONS, set.item_count));
  if (r.status === "loading") return <p className="py-10 text-center text-slate-500">{t.roundLoading}</p>;
  if (r.status === "error" || r.round.game_type !== "true_false") return <p className="py-10 text-center text-red-600">{t.roundError}</p>;
  return <TrueFalseBoard questions={r.round.questions} token={r.round.token} config={config} onFinish={onFinish} />;
}

interface Feedback {
  statement: LocalizedText;
  explanation: LocalizedText;
  shownAt: number;
}

function TrueFalseBoard({ questions, token, config, onFinish }: { questions: TfQuestion[]; token: string } & Pick<GameProps, "config" | "onFinish">) {
  const { t, locale } = useGameT();
  const [s, dispatch] = useReducer(reducer, undefined, () => tfInit(questions.length, config.grid));
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const finish = useFinishOnce(onFinish);
  const clock = useGameClock(Math.max(10, config.time_limit), () => dispatch({ type: "timeup" }));
  const { stop, getElapsed, addMs } = clock;
  const mounted = useRef(true);
  const busy = useRef(false);
  const comboRef = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!s.over) return;
    stop();
    const answered = s.correct + s.wrong;
    finish({
      score: s.score,
      timeMs: getElapsed(),
      accuracy: answered === 0 ? 0 : (s.correct / answered) * 100,
      completed: s.over === "done" || (s.over === "time" && s.correct > 0),
    });
  }, [s.over, s.score, s.correct, s.wrong, stop, getElapsed, finish]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 350);
    return () => window.clearTimeout(id);
  }, [flash]);

  const q = questions[s.index];

  async function answer(value: boolean) {
    if (busy.current || s.over || feedback || !q) return;
    busy.current = true;
    setPending(true);
    const started = performance.now();
    const res = await postAnswer(token, q.id, String(value));
    busy.current = false;
    if (!mounted.current) return;
    setPending(false);
    // the network round trip must not eat the player's clock
    addMs(performance.now() - started);
    if (!res) {
      dispatch({ type: "skip" });
      return;
    }
    if (res.correct) {
      comboRef.current += 1;
      playSound(comboRef.current % COMBO_BONUS_EVERY === 0 ? "combo" : "correct");
      setFlash("ok");
    } else {
      comboRef.current = 0;
      playSound("wrong");
      setFlash("bad");
      const exp = res.explanation;
      if (exp && (exp.uz || exp.ru || exp.en)) setFeedback({ statement: q.statement, explanation: exp, shownAt: performance.now() });
    }
    dispatch({ type: "answer", correct: res.correct, multiplier: config.multiplier });
  }

  function resume() {
    if (feedback) addMs(performance.now() - feedback.shownAt); // reading time is free
    setFeedback(null);
  }

  return (
    <div>
      <GameHud
        score={s.score}
        timeLeftMs={clock.remainingMs}
        progress={timeProgress(clock.elapsedMs, clock.remainingMs)}
        extra={
          <>
            <Stat label={t.combo} value={`x${s.combo}`} tone={s.combo >= 3 ? "amber" : "slate"} />
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-200"
              role="img"
              aria-label={`${t.lives}: ${s.lives}`}
            >
              <span className="text-xs opacity-70">{t.lives}</span>
              <span aria-hidden>{"♥".repeat(Math.max(0, s.lives))}</span>
            </span>
            <Stat label={t.question} value={`${Math.min(s.index + 1, s.total)}/${s.total}`} />
          </>
        }
      />

      {feedback ? (
        <div className="space-y-4 rounded-2xl border-2 border-red-300 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950/40" role="alert" data-testid="tf-feedback">
          <p className="text-lg font-bold text-red-700 dark:text-red-300">✗ {t.wrongMsg}</p>
          <p className="text-slate-800 dark:text-slate-100">{tr(feedback.statement, locale)}</p>
          <p className="rounded-xl bg-white/70 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <span className="font-semibold">{t.explanationLabel}: </span>
            {tr(feedback.explanation, locale)}
          </p>
          <button type="button" autoFocus onClick={resume} className="rounded-full bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-700">
            {t.continue} →
          </button>
        </div>
      ) : (
        <>
          <div className={`mb-6 flex min-h-36 items-center justify-center rounded-2xl px-4 py-8 text-center transition-colors ${flash === "ok" ? "bg-emerald-50 dark:bg-emerald-950" : flash === "bad" ? "bg-red-50 dark:bg-red-950" : "bg-slate-50 dark:bg-slate-800"}`}>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl" aria-live="polite" data-testid="tf-statement">
              {q ? tr(q.statement, locale) : ""}
            </p>
          </div>
          <div className="mx-auto grid max-w-md grid-cols-2 gap-3" role="group" aria-label={t.isItTrue}>
            <button
              type="button"
              disabled={pending || !!s.over}
              onClick={() => void answer(true)}
              className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 py-5 text-xl font-bold text-emerald-800 transition hover:bg-emerald-100 active:scale-95 disabled:opacity-60 dark:bg-emerald-950 dark:text-emerald-200"
            >
              ✓ {t.trueBtn}
            </button>
            <button
              type="button"
              disabled={pending || !!s.over}
              onClick={() => void answer(false)}
              className="rounded-2xl border-2 border-red-500 bg-red-50 py-5 text-xl font-bold text-red-800 transition hover:bg-red-100 active:scale-95 disabled:opacity-60 dark:bg-red-950 dark:text-red-200"
            >
              ✗ {t.falseBtn}
            </button>
          </div>
          <p className="mt-3 h-5 text-center text-xs text-slate-400" aria-live="polite">
            {pending ? t.checking : ""}
          </p>
        </>
      )}
    </div>
  );
}
