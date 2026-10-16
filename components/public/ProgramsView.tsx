"use client";

import { AnimatePresence, m as motion } from "framer-motion";
import { useState } from "react";
import type { ProgramData } from "@/lib/demo-data";
import { tr } from "@/lib/types";
import { AdmissionDialog } from "./AdmissionDialog";
import { CLUBS } from "./i18n";
import { FadeIn, Glass, Icon, PageHero, Section, SectionTitle, usePublic } from "./ui";

const ORDER = ["primary", "middle", "high"] as const;

export function ProgramsView({ programs }: { programs: ProgramData[] }) {
  const { locale, t } = usePublic();
  const [tab, setTab] = useState<(typeof ORDER)[number]>("primary");
  const p = programs.find((x) => x.category === tab);

  return (
    <>
      <PageHero title={t("programsPageTitle")} subtitle={t("programsPageSub")} />
      <Section className="pt-2">
        <div role="tablist" className="relative mx-auto mb-8 grid max-w-2xl grid-cols-3 gap-1 rounded-full bg-slate-200/70 p-1.5 backdrop-blur dark:bg-white/10">
          {ORDER.map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`relative rounded-full px-3 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${tab === k ? "text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300"}`}>
              {tab === k && <motion.span layoutId="prog-tab" className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg dark:from-indigo-600" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className="relative">{t(k)}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {p && (
            <motion.div key={p.category} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }}>
              <div className="grid gap-5 lg:grid-cols-5">
                <Glass hover={false} className="lg:col-span-2">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg"><Icon name={p.icon_name} className="h-7 w-7" /></span>
                  <div className="mt-4 text-sm font-bold text-indigo-600 dark:text-indigo-300">{p.grade_range} {t("gradeWord")}</div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{tr(p.title, locale)}</h2>
                  <p className="mt-3 text-slate-600 dark:text-slate-300">{tr(p.full_content, locale)}</p>
                  <div className="mt-6"><AdmissionDialog type="admission" /></div>
                </Glass>
                <Glass hover={false} className="lg:col-span-3">
                  <h3 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">{t("subjects")}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {p.subjects.map((s, i) => (
                      <motion.div key={s.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.03 }}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 text-sm font-medium text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                        <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500" />{tr(s.name, locale)}
                      </motion.div>
                    ))}
                  </div>
                </Glass>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      <Section className="pb-24">
        <SectionTitle title={t("clubs")} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CLUBS.map((c, i) => (
            <FadeIn key={i} delay={(i % 3) * 0.08}>
              <Glass className="group h-full">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/15 text-indigo-600 transition group-hover:rotate-12 group-hover:bg-indigo-600 group-hover:text-white dark:text-indigo-300"><Icon name={c.icon} className="h-6 w-6" /></span>
                <h3 className="mt-4 font-bold text-slate-900 dark:text-white">{tr(c.name, locale)}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(c.text, locale)}</p>
              </Glass>
            </FadeIn>
          ))}
        </div>
      </Section>
    </>
  );
}
