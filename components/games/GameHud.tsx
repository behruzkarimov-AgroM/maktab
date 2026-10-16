"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { getMuted, getMutedServer, setMuted, subscribeSound, unlockAudio } from "@/lib/sound";
import { formatClock } from "./useGameClock";
import { useGameT } from "./i18n";

export function SoundToggle() {
  const { t } = useGameT();
  const muted = useSyncExternalStore(subscribeSound, getMuted, getMutedServer);
  return (
    <button
      type="button"
      onClick={() => {
        unlockAudio();
        setMuted(!muted);
      }}
      aria-pressed={!muted}
      aria-label={muted ? t.soundOff : t.soundOn}
      title={muted ? t.soundOff : t.soundOn}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}

interface HudProps {
  score: number;
  /** Remaining ms; omit or Infinity to hide. */
  timeLeftMs?: number;
  /** 0..1 */
  progress: number;
  extra?: ReactNode;
}

export function GameHud({ score, timeLeftMs, progress, extra }: HudProps) {
  const { t } = useGameT();
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const low = timeLeftMs !== undefined && Number.isFinite(timeLeftMs) && timeLeftMs < 10000;
  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <Stat label={t.score} value={String(score)} tone="indigo" />
        {timeLeftMs !== undefined && Number.isFinite(timeLeftMs) && (
          <Stat label={t.time} value={`${formatClock(timeLeftMs)}`} tone={low ? "red" : "slate"} pulse={low} />
        )}
        {extra}
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="progressbar"
        aria-label={t.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "slate",
  pulse = false,
}: {
  label: string;
  value: string;
  tone?: "indigo" | "slate" | "red" | "amber" | "emerald";
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${tones[tone]} ${pulse ? "animate-pulse" : ""}`}>
      <span className="text-xs opacity-70">{label}</span>
      <span className="tabular-nums font-semibold">{value}</span>
    </span>
  );
}
