"use client";

import { useEffect, useState } from "react";
import { Loader2, Medal } from "lucide-react";
import { tr, type Locale } from "@/lib/types";
import type { OlympiadStrings } from "./i18n";
import type { LeaderGroup, Olympiad } from "./types";

export function Leaderboard({ olympiads, locale, t }: { olympiads: Olympiad[]; locale: Locale; t: OlympiadStrings }) {
  const published = olympiads.filter((o) => o.isResultsPublished);
  const [id, setId] = useState(published[0]?.id ?? "");
  const [groups, setGroups] = useState<LeaderGroup[] | null>(null);
  const [error, setError] = useState(false);
  const [loadedFor, setLoadedFor] = useState("");

  useEffect(() => {
    if (!id) return;
    let off = false;
    fetch(`/api/olympiad/leaderboard?olympiad=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        if (off) return;
        setGroups(j.groups as LeaderGroup[]);
        setError(false);
        setLoadedFor(id);
      })
      .catch(() => {
        if (!off) {
          setError(true);
          setLoadedFor(id);
        }
      });
    return () => {
      off = true;
    };
  }, [id]);

  if (published.length === 0) return <p className="text-slate-500 dark:text-slate-400">{t.boardEmpty}</p>;
  const loading = loadedFor !== id;
  const subjName = (key: string) =>
    tr(olympiads.find((o) => o.id === id)?.subjects.find((s) => s.key === key)?.name, locale) || key;
  const medal = ["text-amber-500", "text-slate-400", "text-orange-600"];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t.boardTitle}</h2>
        {published.length > 1 && (
          <select
            aria-label={t.selectOlympiad}
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/60 dark:text-white"
          >
            {published.map((o) => (
              <option key={o.id} value={o.id}>
                {tr(o.title, locale)}
              </option>
            ))}
          </select>
        )}
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t.loading}
        </p>
      ) : error ? (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {t.loadError}
        </p>
      ) : !groups || groups.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">{t.boardEmpty}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {groups.map((g) => (
            <section key={g.subjectKey} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <h3 className="mb-3 font-bold text-indigo-700 dark:text-indigo-300">{subjName(g.subjectKey)}</h3>
              <ol className="space-y-2">
                {g.rows.map((r) => (
                  <li key={`${r.rank}-${r.name}`} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                    <span className="flex w-8 justify-center font-bold text-slate-700 dark:text-slate-200">
                      {r.rank <= 3 ? <Medal className={`h-5 w-5 ${medal[r.rank - 1]}`} aria-label={`#${r.rank}`} /> : `#${r.rank}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-white">{r.name}</span>
                    <span className="tabular-nums text-sm text-slate-600 dark:text-slate-300">
                      {r.score}/{r.maxScore}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
