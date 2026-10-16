"use client";
import { useEffect, useReducer } from "react";
import { playSound } from "@/lib/sound";
import type { GameProps } from "./types";
import { GameHud, Stat } from "./GameHud";
import { useGameT } from "./i18n";
import { useFinishOnce, useGameClock } from "./useGameClock";
import { clamp, pick, randInt, shuffle } from "./utils";

const TOTAL_QUESTIONS = 10;

type ShapeKind = "circle" | "square" | "triangle" | "star" | "diamond";
type Item = { kind: "num"; v: number } | { kind: "shape"; shape: ShapeKind; color: string; rot: number };

interface Puzzle {
  shown: Item[];
  options: Item[];
  answerIndex: number;
}

const SHAPES: ShapeKind[] = ["circle", "square", "triangle", "star", "diamond"];
const PALETTE = ["#457b9d", "#10b981", "#f4b942", "#ef4444", "#1d3557"];

const itemKey = (i: Item) => (i.kind === "num" ? `n${i.v}` : `s${i.shape}|${i.color}|${i.rot}`);

function numberSequence(c: number): { seq: number[]; shownCount: number } {
  const types = c === 1 ? ["arith", "arith", "grow"] : c === 2 ? ["arith", "geo", "square", "grow"] : ["geo", "fib", "alt", "grow", "square"];
  const type = pick(types);
  let seq: number[] = [];
  switch (type) {
    case "arith": {
      const d = randInt(2, c === 1 ? 5 : 9) * (c >= 2 && Math.random() < 0.3 ? -1 : 1);
      // decreasing rows must stay positive for all 6 terms
      const start = d < 0 ? randInt(Math.abs(d) * 5 + 1, Math.abs(d) * 5 + 30) : randInt(1, 20);
      seq = Array.from({ length: 6 }, (_, i) => start + d * i);
      break;
    }
    case "geo": {
      const r = c >= 3 && Math.random() < 0.4 ? 3 : 2;
      const start = randInt(1, 4);
      seq = Array.from({ length: 6 }, (_, i) => start * r ** i);
      break;
    }
    case "square": {
      const k = c >= 3 ? randInt(1, 5) : 0;
      const off = randInt(1, 4);
      seq = Array.from({ length: 6 }, (_, i) => (i + off) ** 2 + k);
      break;
    }
    case "grow": {
      // differences grow by a constant: +1,+2,+3... (or +2,+4,...)
      const step = c >= 3 ? randInt(1, 3) : 1;
      let v = randInt(1, 10);
      seq = [v];
      for (let i = 1; i < 6; i++) {
        v += step * i;
        seq.push(v);
      }
      break;
    }
    case "fib": {
      const a = randInt(1, 4);
      const b = randInt(1, 5);
      seq = [a, b];
      for (let i = 2; i < 7; i++) seq.push(seq[i - 1] + seq[i - 2]);
      break;
    }
    case "alt": {
      const a = randInt(1, 10);
      const da = randInt(2, 5);
      const b = randInt(20, 40);
      const db = randInt(1, 4);
      seq = Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? a + da * (i / 2) : b - db * ((i - 1) / 2)));
      break;
    }
  }
  return { seq, shownCount: type === "fib" ? 6 : type === "alt" ? 6 : 5 };
}

function numberPuzzle(c: number): Puzzle {
  const { seq, shownCount } = numberSequence(c);
  const shown = seq.slice(0, shownCount);
  const answer = seq[shownCount];
  const last = shown[shown.length - 1];
  const step = Math.abs(answer - last) || 2;
  const cands = new Set<number>();
  const tries = [step, -step, 1, -1, 2, -2, Math.ceil(step / 2), step + 1, step * 2, 3, -3];
  for (const d of shuffle(tries)) {
    const v = answer + d;
    if (v !== answer && v >= 0) cands.add(v);
    if (cands.size >= 3) break;
  }
  let bump = 4;
  while (cands.size < 3) cands.add(answer + bump++);
  const options: Item[] = shuffle([answer, ...cands]).map((v) => ({ kind: "num", v }));
  return {
    shown: shown.map((v) => ({ kind: "num", v })),
    options,
    answerIndex: options.findIndex((o) => o.kind === "num" && o.v === answer),
  };
}

function shapePuzzle(c: number): Puzzle {
  const mode = c >= 2 && Math.random() < 0.5 ? "rotate" : "cycle";
  let seq: Item[] = [];
  if (mode === "rotate") {
    const step = pick([45, 90]);
    const shape = pick<ShapeKind>(["triangle", "star"]);
    const color = pick(PALETTE);
    seq = Array.from({ length: 6 }, (_, i) => ({ kind: "shape", shape, color, rot: (step * i) % 360 }));
  } else {
    const period = c === 1 ? 2 : randInt(2, 3);
    const shapes = shuffle(SHAPES).slice(0, period);
    const colors = shuffle(PALETTE).slice(0, c >= 3 ? period : 1);
    seq = Array.from({ length: 6 }, (_, i) => ({
      kind: "shape",
      shape: shapes[i % period],
      color: colors[i % colors.length],
      rot: 0,
    }));
  }
  const answer = seq[5] as Extract<Item, { kind: "shape" }>;
  const shown = seq.slice(0, 5);
  const opts = new Map<string, Item>([[itemKey(answer), answer]]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 60) {
    const v: Item =
      mode === "rotate"
        ? { ...answer, rot: pick([0, 45, 90, 135, 180, 225, 270, 315]) }
        : Math.random() < 0.5
          ? { ...answer, shape: pick(SHAPES) }
          : { ...answer, color: pick(PALETTE) };
    opts.set(itemKey(v), v);
  }
  const options = shuffle([...opts.values()]);
  return { shown, options, answerIndex: options.findIndex((o) => itemKey(o) === itemKey(answer)) };
}

