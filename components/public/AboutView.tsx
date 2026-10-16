"use client";

import { AnimatePresence, m as motion } from "framer-motion";
import { useState } from "react";
import type { SiteSettingsData } from "@/lib/demo-data";
import { tr } from "@/lib/types";
import { AdmissionDialog } from "./AdmissionDialog";
import { TIMELINE, VALUES, WHY_US } from "./i18n";
import { FadeIn, Glass, Icon, PageHero, Section, SectionTitle, usePublic } from "./ui";

export function AboutView({ settings }: { settings: SiteSettingsData }) {
  const { locale, t } = usePublic();
  const [active, setActive] = useState(TIMELINE.length - 1);
  const item = TIMELINE[active];

  const blocks = [
    { k: "mission", icon: "rocket", text: settings.about_mission, label: t("mission") },
    { k: "vision", icon: "globe", text: settings.about_vision, label: t("vision") },
    { k: "history", icon: "book", text: settings.about_history, label: t("history") },
  ];

  return (
    <>
      <PageHero title={t("aboutTitle")} subtitle={t("aboutSub")} />
      <Section className="pt-4">
        <div className="grid gap-5 md:grid-cols-3">
          {blocks.map((b, i) => (
            <FadeIn key={b.k} delay={i * 0.1}>
              <Glass className="h-full">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg"><Icon name={b.icon} className="h-6 w-6" /></span>
                <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">{b.label}</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-300">{tr(b.text, locale)}</p>
              </Glass>
            </FadeIn>
          ))}
        </div>
      </Section>

      <Section>
        <SectionTitle title={t("timelineTitle")} />
        <div className="relative mb-8 overflow-x-auto pb-4">
          <div className="relative mx-auto flex min-w-[640px] items-start justify-between px-6">
            <div className="absolute left-6 right-6 top-5 h-1 rounded-full bg-slate-200 dark:bg-white/10" />
            <motion.div className="absolute left-6 top-5 h-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
              animate={{ width: `calc((100% - 3rem) * ${active / (TIMELINE.length - 1)})` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
            {TIMELINE.map((it, i) => (
              <button key={it.year} onClick={() => setActive(i)} className="group relative z-10 flex flex-col items-center gap-2" aria-pressed={i === active}>
                <motion.span whileHover={{ scale: 1.2 }} className={`grid h-11 w-11 place-items-center rounded-full border-4 text-[10px] font-bold transition-colors ${i <= active ? "border-indigo-500 bg-white text-indigo-700 dark:bg-slate-900 dark:text-indigo-300" : "border-slate-300 bg-white text-slate-400 dark:border-white/20 dark:bg-slate-900"} ${i === active ? "ring-4 ring-indigo-500/30" : ""}`}>
                  {i + 1}
                </motion.span>
                <span className={`text-sm font-bold ${i === active ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500"}`}>{it.year}</span>
              </button>
            ))}
          </div>
        </div>
        <Glass hover={false} className="mx-auto max-w-2xl text-center">
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="text-5xl font-black text-indigo-600 dark:text-indigo-300">{item.year}</div>
              <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{tr(item.title, locale)}</h3>
              <p className="mt-2 text-slate-600 dark:text-slate-300">{tr(item.text, locale)}</p>
            </motion.div>
          </AnimatePresence>
        </Glass>
      </Section>

      <Section>
        <SectionTitle title={t("valuesTitle")} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <Glass className="h-full text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"><Icon name={v.icon} className="h-7 w-7" /></span>
                <h3 className="mt-3 font-bold text-slate-900 dark:text-white">{tr(v.title, locale)}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(v.text, locale)}</p>
              </Glass>
            </FadeIn>
          ))}
        </div>
      </Section>

      <Section className="pb-24">
        <SectionTitle title={t("advantagesTitle")} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WHY_US.map((w, i) => (
            <FadeIn key={i} delay={(i % 3) * 0.08}>
              <Glass className="h-full">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white"><Icon name={w.icon} className="h-5 w-5" /></span>
                  <h3 className="font-bold text-slate-900 dark:text-white">{tr(w.title, locale)}</h3>
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{tr(w.text, locale)}</p>
              </Glass>
            </FadeIn>
          ))}
        </div>
        <div className="mt-10 flex justify-center"><AdmissionDialog type="admission" /></div>
      </Section>
    </>
  );
}
