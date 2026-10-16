"use client";
import { useEffect, useReducer, useState } from "react";
import { playSound } from "@/lib/sound";
import type { GameProps } from "./types";
import { GameHud, Stat } from "./GameHud";
import { useGameT } from "./i18n";
import { useFinishOnce, useGameClock } from "./useGameClock";
import { clamp, randInt, shuffle, timeProgress } from "./utils";

const BONUS_EVERY = 5;
const BONUS_MS = 2000;

interface Question {
  text: string;
  options: number[];
  answer: number;
}

function makeQuestion(maxOperand: number): Question {
  const m = clamp(maxOperand, 5, 200);
  const ops = m >= 30 ? ["+", "-", "×"] : ["+", "-"];
  const op = ops[randInt(0, ops.length - 1)];
  let a: number;
  let b: number;
  let answer: number;
  if (op === "×") {
    const f = m >= 60 ? 12 : 10;
    a = randInt(2, f);
    b = randInt(2, f);
    answer = a * b;
  } else if (op === "-") {
    a = randInt(Math.ceil(m / 4), m);
    b = randInt(1, a);
    answer = a - b;
  } else {
    a = randInt(1, m);
    b = randInt(1, m);
    answer = a + b;
  }
  const set = new Set<number>([answer]);
  const spread = Math.max(3, Math.round(Math.max(answer, 10) * 0.2));
  let guard = 0;
  while (set.size < 4 && guard++ < 50) {
    const d = randInt(1, spread) * (Math.random() < 0.5 ? -1 : 1);
    const v = answer + d;
    if (v >= 0) set.add(v);
  }
  let fill = 1;
  while (set.size < 4) set.add(answer + fill++);
  return { text: `${a} ${op} ${b}`, options: shuffle([...set]), answer };
}

interface State {
  q: Question;
  seq: number;
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  wrong: number;
  over: boolean;
}

type Action = { type: "answer"; value: number; next: Question; multiplier: number } | { type: "timeup" };

function reducer(s: State, a: Action): State {
  if (s.over) return s;
  if (a.type === "timeup") return { ...s, over: true };
  if (a.value === s.q.answer) {
    const combo = s.combo + 1;
    const points = Math.round(10 * (1 + 0.25 * Math.min(combo - 1, 8)) * a.multiplier);
    return {
      ...s,
      q: a.next,
      seq: s.seq + 1,
      score: s.score + points,
      combo,
      bestCombo: Math.max(s.bestCombo, combo),
      correct: s.correct + 1,
    };
  }
  return { ...s, q: a.next, seq: s.seq + 1, combo: 0, wrong: s.wrong + 1 };
}

export function MentalMath({ config, onFinish }: GameProps) {
  const { t } = useGameT();
  const [s, dispatch] = useReducer(reducer, config.grid, (g): State => ({
    q: makeQuestion(g),
    seq: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    correct: 0,
    wrong: 0,
    over: false,
  }));
  const [flash, setFlash] = useState<{ value: number; ok: boolean; seq: number } | null>(null);
  const finish = useFinishOnce(onFinish);
  const clock = useGameClock(Math.max(10, config.time_limit),() => dispatch({ type: "timeup" }));
  const { stop, getElapsed, addMs } = clock;

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

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 250);
    return () => window.clearTimeout(id);
  }, [flash]);

  function answer(value: number) {
    if (s.over) return;
    const ok = value === s.q.answer;
    setFlash({ value, ok, seq: s.seq });
    if (ok) {
      const combo = s.combo + 1;
      if (combo % BONUS_EVERY === 0) {
        addMs(BONUS_MS);
        playSound("combo");
      } else {
        playSound("correct");
      }
    } else {
      playSound("wrong");
    }
    dispatch({ type: "answer", value, next: makeQuestion(config.grid), multiplier: config.multiplier });
  }

  const bonusProgress = s.combo % BONUS_EVERY;

  return (
    <div>
      <GameHud
        score={s.score}
        timeLeftMs={clock.remainingMs}
        progress={timeProgress(clock.elapsedMs, clock.remainingMs)}
        extra={
          <>
            <Stat label={t.combo} value={`x${s.combo}`} tone={s.combo >= 3 ? "amber" : "slate"} />
            <Stat label="+2s" value={`${bonusProgress}/${BONUS_EVERY}`} tone="emerald" />
          </>
        }
      />
      <div className="mb-6 rounded-2xl bg-slate-50 py-8 text-center dark:bg-slate-800">
        <p className="text-5xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50 sm:text-6xl" aria-live="polite">
          {s.q.text} = ?
        </p>
      </div>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        {s.q.options.map((o) => (
          <button
            key={`${s.seq}-${o}`}
            type="button"
            onClick={() => answer(o)}
            className="rounded-2xl border-2 border-slate-200 bg-white py-5 text-3xl font-bold tabular-nums text-slate-800 transition hover:border-indigo-400 hover:bg-indigo-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {o}
          </button>
        ))}
      </div>
      <p className="mt-4 h-6 text-center text-sm font-semibold" aria-live="polite">
        {flash ? (flash.ok ? <span className="text-emerald-600">✓</span> : <span className="text-red-600">✗</span>) : null}
      </p>
    </div>
  );
}
