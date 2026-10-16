"use client";

import { useEffect, useState } from "react";
import type { OlympiadStrings } from "./i18n";

export function Countdown({ target, t }: { target: string; t: OlympiadStrings }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const diff = now === null ? null : new Date(target).getTime() - now;
  if (diff !== null && diff <= 0) {
    return <p className="text-lg font-semibold text-white">{t.started}</p>;
  }
  const s = diff === null ? 0 : Math.floor(diff / 1000);
  const parts: [number, string][] = [
    [Math.floor(s / 86400), t.days],
    [Math.floor((s % 86400) / 3600), t.hours],
    [Math.floor((s % 3600) / 60), t.minutes],
    [s % 60, t.seconds],
  ];
  return (
    <div className="flex gap-3 sm:gap-4" role="timer" aria-live="off">
      {parts.map(([v, label]) => (
        <div
          key={label}
          className="flex min-w-16 flex-col items-center rounded-2xl border border-white/25 bg-white/15 px-3 py-3 backdrop-blur-md sm:min-w-20"
        >
          <span className="text-3xl font-bold tabular-nums text-white sm:text-4xl">
            {diff === null ? "--" : String(v).padStart(2, "0")}
          </span>
          <span className="text-xs uppercase tracking-wide text-white/80">{label}</span>
        </div>
      ))}
    </div>
  );
}
