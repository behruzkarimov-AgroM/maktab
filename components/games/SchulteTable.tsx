"use client";
import { useEffect, useReducer } from "react";
import { playSound } from "@/lib/sound";
import type { GameProps } from "./types";
import { GameHud, Stat } from "./GameHud";
import { useGameT } from "./i18n";
import { useFinishOnce, useGameClock } from "./useGameClock";
import { clamp, shuffle } from "./utils";

interface State {
  cells: number[];
  next: number; // next number to find
  errors: number;
  wrong: number | null; // last wrongly tapped value (visual flash)
  over: "won" | "timeup" | null;
}

type Action = { type: "hit" } | { type: "miss"; value: number } | { type: "clearWrong" } | { type: "timeup" };

function init(total: number): State {
  return { cells: shuffle(Array.from({ length: total }, (_, i) => i + 1)), next: 1, errors: 0, wrong: null, over: null };
}

function makeReducer(total: number) {
  return (s: State, a: Action): State => {
    if (s.over && a.type !== "clearWrong") return s;
    switch (a.type) {
      case "hit": {
        const next = s.next + 1;
        return { ...s, next, wrong: null, over: next > total ? "won" : null };
      }
      case "miss":
        return { ...s, errors: s.errors + 1, wrong: a.value };
      case "clearWrong":
        return s.wrong === null ? s : { ...s, wrong: null };
      case "timeup":
        return { ...s, over: "timeup" };
    }
  };
}

export function SchulteTable({ config, onFinish }: GameProps) {
  const { t } = useGameT();
  const n = clamp(Math.round(config.grid), 2, 7);
  const total = n * n;
  const [state, dispatch] = useReducer(makeReducer(total), total, init);
  const finish = useFinishOnce(onFinish);
  const clock = useGameClock(config.time_limit, () => dispatch({ type: "timeup" }));
  const { stop, getElapsed, getRemaining } = clock;

  const found = state.next - 1;
  const score = Math.max(0, Math.round((found * 10 - state.errors * 5) * config.multiplier));

  // Game over -> compute the result once from the final state (no stale values: deps are explicit).
  useEffect(() => {
    if (!state.over) return;
    stop();
    const won = state.over === "won";
    const bonus = won && config.time_limit > 0 ? Math.max(0, getRemaining() / 1000) * 5 : 0;
    const final = Math.max(0, Math.round((found * 10 + bonus - state.errors * 5) * config.multiplier));
    finish({
      score: final,
      timeMs: getElapsed(),
      accuracy: found + state.errors === 0 ? 0 : (found / (found + state.errors)) * 100,
      completed: won,
    });
  }, [state.over, state.errors, found, config.time_limit, config.multiplier, stop, getElapsed, getRemaining, finish]);

  // Clear the red flash after a moment; timer is cleaned up on change/unmount.
  useEffect(() => {
    if (state.wrong === null) return;
    const id = window.setTimeout(() => dispatch({ type: "clearWrong" }), 350);
    return () => window.clearTimeout(id);
  }, [state.wrong, state.errors]);

  function tap(value: number) {
    if (state.over) return;
    if (value === state.next) {
      playSound("tap");
      dispatch({ type: "hit" });
    } else {
      playSound("wrong");
      dispatch({ type: "miss", value });
    }
  }

  const fontSize = n <= 3 ? "text-3xl sm:text-4xl" : n === 4 ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl";

  return (
    <div>
      <GameHud
        score={score}
        timeLeftMs={config.time_limit > 0 ? clock.remainingMs : undefined}
        progress={found / total}
        extra={
          <>
            <Stat label={t.findNumber} value={String(Math.min(state.next, total))} tone="amber" />
            <Stat label={t.errors} value={String(state.errors)} tone={state.errors ? "red" : "slate"} />
          </>
        }
      />
      <div className="mx-auto grid max-w-md gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {state.cells.map((v) => {
          const done = v < state.next;
          const bad = state.wrong === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => tap(v)}
              disabled={done}
              aria-label={String(v)}
              className={`aspect-square select-none rounded-xl border-2 font-bold tabular-nums transition active:scale-95 ${fontSize} ${
                done
                  ? "border-emerald-200 bg-emerald-100 text-emerald-300 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-800"
                  : bad
                    ? "border-red-400 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200"
                    : "border-slate-200 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
