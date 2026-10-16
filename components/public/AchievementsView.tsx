"use client";

import { AnimatePresence, m as motion } from "framer-motion";
import { Award, Download, GraduationCap, Medal, Palette, Trophy } from "lucide-react";
import { useState } from "react";
import type { AchievementData } from "@/lib/demo-data";
import { tr } from "@/lib/types";
import { Avatar, Counter, Glass, GradientText, PageHero, Section, usePublic } from "./ui";

const CATS = [
  ["all", "all"], ["olympiad", "catOlympiad"], ["sport", "catSport"], ["art", "catArt"], ["graduate", "catGraduate"],
] as const;

const CAT_STYLE = {
  olympiad: { Icon: Trophy, cls: "from-amber-400 to-orange-500" },
  sport: { Icon: Medal, cls: "from-emerald-400 to-teal-500" },
  art: { Icon: Palette, cls: "from-fuchsia-400 to-pink-500" },
  graduate: { Icon: GraduationCap, cls: "from-indigo-400 to-violet-500" },
} as const;

export function AchievementsView({ items }: { items: AchievementData[] }) {
  const { locale, t } = usePublic();
  const [cat, setCat] = useState<(typeof CATS)[number][0]>("all");
  const shown = cat === "all" ? items : items.filter((a) => a.category === cat);
  const count = (c: string) => items.filter((a) => a.category === c).length;

  return (
    <>
      <PageHero title={t("achTitle")} subtitle={t("achSub")}>
        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-4 gap-3">
          {(["olympiad", "sport", "art", "graduate"] as const).map((c) => (
            <div key={c} className="rounded-2xl bg-white/50 p-3 backdrop-blur dark:bg-white/5">
              <div className="text-2xl font-extrabold sm:text-3xl"><GradientText><Counter value={count(c)} /></GradientText></div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 sm:text-xs">{t(CATS.find((x) => x[0] === c)![1])}</div>
            </div>
          ))}
        </div>
      </PageHero>

      <Section className="pb-24 pt-2">
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {CATS.map(([k, lk]) => (
            <button key={k} onClick={() => setCat(k)} aria-pressed={cat === k}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${cat === k ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "bg-white/60 text-slate-700 hover:bg-white dark:bg-white/10 dark:text-slate-200"}`}>
              {t(lk)}
            </button>
          ))}
        </div>
        <motion.div layout className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {shown.map((a) => {
              const { Icon: CI, cls } = CAT_STYLE[a.category];
              const name = tr(a.student_name, locale);
              return (
                <motion.div layout key={a.id} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.3 }}>
                  <Glass className="h-full">
                    <div className="flex items-center gap-3">
                      <Avatar name={name} src={a.photo_url} size={56} />
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-bold text-slate-900 dark:text-white">{name}</h2>
                        <p className="text-xs text-slate-500">{a.category === "graduate" ? a.grade_or_grad_year : `${a.grade_or_grad_year} ${t("gradeShort")}`}</p>
                      </div>
                      <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${cls} text-white shadow`}><CI className="h-5 w-5" /></span>
                    </div>
                    <h4 className="mt-4 font-semibold text-slate-800 dark:text-slate-100">{tr(a.achievement_title, locale)}</h4>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(a.description, locale)}</p>
                    {a.university_accepted && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-indigo-500/10 p-3 text-sm">
                        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                        <span><span className="text-slate-500">{t("admittedTo")}</span> <b className="text-slate-800 dark:text-slate-100">{tr(a.university_accepted, locale)}</b></span>
                      </div>
                    )}
                    {a.certificate_url && (
                      <a href={a.certificate_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                        <Award className="h-4 w-4" />{t("certificates")} <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </Glass>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </Section>
    </>
  );
}
