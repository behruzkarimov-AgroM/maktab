"use client";
import { useEffect, useState, type ComponentType } from "react";
import { tr } from "@/lib/types";
import { isGameSlug } from "./defaults";
import type { GameMeta, GameProps, GameSlug } from "./types";
import { GameShell } from "./GameShell";
import { SchulteTable } from "./SchulteTable";
import { MemoryMatrix } from "./MemoryMatrix";
import { MentalMath } from "./MentalMath";
import { StroopTest } from "./StroopTest";
import { LogicSequence } from "./LogicSequence";
import { ContentGameShell } from "./ContentGameShell";
import { MatchingPairs } from "./MatchingPairs";
import { TrueFalse } from "./TrueFalse";
import { QuizRace } from "./QuizRace";
import type { ContentGameExtra } from "./content-types";
import { useGameT } from "./i18n";
import { SoundToggle } from "./GameHud";

const CARD_TINTS = ["bg-tint-blue", "bg-tint-cream", "bg-tint-gold", "bg-tint-mint"];

const COMPONENTS: Partial<Record<GameSlug, ComponentType<GameProps>>> = {
  "schulte-table": SchulteTable,
  "memory-matrix": MemoryMatrix,
  "mental-math": MentalMath,
  "stroop-test": StroopTest,
  "logic-seq": LogicSequence,
};

/** Content-driven games: played from staff-authored sets (admin: Game content), see ContentGameShell. */
const CONTENT_COMPONENTS: Partial<Record<GameSlug, ComponentType<GameProps & ContentGameExtra>>> = {
  "matching-pairs": MatchingPairs,
  "true-false": TrueFalse,
  "quiz-race": QuizRace,
};

export function GamesHub({ games }: { games: GameMeta[] }) {
  const { t, locale } = useGameT();
  const [active, setActive] = useState<GameSlug | null>(null);

  // deep link: /games#mental-math
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "");
      setActive(isGameSlug(h) && games.some((g) => g.slug === h) ? h : null);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [games]);

  function open(slug: GameSlug | null) {
    setActive(slug);
    const url = slug ? `#${slug}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
  }

  const meta = active ? games.find((g) => g.slug === active) : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      {meta && CONTENT_COMPONENTS[meta.slug] ? (
        <ContentGameShell key={meta.slug} meta={meta} Game={CONTENT_COMPONENTS[meta.slug]!} onBack={() => open(null)} />
      ) : meta && COMPONENTS[meta.slug] ? (
        <GameShell key={meta.slug} meta={meta} Game={COMPONENTS[meta.slug]!} onBack={() => open(null)} />
      ) : (
        <>
          <header className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 sm:text-4xl">🧠 {t.pageTitle}</h1>
              <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">{t.pageSubtitle}</p>
            </div>
            <SoundToggle />
          </header>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g, i) => (
              <li key={g.slug}>
                <button
                  type="button"
                  onClick={() => open(g.slug)}
                  className={`group h-full w-full rounded-3xl border border-slate-200 p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 ${CARD_TINTS[i % CARD_TINTS.length]}`}
                >
                  <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 text-3xl transition group-hover:scale-110 dark:bg-white/10" aria-hidden>
                    {g.icon}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{tr(g.title, locale)}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(g.description, locale)}</p>
                  <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">{tr(g.skill, locale)}</p>
                  <span className="mt-4 inline-block rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white">▶ {t.play}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
