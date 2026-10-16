"use client";
import Link from "next/link";
import { useState } from "react";
import { tr } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { SURVEY_AUDIENCES, type PublicSurvey, type SurveyAudience } from "@/lib/surveys/types";
import { Mascot } from "@/components/psych/Mascot";
import { useSurveyT } from "./i18n";

const AUD_EMOJI: Record<SurveyAudience, string> = { all: "🌍", parents: "👨‍👩‍👧", students: "🎒", teachers: "🍎" };

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

export function SurveyList({ surveys }: { surveys: PublicSurvey[] }) {
  const { t, locale } = useSurveyT();
  const [aud, setAud] = useState<SurveyAudience | "all-filter">("all-filter");
  const present = SURVEY_AUDIENCES.filter((a) => surveys.some((s) => s.audience === a));
  const filtered = surveys.filter((s) => aud === "all-filter" || s.audience === aud);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-center gap-4">
        <div className="hidden sm:block">
          <Mascot size={110} />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 sm:text-4xl">📝 {t.title}</h1>
          <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">{t.subtitle}</p>
        </div>
      </header>

      {present.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Chip active={aud === "all-filter"} onClick={() => setAud("all-filter")}>
            {t.all}
          </Chip>
          {present.map((a) => (
            <Chip key={a} active={aud === a} onClick={() => setAud(a)}>
              {AUD_EMOJI[a]} {t.audience[a]}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-slate-500">{t.empty}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link
                href={`/${locale}/surveys/${s.id}`}
                className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                    {AUD_EMOJI[s.audience]} {t.audience[s.audience]}
                  </span>
                  {s.is_anonymous && (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">🔒 {t.anonymous}</span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{tr(s.title, locale)}</h2>
                <p className="mt-1 flex-1 text-sm text-slate-600 dark:text-slate-300">{tr(s.description, locale)}</p>
                {s.ends_at && (
                  <p className="mt-3 text-xs text-slate-500">
                    {t.ends}: {formatDate(locale, new Date(s.ends_at))}
                  </p>
                )}
                <p className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">
                    {s.question_count} {t.questionsCount}
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
