"use client";
import Link from "next/link";
import { useState } from "react";
import { tr } from "@/lib/types";
import { AUDIENCES, TOPICS, type Audience, type PublicTest, type Topic } from "./types";
import { usePsychT } from "./i18n";
import { Mascot } from "./Mascot";

const AUD_EMOJI: Record<Audience, string> = { kids: "🧸", teens: "🎧", older: "🎓", parents: "👨‍👩‍👧" };

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export function PsychList({ tests }: { tests: PublicTest[] }) {
  const { t, locale } = usePsychT();
  const [aud, setAud] = useState<Audience | "all">("all");
  const [topic, setTopic] = useState<Topic | "all">("all");

  const topicsPresent = TOPICS.filter((x) => tests.some((tt) => tt.topic === x));
  const filtered = tests.filter((tt) => (aud === "all" || tt.audience === aud) && (topic === "all" || tt.topic === topic));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-center gap-4">
        <div className="hidden sm:block">
          <Mascot size={110} />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 sm:text-4xl">💜 {t.title}</h1>
          <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">{t.subtitle}</p>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        <Chip active={aud === "all"} onClick={() => setAud("all")}>
          {t.all}
        </Chip>
        {AUDIENCES.map((a) => (
          <Chip key={a} active={aud === a} onClick={() => setAud(a)}>
            {AUD_EMOJI[a]} {t.audience[a]}
          </Chip>
        ))}
      </div>
      {topicsPresent.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Chip active={topic === "all"} onClick={() => setTopic("all")}>
            {t.all}
          </Chip>
          {topicsPresent.map((x) => (
            <Chip key={x} active={topic === x} onClick={() => setTopic(x)}>
              {t.topic[x]}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-slate-500">{t.empty}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((tt) => (
            <li key={tt.id}>
              <Link
                href={`/${locale}/psychology/${tt.id}`}
                className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                    {AUD_EMOJI[tt.audience]} {t.audience[tt.audience]}
                  </span>
                  {tt.topic && (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                      {t.topic[tt.topic]}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{tr(tt.title, locale)}</h2>
                <p className="mt-1 flex-1 text-sm text-slate-600 dark:text-slate-300">{tr(tt.description, locale)}</p>
                <p className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">
                    {tt.questions.length} {t.questionsCount}
                  </span>
                  <span className="font-semibold text-indigo-600 group-hover:translate-x-1 dark:text-indigo-300">{t.begin} →</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
