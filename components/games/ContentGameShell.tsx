"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { Difficulty } from "@/lib/types";
import { tr } from "@/lib/types";
import { playSound, unlockAudio } from "@/lib/sound";
import { CONTENT_SLUG_TYPE } from "./content-types";
import { filterSets } from "./content-logic";
import type { ContentGameExtra, ContentSetSummary } from "./content-types";
import { celebrate, ResultPanel } from "./GameShell";
import { SoundToggle } from "./GameHud";
import { useGameT } from "./i18n";
import { Leaderboard } from "./Leaderboard";
import { SaveScoreForm } from "./SaveScoreForm";
import { DIFFICULTIES, type GameMeta, type GameProps, type GameResult } from "./types";

interface Props {
  meta: GameMeta;
  Game: ComponentType<GameProps & ContentGameExtra>;
  onBack: () => void;
}

type Phase = { name: "select" } | { name: "playing"; run: number; set: ContentSetSummary } | { name: "result"; result: GameResult };

const selectCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

/** Shell for the content-driven games: set picker (subject / grade / level filters) -> play -> result + leaderboard. */
export function ContentGameShell({ meta, Game, onBack }: Props) {
  const { t, locale } = useGameT();
  const type = CONTENT_SLUG_TYPE[meta.slug];
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [phase, setPhase] = useState<Phase>({ name: "select" });
  const [lbKey, setLbKey] = useState(0);
  const [sets, setSets] = useState<ContentSetSummary[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [reload, setReload] = useState(0);
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [level, setLevel] = useState("");
  const [picked, setPicked] = useState("");
  const runRef = useRef(0);
  // server-signed run token, tagged with its run so a late answer for an earlier run is ignored
  const [session, setSession] = useState({ run: 0, token: "" });
  const [played, setPlayed] = useState<ContentSetSummary | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/games/content/sets?type=${type}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { sets?: ContentSetSummary[] }) => setSets(j.sets ?? []))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setLoadErr(true);
      });
    return () => ctrl.abort();
  }, [type, reload]);

  const subjects = useMemo(() => [...new Set((sets ?? []).map((s) => s.subject_key))], [sets]);
  const filtered = useMemo(
    () => filterSets(sets ?? [], { subject: subject || undefined, grade: grade ? Number(grade) : null, difficulty: (level || undefined) as Difficulty | undefined }),
    [sets, subject, grade, level],
  );
  const current = filtered.find((s) => s.id === picked) ?? filtered[0];

  const finish = useCallback((result: GameResult) => {
    setPhase({ name: "result", result });
    playSound(result.completed ? "win" : "lose");
    if (result.completed && result.score > 0) void celebrate();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [phase.name]);

  function start(set: ContentSetSummary) {
    unlockAudio();
    playSound("start");
    const run = (runRef.current += 1);
    setPlayed(set);
    setSession({ run, token: "" });
    fetch("/api/games/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: meta.slug, difficulty }),
    })
      .then((r) => r.json())
      .then((j: { token?: string }) => setSession((s) => (s.run === run ? { run, token: j.token ?? "" } : s)))
      .catch(() => {});
    setPhase({ name: "playing", run, set });
  }

  const cfg = meta.config[difficulty];
  const subjectLabel = (k: string) => (t.subjects as Record<string, string>)[k] ?? k;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="rounded-full px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800">
          ← {t.back}
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

            <section aria-labelledby="set-picker">
              <h3 id="set-picker" className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                {t.chooseSet}
              </h3>
              {sets === null && !loadErr && <p className="py-4 text-center text-sm text-slate-500">{t.loading}</p>}
              {loadErr && (
                <div className="py-4 text-center text-sm text-red-600">
                  <p>{t.setsError}</p>
                  <button type="button" onClick={() => {
                      setSets(null);
                      setLoadErr(false);
                      setReload((r) => r + 1);
                    }}
                    className="mt-2 rounded-full border border-slate-300 px-4 py-1.5 text-slate-700 dark:border-slate-600 dark:text-slate-200">
                    {t.retry}
                  </button>
                </div>
              )}
              {sets !== null && (
                <>
                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="block text-xs text-slate-500">
                      <span className="mb-1 block">{t.subject}</span>
                      <select value={subject} onChange={(e) => setSubject(e.target.value)} className={selectCls}>
                        <option value="">{t.allSubjects}</option>
                        {subjects.map((s) => (
                          <option key={s} value={s}>
                            {subjectLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-500">
                      <span className="mb-1 block">{t.grade}</span>
                      <select value={grade} onChange={(e) => setGrade(e.target.value)} className={selectCls}>
                        <option value="">{t.allGrades}</option>
                        {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-500">
                      <span className="mb-1 block">{t.setLevel}</span>
                      <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
                        <option value="">{t.allLevels}</option>
                        {DIFFICULTIES.map((d) => (
                          <option key={d} value={d}>
                            {t[d]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 py-6 text-center text-sm text-slate-500 dark:bg-slate-800">{t.noSets}</p>
                  ) : (
                    <ul className="grid gap-2" role="list" aria-label={t.chooseSet}>
                      {filtered.map((s) => {
                        const on = current?.id === s.id;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => setPicked(s.id)}
                              aria-pressed={on}
                              data-testid="content-set"
                              className={`w-full rounded-xl border-2 px-4 py-3 text-left transition ${
                                on
                                  ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950"
                                  : "border-slate-200 hover:border-indigo-300 dark:border-slate-700"
                              }`}
                            >
                              <span className="block font-semibold text-slate-900 dark:text-slate-50">{tr(s.title, locale)}</span>
                              {tr(s.description, locale) && <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">{tr(s.description, locale)}</span>}
                              <span className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{subjectLabel(s.subject_key)}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {s.grade ? `${t.grade} ${s.grade}` : t.anyGrade}
                                </span>
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">{t[s.difficulty]}</span>
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{t.itemsN.replace("{n}", String(s.item_count))}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </section>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{t.gameLevel}</p>
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
              disabled={!current}
              onClick={() => current && start(current)}
              className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 px-6 py-3 text-lg font-semibold text-white shadow transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              ▶ {t.start}
            </button>
          </div>
        )}

        {phase.name === "playing" && <Game key={phase.run} config={cfg} difficulty={difficulty} onFinish={finish} set={phase.set} />}

        {phase.name === "result" && (
          <ResultPanel
            result={phase.result}
            onAgain={() => played && start(played)}
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
