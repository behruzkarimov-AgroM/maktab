"use client";
import { useEffect, useState } from "react";
import type { Difficulty } from "@/lib/types";
import { DIFFICULTIES, type GameSlug, type LeaderboardEntry } from "./types";
import { useGameT } from "./i18n";
import { formatClock } from "./useGameClock";

interface Props {
  slug: GameSlug;
  initialDifficulty: Difficulty;
  /** Bump to force a reload (e.g. after saving a score). */
  refreshKey: number;
}

export function Leaderboard({ slug, initialDifficulty, refreshKey }: Props) {
  const { t } = useGameT();
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [state, setState] = useState<{ key: string; entries: LeaderboardEntry[]; demo: boolean; error: boolean } | null>(null);
  const key = `${slug}|${difficulty}|${refreshKey}`;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/games/leaderboard?game=${slug}&difficulty=${difficulty}&limit=10`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { entries: LeaderboardEntry[]; demo?: boolean }) =>
        setState({ key, entries: j.entries ?? [], demo: !!j.demo, error: false }),
      )
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setState({ key, entries: [], demo: false, error: true });
      });
    return () => ctrl.abort();
  }, [slug, difficulty, key]);

  const loading = !state || state.key !== key;
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">🏆 {t.leaderboard}</h3>
        <div className="flex gap-1" role="tablist">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={d === difficulty}
              onClick={() => setDifficulty(d)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                d === difficulty
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {t[d]}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">{t.loading}</p>
      ) : state.error || state.entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{state.error ? t.saveError : t.leaderboardEmpty}</p>
      ) : (
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {state.entries.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-7 text-center font-semibold text-slate-500">{medal[i] ?? i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">
                {e.player_name}
                {e.student_grade ? <span className="ml-1 text-xs text-slate-500">({e.student_grade})</span> : null}
              </span>
              <span className="hidden text-xs text-slate-500 sm:inline">{formatClock(e.completion_time_ms)}{t.seconds}</span>
              <span className="tabular-nums font-semibold text-indigo-600 dark:text-indigo-300">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
      {state?.demo && <p className="mt-3 text-xs text-slate-500">{t.demoNote}</p>}
    </section>
  );
}
