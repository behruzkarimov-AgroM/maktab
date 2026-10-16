"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameResult } from "./types";

/**
 * Wall-clock based game timer. Time is always derived from performance.now() deltas
 * (never from counting interval ticks), so throttled tabs / slow renders cannot skew it.
 * State is only used for DISPLAY; logic reads getElapsed()/getRemaining() which are always fresh.
 */
export interface GameClock {
  /** Remaining ms for display (Infinity when limit is 0). Updated ~10x/sec. */
  remainingMs: number;
  /** Elapsed ms for display. */
  elapsedMs: number;
  /** Fresh elapsed time (ms). Frozen after stop(). */
  getElapsed: () => number;
  getRemaining: () => number;
  /** Add (or remove) time, e.g. +2000 combo bonus. */
  addMs: (ms: number) => void;
  /** Stop and freeze the clock. */
  stop: () => void;
}

export function useGameClock(limitSeconds: number, onExpire: () => void): GameClock {
  const limitMs = limitSeconds > 0 ? limitSeconds * 1000 : Infinity;
  const startRef = useRef<number | null>(null);
  const frozenRef = useRef<number | null>(null);
  const bonusRef = useRef(0);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  const [display, setDisplay] = useState({ elapsed: 0, remaining: limitMs });

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const getElapsed = useCallback(() => {
    if (frozenRef.current !== null) return frozenRef.current;
    if (startRef.current === null) return 0;
    return performance.now() - startRef.current;
  }, []);

  const getRemaining = useCallback(() => limitMs + bonusRef.current - getElapsed(), [limitMs, getElapsed]);

  useEffect(() => {
    startRef.current = performance.now();
    frozenRef.current = null;
    bonusRef.current = 0;
    expiredRef.current = false;
    const id = window.setInterval(() => {
      if (frozenRef.current !== null) return;
      const elapsed = performance.now() - (startRef.current ?? performance.now());
      const remaining = limitMs + bonusRef.current - elapsed;
      setDisplay({ elapsed, remaining });
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        frozenRef.current = Math.min(elapsed, limitMs + bonusRef.current);
        onExpireRef.current();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [limitMs]);

  const addMs = useCallback((ms: number) => {
    bonusRef.current += ms;
  }, []);

  const stop = useCallback(() => {
    if (frozenRef.current === null) frozenRef.current = getElapsed();
  }, [getElapsed]);

  return { remainingMs: display.remaining, elapsedMs: display.elapsed, getElapsed, getRemaining, addMs, stop };
}

/** Returns a stable finish() that forwards to onFinish exactly once. */
export function useFinishOnce(onFinish: (r: GameResult) => void): (r: GameResult) => void {
  const doneRef = useRef(false);
  const cbRef = useRef(onFinish);
  useEffect(() => {
    cbRef.current = onFinish;
  });
  return useCallback((r: GameResult) => {
    if (doneRef.current) return;
    doneRef.current = true;
    cbRef.current(r);
  }, []);
}

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return "--";
  const s = Math.max(0, ms) / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : s.toFixed(1);
}
