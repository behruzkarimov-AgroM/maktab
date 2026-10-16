"use client";
import { useEffect, useReducer, useRef } from "react";
import { playSound } from "@/lib/sound";
import type { GameProps } from "./types";
import { GameHud, Stat } from "./GameHud";
import { useGameT } from "./i18n";
import { useFinishOnce, useGameClock } from "./useGameClock";
import { clamp, randInt, timeProgress } from "./utils";

const nowMs = () => performance.now();

const COLORS = [
  { key: "red", hex: "#ef4444" },
  { key: "blue", hex: "#3b82f6" },
  { key: "green", hex: "#22c55e" },
  { key: "yellow", hex: "#eab308" },
  { key: "purple", hex: "#a855f7" },
  { key: "orange", hex: "#f97316" },
] as const;

interface Q {
  word: number; // index of the colour NAME shown
  ink: number; // index of the colour actually used for the letters
}

function makeQ(n: number, mismatch: number): Q {
  const ink = randInt(0, n - 1);
  if (Math.random() < mismatch) {
    let word = randInt(0, n - 1);
    if (word === ink) word = (word + 1 + randInt(0, n - 2)) % n;
    return { word, ink };
  }
  return { word: ink, ink };
}

interface State {
  q: Q;
  seq: number;
  score: number;
  streak: number;
  correct: number;
  wrong: number;
  over: boolean;
}

type Action = { type: "answer"; choice: number; fast: boolean; next: Q; multiplier: number } | { type: "timeup" };

function reducer(s: State, a: Action): State {
  if (s.over) return s;
  if (a.type === "timeup") return { ...s, over: true };
  if (a.choice === s.q.ink) {
    const points = Math.round((10 + (a.fast ? 5 : 0) + Math.min(s.streak, 10)) * a.multiplier);
    return { ...s, q: a.next, seq: s.seq + 1, score: s.score + points, streak: s.streak + 1, correct: s.correct + 1 };
  }
  return { ...s, q: a.next, seq: s.seq + 1, score: Math.max(0, s.score - 5), streak: 0, wrong: s.wrong + 1 };
}

export function StroopTest({ config, onFinish }: GameProps) {
  const { t } = useGameT();
  const n = clamp(Math.round(config.grid), 3, 6);
  const mismatch = n >= 6 ? 0.85 : n === 5 ? 0.75 : 0.65;
  const [s, dispatch] = useReducer(reducer, undefined, (): State => ({
    q: makeQ(n, mismatch),
    seq: 0,
    score: 0,
    streak: 0,
    correct: 0,
    wrong: 0,
    over: false,
  }));
  const finish = useFinishOnce(onFinish);
  const clock = useGameClock(Math.max(10, config.time_limit),() => dispatch({ type: "timeup" }));
  const { stop, getElapsed } = clock;
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = nowMs();
  }, [s.seq]);

  useEffect(() => {
    if (!s.over) return;
    stop();
    const answered = s.correct + s.wrong;
    finish({
      score: s.score,
      timeMs: getElapsed(),
      accuracy: answered === 0 ? 0 : (s.correct / answered) * 100,
      completed: s.correct > 0,
    });
  }, [s.over, s.score, s.correct, s.wrong, stop, getElapsed, finish]);

  function answer(choice: number) {
    if (s.over) return;
    const ok = choice === s.q.ink;
    playSound(ok ? "correct" : "wrong");
    dispatch({
      type: "answer",
      choice,
      fast: nowMs() - shownAt.current < 1500,
      next: makeQ(n, mismatch),
      multiplier: config.multiplier,
    });
  }

  return (
    <div>
      <GameHud
        score={s.score}
        timeLeftMs={clock.remainingMs}
        progress={timeProgress(clock.elapsedMs, clock.remainingMs)}
        extra={<Stat label={t.combo} value={`x${s.streak}`} tone={s.streak >= 3 ? "amber" : "slate"} />}
      />
      <p className="mb-2 text-center text-sm text-slate-500 dark:text-slate-400">{t.whichColor}</p>
      <div className="mb-6 rounded-2xl bg-slate-900 py-10 text-center ring-1 ring-slate-700">
        <p className="text-5xl font-black tracking-wide sm:text-6xl" style={{ color: COLORS[s.q.ink].hex }} aria-live="polite">
          {t.colors[COLORS[s.q.word].key]}
        </p>
      </div>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
        {COLORS.slice(0, n).map((c, i) => (
          <button
            key={c.key}
            type="button"
            onClick={() => answer(i)}
            className="rounded-2xl border-2 border-slate-200 bg-white px-2 py-4 text-base font-bold text-slate-800 transition hover:border-indigo-400 hover:bg-indigo-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {t.colors[c.key]}
          </button>
        ))}
      </div>
    </div>
  );
}
