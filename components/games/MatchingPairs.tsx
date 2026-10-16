"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { tr } from "@/lib/types";
import { playSound } from "@/lib/sound";
import {
  connectInit, connectPick, flipCard, flipInit, flipResolve, matchingAccuracy, matchingScore, pairsPerRound, shuffleWith,
  type ConnectState, type FlipState,
} from "./content-logic";
import type { ContentGameExtra, MatchingPair } from "./content-types";
import { GameHud, Stat } from "./GameHud";
import { useGameT } from "./i18n";
import type { GameProps } from "./types";
import { useContentRound } from "./useContentRound";
import { useFinishOnce, useGameClock } from "./useGameClock";

type Mode = "flip" | "connect";

export function MatchingPairs({ config, difficulty, onFinish, set }: GameProps & ContentGameExtra) {
  const { t } = useGameT();
  const [mode, setMode] = useState<Mode | null>(null);
  const r = useContentRound(set.id, pairsPerRound(config.grid, set.item_count));

  if (r.status === "loading") return <p className="py-10 text-center text-slate-500">{t.roundLoading}</p>;
  if (r.status === "error" || r.round.game_type !== "matching") return <p className="py-10 text-center text-red-600">{t.roundError}</p>;

  if (!mode) {
    return (
      <div className="space-y-3" data-testid="matching-mode">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t.chooseMode}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["flip", "connect"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                playSound("tap");
                setMode(m);
              }}
              className="rounded-2xl border-2 border-slate-200 p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <span className="block text-lg font-bold text-slate-900 dark:text-slate-50">{m === "flip" ? t.modeFlip : t.modeConnect}</span>
              <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{m === "flip" ? t.modeFlipHint : t.modeConnectHint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <MatchingBoard pairs={r.round.pairs} mode={mode} config={config} difficulty={difficulty} onFinish={onFinish} />;
}

type FlipAction = { type: "flip"; idx: number } | { type: "resolve" };
const flipReducer = (s: FlipState, a: FlipAction): FlipState => (a.type === "flip" ? flipCard(s, a.idx) : flipResolve(s));
type ConnAction = { type: "pick"; side: "left" | "right"; id: string } | { type: "clearWrong" };
const connReducer = (s: ConnectState, a: ConnAction): ConnectState => (a.type === "pick" ? connectPick(s, a.side, a.id) : { ...s, wrong: null });

function MatchingBoard({ pairs, mode, config, onFinish }: { pairs: MatchingPair[]; mode: Mode } & Pick<GameProps, "config" | "difficulty" | "onFinish">) {
  const { t, locale } = useGameT();
  const total = pairs.length;
  const [flip, dispatchFlip] = useReducer(flipReducer, pairs, (p) => flipInit(p));
  const [conn, dispatchConn] = useReducer(connReducer, undefined, connectInit);
  const [rightOrder] = useState(() => shuffleWith(pairs));
  const [timeUp, setTimeUp] = useState(false);
  const finish = useFinishOnce(onFinish);
  const clock = useGameClock(config.time_limit, () => setTimeUp(true));
  const { stop, getElapsed } = clock;

  const matched = mode === "flip" ? flip.matched.length : conn.matched.length;
  const mistakes = mode === "flip" ? flip.mistakes : conn.mistakes;
  const won = matched === total;
  const over = won || timeUp;
  // live score without the speed bonus (added once at the end)
  const score = matchingScore({ pairs: matched, mistakes, elapsedMs: 0, limitSec: 0, multiplier: config.multiplier });

  // mismatching flip pair is turned back after a short look
  useEffect(() => {
    if (!flip.locked) return;
    const id = window.setTimeout(() => dispatchFlip({ type: "resolve" }), 850);
    return () => window.clearTimeout(id);
  }, [flip.locked]);
  useEffect(() => {
    if (!conn.wrong) return;
    const id = window.setTimeout(() => dispatchConn({ type: "clearWrong" }), 600);
    return () => window.clearTimeout(id);
  }, [conn.wrong]);

  // sounds for new matches / mistakes (skip the initial render)
  const prev = useRef({ matched: 0, mistakes: 0 });
  useEffect(() => {
    if (matched > prev.current.matched) playSound("correct");
    if (mistakes > prev.current.mistakes) playSound("wrong");
    prev.current = { matched, mistakes };
  }, [matched, mistakes]);

  useEffect(() => {
    if (!over) return;
    stop();
    const elapsed = getElapsed();
    finish({
      score: matchingScore({ pairs: matched, mistakes, elapsedMs: elapsed, limitSec: config.time_limit, multiplier: config.multiplier }),
      timeMs: elapsed,
      accuracy: matchingAccuracy(matched, mistakes),
      completed: won,
    });
  }, [over, won, matched, mistakes, config.time_limit, config.multiplier, stop, getElapsed, finish]);

  const label = (p: MatchingPair, side: "left" | "right") => tr(p[side], locale);
  const byId = new Map(pairs.map((p) => [p.id, p]));

  return (
    <div>
      <GameHud
        score={score}
        timeLeftMs={clock.remainingMs}
        progress={matched / total}
        extra={
          <>
            <Stat label={t.found} value={`${matched}/${total}`} tone="emerald" />
            <Stat label={t.errors} value={String(mistakes)} tone={mistakes > 0 ? "red" : "slate"} />
            {mode === "flip" && <Stat label={t.moves} value={String(flip.moves)} />}
          </>
        }
      />

      {mode === "flip" ? (
        <ul className={`grid gap-2 sm:gap-3 ${total * 2 <= 12 ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-4 sm:grid-cols-6"}`} aria-label={t.card}>
          {flip.cards.map((c, i) => {
            const up = flip.flipped.includes(i) || flip.matched.includes(c.pairId);
            const done = flip.matched.includes(c.pairId);
            const text = label(byId.get(c.pairId)!, c.side);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  disabled={over || done}
                  onClick={() => {
                    playSound("tap");
                    dispatchFlip({ type: "flip", idx: i });
                  }}
                  aria-label={up ? text : `${t.cardHidden} ${i + 1}`}
                  data-state={done ? "matched" : up ? "up" : "down"}
                  className={`flex h-20 w-full items-center justify-center rounded-xl border-2 px-1.5 text-center text-xs font-semibold leading-tight transition duration-200 motion-reduce:transition-none sm:h-24 sm:text-sm ${
                    done
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : up
                        ? "border-indigo-500 bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                        : "border-transparent bg-gradient-to-br from-indigo-500 to-indigo-700 text-2xl text-white hover:brightness-110 active:scale-95"
                  }`}
                >
                  <span className="break-words [overflow-wrap:anywhere]">{up ? text : "?"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {(["left", "right"] as const).map((side) => (
            <ul key={side} className="space-y-2" aria-label={side === "left" ? t.colLeft : t.colRight}>
              <li className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{side === "left" ? t.colLeft : t.colRight}</li>
              {(side === "left" ? pairs : rightOrder).map((p) => {
                const done = conn.matched.includes(p.id);
                const sel = conn.selected?.side === side && conn.selected.id === p.id;
                const bad = conn.wrong && conn.wrong[side] === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={over || done}
                      aria-pressed={sel}
                      onClick={() => {
                        playSound("tap");
                        dispatchConn({ type: "pick", side, id: p.id });
                      }}
                      data-state={done ? "matched" : bad ? "wrong" : sel ? "selected" : "idle"}
                      className={`min-h-14 w-full rounded-xl border-2 px-3 py-2 text-left text-sm font-medium transition motion-reduce:transition-none ${
                        done
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 opacity-70 dark:bg-emerald-950 dark:text-emerald-200"
                          : bad
                            ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                            : sel
                              ? "border-indigo-600 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
                              : "border-slate-200 bg-white text-slate-800 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      }`}
                    >
                      <span className="break-words [overflow-wrap:anywhere]">{label(p, side)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {t.found}: {matched}/{total}
      </p>
    </div>
  );
}