function makePuzzle(complexity: number): Puzzle {
  const c = clamp(Math.round(complexity), 1, 3);
  return Math.random() < 0.3 ? shapePuzzle(c) : numberPuzzle(c);
}

function ShapeSvg({ item, size = 44 }: { item: Extract<Item, { kind: "shape" }>; size?: number }) {
  const common = { fill: item.color, stroke: "rgba(0,0,0,0.25)", strokeWidth: 1.5 };
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ transform: `rotate(${item.rot}deg)` }}>
      {item.shape === "circle" && <circle cx="20" cy="20" r="14" {...common} />}
      {item.shape === "square" && <rect x="7" y="7" width="26" height="26" rx="3" {...common} />}
      {item.shape === "triangle" && <polygon points="20,5 35,33 5,33" {...common} />}
      {item.shape === "diamond" && <polygon points="20,4 35,20 20,36 5,20" {...common} />}
      {item.shape === "star" && (
        <polygon points="20,4 24.7,14.6 36,15.6 27.4,23.2 30,34.4 20,28.4 10,34.4 12.6,23.2 4,15.6 15.3,14.6" {...common} />
      )}
    </svg>
  );
}

function ItemView({ item, big }: { item: Item; big?: boolean }) {
  if (item.kind === "num") {
    return <span className={`font-extrabold tabular-nums ${big ? "text-3xl" : "text-2xl sm:text-3xl"}`}>{item.v}</span>;
  }
  return <ShapeSvg item={item} size={big ? 56 : 44} />;
}

interface State {
  puzzle: Puzzle;
  index: number; // questions answered
  correct: number;
  over: boolean;
  chosen: number | null;
}
type Action = { type: "answer"; i: number; next: Puzzle } | { type: "timeup" };

function reducer(s: State, a: Action): State {
  if (s.over) return s;
  if (a.type === "timeup") return { ...s, over: true };
  const ok = a.i === s.puzzle.answerIndex;
  const index = s.index + 1;
  return { puzzle: a.next, index, correct: s.correct + (ok ? 1 : 0), over: index >= TOTAL_QUESTIONS, chosen: null };
}

export function LogicSequence({ config, onFinish }: GameProps) {
  const { t } = useGameT();
  const [s, dispatch] = useReducer(reducer, config.grid, (g): State => ({
    puzzle: makePuzzle(g),
    index: 0,
    correct: 0,
    over: false,
    chosen: null,
  }));
  const finish = useFinishOnce(onFinish);
  const clock = useGameClock(config.time_limit, () => dispatch({ type: "timeup" }));
  const { stop, getElapsed, getRemaining } = clock;

  useEffect(() => {
    if (!s.over) return;
    stop();
    const allDone = s.index >= TOTAL_QUESTIONS;
    const bonus = allDone && config.time_limit > 0 ? Math.max(0, getRemaining() / 1000) * 2 : 0;
    finish({
      score: Math.round((s.correct * 100 + bonus) * config.multiplier),
      timeMs: getElapsed(),
      accuracy: s.index === 0 ? 0 : (s.correct / s.index) * 100,
      completed: s.correct > 0,
    });
  }, [s.over, s.index, s.correct, config.time_limit, config.multiplier, stop, getElapsed, getRemaining, finish]);

  function answer(i: number) {
    if (s.over) return;
    playSound(i === s.puzzle.answerIndex ? "correct" : "wrong");
    dispatch({ type: "answer", i, next: makePuzzle(config.grid) });
  }

  return (
    <div>
      <GameHud
        score={Math.round(s.correct * 100 * config.multiplier)}
        timeLeftMs={config.time_limit > 0 ? clock.remainingMs : undefined}
        progress={s.index / TOTAL_QUESTIONS}
        extra={<Stat label={t.question} value={`${Math.min(s.index + 1, TOTAL_QUESTIONS)}/${TOTAL_QUESTIONS}`} tone="amber" />}
      />
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-slate-50 p-4 text-slate-900 dark:bg-slate-800 dark:text-slate-50 sm:gap-3">
        {s.puzzle.shown.map((it, i) => (
          <span
            key={`${s.index}-${i}`}
            className="flex h-14 min-w-14 items-center justify-center rounded-xl bg-white px-2 shadow-sm dark:bg-slate-900 sm:h-16 sm:min-w-16"
          >
            <ItemView item={it} />
          </span>
        ))}
        <span className="flex h-14 min-w-14 items-center justify-center rounded-xl border-2 border-dashed border-indigo-400 px-2 text-2xl font-bold text-indigo-500 sm:h-16 sm:min-w-16">
          ?
        </span>
      </div>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        {s.puzzle.options.map((o, i) => (
          <button
            key={`${s.index}-${itemKey(o)}`}
            type="button"
            onClick={() => answer(i)}
            className="flex h-20 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-800 transition hover:border-indigo-400 hover:bg-indigo-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <ItemView item={o} big />
          </button>
        ))}
      </div>
    </div>
  );
}
