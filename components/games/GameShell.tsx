"use client";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { Difficulty } from "@/lib/types";
import { tr } from "@/lib/types";
import { playSound, unlockAudio } from "@/lib/sound";
import { DIFFICULTIES, type GameMeta, type GameProps, type GameResult } from "./types";
import { useGameT } from "./i18n";
import { Leaderboard } from "./Leaderboard";
import { SaveScoreForm } from "./SaveScoreForm";
import { SoundToggle, Stat } from "./GameHud";
import { formatClock } from "./useGameClock";

interface Props {
  meta: GameMeta;
  Game: ComponentType<GameProps>;
  onBack: () => void;
}

type Phase = { name: "select" } | { name: "playing"; run: number } | { name: "result"; result: GameResult };

export async function celebrate() {
  const confetti = (await import("canvas-confetti")).default;
  const base = { origin: { y: 0.65 }, disableForReducedMotion: true };
  confetti({ ...base, particleCount: 90, spread: 80 });
  confetti({ ...base, particleCount: 40, spread: 100, shapes: ["star"], scalar: 1.3, colors: ["#f4b942", "#f6c85f", "#457b9d", "#1d3557"] });
}

export function GameShell({ meta, Game, onBack }: Props) {
  const { t, locale } = useGameT();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [phase, setPhase] = useState<Phase>({ name: "select" });
  const [lbKey, setLbKey] = useState(0);
  const runRef = useRef(0);
  // server-signed run token, tagged with its run so a late answer for an earlier run is ignored
  const [session, setSession] = useState({ run: 0, token: "" });

  const finish = useCallback((result: GameResult) => {
    setPhase({ name: "result", result });
    playSound(result.completed ? "win" : "lose");
    if (result.completed && result.score > 0) void celebrate();
  }, []);

  // top of page on phase change (small screens)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [phase.name]);

  function start() {
    unlockAudio();
    playSound("start");
    const run = (runRef.current += 1);
    // server-signed run token (needed to save a score); best effort, the form shows an error without it
    setSession({ run, token: "" });
    fetch("/api/games/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: meta.slug, difficulty }),
    })
      .then((r) => r.json())
      .then((j: { token?: string }) => setSession((s) => (s.run === run ? { run, token: j.token ?? "" } : s)))
      .catch(() => {});
    setPhase({ name: "playing", run });
  }

  const cfg = meta.config[difficulty];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
        >
          в†ђ {t.back}
        </button>
        <SoundToggle />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {meta.icon}
          </span>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">{tr(meta.title, locale)}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{tr(meta.description, locale)}</p>
          </div>
        </div>

        {phase.name === "select" && (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <p className="mb-1 font-semibold">{t.howTo}</p>
              <p>{tr(meta.howTo, locale)}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t.skill}: {tr(meta.skill, locale)}
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{t.difficulty}</p>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    aria-pressed={d === difficulty}
                    className={`rounded-xl border-2 px-2 py-3 text-center transition ${
                      d === difficulty
                        ? "border-indigo-600 bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-100"
                        : "border-slate-200 text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <span className="block font-semibold">{t[d]}</span>
                    <span className="text-xs opacity-70">x{meta.config[d].multiplier}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={start}
              className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 px-6 py-3 text-lg font-semibold text-white shadow transition hover:brightness-110 active:scale-[0.98]"
            >
              в–¶ {t.start}
            </button>
          </div>
        )}

        {phase.name === "playing" && <Game key={phase.run} config={cfg} difficulty={difficulty} onFinish={finish} />}

        {phase.name === "result" && (
          <ResultPanel
            result={phase.result}
            onAgain={start}
            onChange={() => setPhase({ name: "select" })}
            save={
              phase.result.score > 0 ? (
                <SaveScoreForm slug={meta.slug} difficulty={difficulty} result={phase.result} session={session.token} onSaved={() => setLbKey((k) => k + 1)} />
              ) : null
            }
          />
        )}
      </div>

      <div className="mt-6">
        <Leaderboard slug={meta.slug} initialDifficulty={difficulty} refreshKey={lbKey} />
      </div>
    </div>
  );
}

export function ResultPanel({
  result,
  onAgain,
  onChange,
  save,
}: {
  result: GameResult;
  onAgain: () => void;
  onChange: () => void;
  save: ReactNode;
}) {
  const { t } = useGameT();
  return (
    <div className="space-y-5 text-center">
      <div>
        <p className="text-5xl" aria-hidden>
          {result.completed ? "рџЏ†" : "вЏ±пёЏ"}
        </p>
        <h3 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{result.completed ? t.win : t.gameOver}</h3>
      </div>
      <div className="flex flex-wrap justify-center gap-2 text-base">
        <Stat label={t.score} value={String(Math.round(result.score))} tone="indigo" />
        <Stat label={t.time} value={`${formatClock(result.timeMs)}${t.seconds}`} />
        <Stat label={t.accuracy} value={`${Math.round(result.accuracy)}%`} tone="emerald" />
      </div>
      <div className="text-left">{save}</div>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onAgain} className="rounded-full bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-700">
          в†» {t.playAgain}
        </button>
        <button
          type="button"
          onClick={onChange}
          className="rounded-full border border-slate-300 px-6 py-2.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {t.changeLevel}
        </button>
      </div>
    </div>
  );
}
