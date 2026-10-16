"use client";
import { useState, type FormEvent } from "react";
import type { Difficulty } from "@/lib/types";
import type { GameResult, GameSlug } from "./types";
import { useGameT } from "./i18n";

interface Props {
  slug: GameSlug;
  difficulty: Difficulty;
  result: GameResult;
  /** Signed run token from /api/games/session. */
  session: string;
  onSaved: () => void;
}

const NAME_KEY = "maktab.games.player";

function readName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function SaveScoreForm({ slug, difficulty, result, session, onSaved }: Props) {
  const { t } = useGameT();
  const [name, setName] = useState(readName);
  const [grade, setGrade] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error" | "limited">("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (status === "saving" || status === "saved") return;
    setStatus("saving");
    try {
      const res = await fetch("/api/games/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: slug,
          difficulty,
          player_name: name.trim(),
          student_grade: grade ? Number(grade) : null,
          score: Math.round(result.score),
          completion_time_ms: Math.max(300, Math.round(result.timeMs)),
          accuracy_percent: Math.round(result.accuracy * 100) / 100,
          session,
        }),
      });
      if (res.status === 429) {
        setStatus("limited");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      try {
        window.localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        /* ignore */
      }
      setStatus("saved");
      onSaved();
    } catch {
      setStatus("error");
    }
  }

  if (status === "saved") {
    return <p className="rounded-xl bg-emerald-50 px-4 py-3 text-center font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">✅ {t.saved}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <p className="font-medium text-slate-900 dark:text-slate-100">{t.saveScore}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">{t.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={30}
            placeholder={t.namePlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">{t.grade}</span>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">{t.gradeNone}</option>
            {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={status === "saving" || name.trim().length < 2}
        className="rounded-full bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {status === "saving" ? t.saving : t.save}
      </button>
      {status === "error" && <p className="text-sm text-red-600">{t.saveError}</p>}
      {status === "limited" && <p className="text-sm text-red-600">{t.rateLimited}</p>}
    </form>
  );
}
