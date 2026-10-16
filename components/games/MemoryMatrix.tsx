"use client";
import { useEffect, useReducer } from "react";
import { playSound } from "@/lib/sound";
import type { GameProps } from "./types";
import { GameHud, Stat } from "./GameHud";
import { useGameT } from "./i18n";
import { useFinishOnce, useGameClock } from "./useGameClock";
import { clamp, shuffle } from "./utils";

const MAX_LEVELS_FOR_PROGRESS = 10;
const LIVES = 3;

type Phase = "show" | "input" | "between";

interface State {
  level: number;
  size: number;
  target: number[];
  picked: number[];
  wrongCell: number | null;
  lives: number;
  score: number;
  roundsWon: number;
  goodTaps: number;
  badTaps: number;
  phase: Phase;
  lastOutcome: "win" | "fail" | null;
  over: boolean;
}

function sizeFor(base: number, level: number) {
  return clamp(base + Math.floor((level - 1) / 3), 2, 7);
}
function cellsFor(size: number, level: number) {
  return clamp(level + 2, 3, Math.max(3, Math.floor(size * size * 0.6)));
}
function makeTarget(size: number, level: number): number[] {
  return shuffle(Array.from({ length: size * size }, (_, i) => i)).slice(0, cellsFor(size, level));
}

type Action =
  | { type: "startInput" }
  | { type: "tap"; cell: number; multiplier: number }
  | { type: "next"; target: number[]; baseSize: number }
  | { type: "timeup" };

function reducer(s: State, a: Action): State {
  if (s.over) return s;
  switch (a.type) {
    case "startInput":
      return s.phase === "show" ? { ...s, phase: "input" } : s;
    case "tap": {
      if (s.phase !== "input" || s.picked.includes(a.cell)) return s;
      if (s.target.includes(a.cell)) {
        const picked = [...s.picked, a.cell];
        const goodTaps = s.goodTaps + 1;
        if (picked.length === s.target.length) {
          const gained = Math.round((s.level * 40 + s.target.length * 10) * a.multiplier);
          return { ...s, picked, goodTaps, score: s.score + gained, roundsWon: s.roundsWon + 1, phase: "between", lastOutcome: "win" };
        }
        return { ...s, picked, goodTaps };
      }
      const lives = s.lives - 1;
      return {
        ...s,
        wrongCell: a.cell,
        badTaps: s.badTaps + 1,
        lives,
        phase: "between",
        lastOutcome: "fail",
        over: lives <= 0,
      };
    }
    case "next": {
      const level = s.lastOutcome === "win" ? s.level + 1 : s.level;
      const size = sizeFor(a.baseSize, level);
      return { ...s, level, size, target: a.target, picked: [], wrongCell: null, phase: "show", lastOutcome: null };
    }
    case "timeup":
      return { ...s, over: true };
  }
}

function init(baseSize: number): State {
  const size = sizeFor(baseSize, 1);
  return {
    level: 1,
    size,
    target: makeTarget(size, 1),
    picked: [],
    wrongCell: null,
    lives: LIVES,
    score: 0,
    roundsWon: 0,
    goodTaps: 0,
    badTaps: 0,
    phase: "show",
    lastOutcome: null,
    over: false,
  };
}

export function MemoryMatrix({ config, onFinish }: GameProps) {
  const { t } = useGameT();
  const baseSize = clamp(Math.round(config.grid), 2, 6);
  const [s, dispatch] = useReducer(reducer, baseSize, init);
  const finish = useFinishOnce(onFinish);
  const clock = useGameClock(config.time_limit, () => dispatch({ type: "timeup" }));
  const { stop, getElapsed } = clock;

  // Phase timers: all cleaned up on phase change / unmount.
  useEffect(() => {
    if (s.over) return;
    if (s.phase === "show") {
      const id = window.setTimeout(() => dispatch({ type: "startInput" }), 900 + s.target.length * 450);
      return () => window.clearTimeout(id);
    }
    if (s.phase === "between") {
      const id = window.setTimeout(() => {
        const level = s.lastOutcome === "win" ? s.level + 1 : s.level;
        dispatch({ type: "next", target: makeTarget(sizeFor(baseSize, level), level), baseSize });
      }, 1000);
      return () => window.clearTimeout(id);
    }
  }, [s.phase, s.over, s.level, s.lastOutcome, s.target.length, baseSize]);

  useEffect(() => {
    if (!s.over) return;
    stop();
    const taps = s.goodTaps + s.badTaps;
    finish({
      score: s.score,
      timeMs: getElapsed(),
      accuracy: taps === 0 ? 0 : (s.goodTaps / taps) * 100,
      completed: s.roundsWon > 0,
    });
  }, [s.over, s.score, s.goodTaps, s.badTaps, s.roundsWon, stop, getElapsed, finish]);

  function tap(cell: number) {
    if (s.phase !== "input") return;
    if (s.target.includes(cell)) {
      playSound(s.picked.length + 1 === s.target.length ? "correct" : "tap");
    } else {
      playSound("wrong");
    }
    dispatch({ type: "tap", cell, multiplier: config.multiplier });
  }

  const showAll = s.phase === "show" || (s.phase === "between" && s.lastOutcome === "fail");
  const hint = s.phase === "show" ? t.watch : s.phase === "input" ? t.yourTurn : "";

  return (
    <div>
      <GameHud
        score={s.score}
        timeLeftMs={config.time_limit > 0 ? clock.remainingMs : undefined}
        progress={Math.min(1, (s.level - 1) / MAX_LEVELS_FOR_PROGRESS)}
        extra={
          <>
            <Stat label={t.level} value={String(s.level)} tone="amber" />
            <Stat label={t.lives} value={"❤️".repeat(Math.max(0, s.lives)) || "—"} tone="red" />
          </>
        }
      />
      <p className="mb-3 h-6 text-center text-sm font-medium text-slate-600 dark:text-slate-300" aria-live="polite">
        {hint}
      </p>
      <div className="mx-auto grid max-w-sm gap-2" style={{ gridTemplateColumns: `repeat(${s.size}, minmax(0, 1fr))` }}>
        {Array.from({ length: s.size * s.size }, (_, cell) => {
          const isTarget = s.target.includes(cell);
          const isPicked = s.picked.includes(cell);
          const lit = (showAll && isTarget) || isPicked;
          const bad = s.wrongCell === cell;
          return (
            <button
              key={cell}
              type="button"
              onClick={() => tap(cell)}
              disabled={s.phase !== "input"}
              aria-label={`${cell + 1}`}
              className={`aspect-square rounded-xl border-2 transition-colors duration-200 ${
                bad
                  ? "border-red-400 bg-red-500"
                  : lit
                    ? showAll && !isPicked && s.lastOutcome === "fail"
                      ? "border-amber-300 bg-amber-300"
                      : "border-indigo-400 bg-indigo-500"
                    : "border-slate-200 bg-slate-100 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
