"use client";

import { AnimatePresence, m as motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, MapPin, Pause, Play, Quote } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import type { OlympiadTeaserData, ProgramData, SiteSettingsData } from "@/lib/demo-data";
import { tr } from "@/lib/types";
import { AdmissionDialog } from "@/components/public/AdmissionDialog";
import { TESTIMONIALS, WHY_US } from "@/components/public/i18n";
import {
  Counter, FadeIn, Glass, GradientText, Icon, Section, SectionTitle, usePublic,
} from "@/components/public/ui";

export function StatsBar({ stats }: { stats: SiteSettingsData["stats"] }) {
  const { locale } = usePublic();
  return (
    <Section className="-mt-16 relative z-10 py-0">
      <Glass hover={false} className="grid grid-cols-2 gap-6 p-6 sm:p-8 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="text-center">
            <div className="text-4xl font-extrabold sm:text-5xl"><GradientText><Counter value={s.value} suffix={s.suffix} /></GradientText></div>
            <div className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">{tr(s.label, locale)}</div>
          </div>
        ))}
      </Glass>
    </Section>
  );
}

const GRADS = [
  "from-emerald-400/30 to-teal-500/10",
  "from-indigo-400/30 to-violet-500/10",
  "from-fuchsia-400/30 to-amber-300/10",
];

export function ProgramsBento({ programs }: { programs: ProgramData[] }) {
  const { locale, t, href } = usePublic();
  return (
    <Section>
      <SectionTitle title={t("programsTitle")} sub={t("programsSub")} />
      <div className="grid gap-5 md:grid-cols-6 md:grid-rows-2">
        {programs.slice(0, 3).map((p, i) => (
          <FadeIn key={p.id} delay={i * 0.1} className={i === 0 ? "md:col-span-3 md:row-span-2" : "md:col-span-3"}>
            <Link href={href("/programs")} className="group block h-full">
              <Glass className={`flex h-full min-h-56 flex-col bg-gradient-to-br ${GRADS[i % 3]}`}>
                <div className="flex items-start justify-between">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/80 text-indigo-600 shadow transition group-hover:rotate-6 group-hover:scale-110 dark:bg-white/10 dark:text-indigo-300">
                    <Icon name={p.icon_name} className="h-7 w-7" />
                  </span>
                  <span className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold text-slate-800 dark:bg-white/10 dark:text-white">{p.grade_range} {t("gradeWord")}</span>
                </div>
                <h3 className="mt-5 text-2xl font-bold text-slate-900 dark:text-white">{tr(p.title, locale)}</h3>
                <p className="mt-2 text-slate-700 dark:text-slate-300">{tr(p.short_description, locale)}</p>
                {i === 0 && <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{tr(p.full_content, locale)}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  {p.subjects.slice(0, i === 0 ? 6 : 3).map((s) => (
                    <span key={s.key} className="rounded-full border border-slate-300/60 bg-white/50 px-3 py-1 text-xs dark:border-white/15 dark:bg-white/5">{tr(s.name, locale)}</span>
                  ))}
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                  {t("learnMore")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Glass>
            </Link>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

function useCountdown(target: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const diff = Math.max(0, new Date(target).getTime() - now);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor(diff / 3600000) % 24,
    m: Math.floor(diff / 60000) % 60,
    s: Math.floor(diff / 1000) % 60,
  };
}

export function OlympiadTeaser({ olympiad }: { olympiad: OlympiadTeaserData }) {
  const { locale, t, href } = usePublic();
  const cd = useCountdown(olympiad.event_date);
  const cells: [number | string, string][] = [
    [cd?.d ?? "--", t("days")], [cd?.h ?? "--", t("hours")], [cd?.m ?? "--", t("minutes")], [cd?.s ?? "--", t("seconds")],
  ];
  return (
    <Section>
      <FadeIn>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-800 via-indigo-600 to-violet-600 p-8 text-white shadow-2xl shadow-indigo-500/30 sm:p-12">
          <motion.div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity }} />
          <div className="relative grid items-center gap-8 lg:grid-cols-2">
            <div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider">{t("olyBadge")}</span>
              <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">{tr(olympiad.title, locale)}</h2>
              <p className="mt-3 max-w-md text-white/85">{tr(olympiad.description, locale)}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/90">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDate(locale, olympiad.event_date)}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{tr(olympiad.location, locale)}</span>
              </div>
              <Link href={href("/olympiads")} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-indigo-700 shadow-lg transition hover:scale-105 active:scale-95">
                {t("olyJoin")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {cells.map(([v, l]) => (
                <div key={l} className="rounded-2xl bg-white/15 p-3 text-center backdrop-blur sm:p-5">
                  <div className="text-3xl font-black tabular-nums sm:text-5xl">{typeof v === "number" ? String(v).padStart(2, "0") : v}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-white/80 sm:text-xs">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </FadeIn>
    </Section>
  );
}

export function WhyUs() {
  const { locale, t } = usePublic();
  return (
    <Section>
      <SectionTitle title={t("whyTitle")} sub={t("whySub")} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {WHY_US.map((w, i) => (
          <FadeIn key={i} delay={(i % 3) * 0.08}>
            <Glass className="h-full">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
                <Icon name={w.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{tr(w.title, locale)}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(w.text, locale)}</p>
            </Glass>
          </FadeIn>
        ))}
      </div>
    </Section>
  );
}

export function Testimonials() {
  const { locale, t } = usePublic();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const reduce = useReducedMotion();
  // WCAG 2.2.2: auto-rotation can be paused, stops on hover/focus and never runs for reduced-motion users
  const running = !paused && !hover && !reduce;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setI((v) => (v + 1) % TESTIMONIALS.length), 6000);
    return () => clearInterval(id);
  }, [running]);
  const item = TESTIMONIALS[i];
  return (
    <Section>
      <SectionTitle title={t("testimonialsTitle")} />
      <Glass hover={false} className="mx-auto max-w-3xl p-8 text-center sm:p-12" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
        <Quote className="mx-auto h-10 w-10 text-indigo-500/60" />
        <div className="min-h-40" aria-live={running ? "off" : "polite"}>
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              <p className="mt-4 text-lg text-slate-800 dark:text-slate-100 sm:text-xl">&ldquo;{tr(item.text, locale)}&rdquo;</p>
              <p className="mt-5 font-bold text-slate-900 dark:text-white">{tr(item.name, locale)}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{tr(item.role, locale)}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1">
          {TESTIMONIALS.map((_, k) => (
            <button key={k} type="button" aria-label={`${k + 1} / ${TESTIMONIALS.length}`} aria-current={k === i ? "true" : undefined} onClick={() => setI(k)} className="grid h-8 min-w-6 place-items-center">
              <span className={`block h-2.5 rounded-full transition-all ${k === i ? "w-8 bg-indigo-600" : "w-2.5 bg-slate-400 dark:bg-white/30"}`} />
            </button>
          ))}
          {!reduce && (
            <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? t("play") : t("pause")} className="ml-2 grid size-8 place-items-center rounded-full text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-white/10">
              {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
            </button>
          )}
        </div>
      </Glass>
    </Section>
  );
}

export function CtaBanner() {
  const { t } = usePublic();
  return (
    <Section className="pb-24">
      <FadeIn>
        <Glass hover={false} className="bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 p-10 text-center">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white sm:text-4xl">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600 dark:text-slate-300">{t("ctaSub")}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AdmissionDialog type="admission" />
            <AdmissionDialog type="callback" ghost />
          </div>
        </Glass>
      </FadeIn>
    </Section>
  );
}
