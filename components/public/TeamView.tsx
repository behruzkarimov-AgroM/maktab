"use client";

import { m as motion } from "framer-motion";
import { BadgeCheck, PlayCircle, X } from "lucide-react";
import { useMemo, useState } from "react";
import { SUBJECT_LABELS, type StaffData } from "@/lib/demo-data";
import { tr } from "@/lib/types";
import { Avatar, FadeIn, Glass, Modal, PageHero, Section, SectionTitle, usePublic } from "./ui";

export function TeamView({ staff }: { staff: StaffData[] }) {
  const { locale, t } = usePublic();
  const [filter, setFilter] = useState("all");
  const [video, setVideo] = useState<StaffData | null>(null);

  const admin = staff.filter((s) => s.is_administration);
  const teachers = staff.filter((s) => !s.is_administration);
  const subjects = useMemo(() => [...new Set(teachers.map((s) => s.subject_key).filter(Boolean) as string[])], [teachers]);
  const shown = filter === "all" ? teachers : teachers.filter((s) => s.subject_key === filter);
  const subjLabel = (k: string) => tr(SUBJECT_LABELS[k], locale) || k;

  return (
    <>
      <PageHero title={t("teamTitle")} subtitle={t("teamSub")} />
      <Section className="pt-2">
        <SectionTitle title={t("administration")} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {admin.map((s, i) => (
            <FadeIn key={s.id} delay={i * 0.08}>
              <Glass className="flex h-full items-start gap-4">
                <Avatar name={tr(s.full_name, locale)} src={s.photo_url} size={84} />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{tr(s.full_name, locale)}</h3>
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">{tr(s.position, locale)}</p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{tr(s.bio, locale)}</p>
                  <p className="mt-1 text-xs text-slate-500">{s.experience_years} {t("years")}</p>
                </div>
              </Glass>
            </FadeIn>
          ))}
        </div>
      </Section>

      <Section className="pb-24">
        <SectionTitle title={t("teachers")} />
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {["all", ...subjects].map((k) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${filter === k ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "bg-white/60 text-slate-700 hover:bg-white dark:bg-white/10 dark:text-slate-200"}`}>
              {k === "all" ? t("all") : subjLabel(k)}
            </button>
          ))}
        </div>
        <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <motion.div layout key={s.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <Glass className="h-full">
                <div className="flex items-center gap-4">
                  <Avatar name={tr(s.full_name, locale)} src={s.photo_url} size={72} />
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900 dark:text-white">{tr(s.full_name, locale)}</h3>
                    <p className="text-sm text-indigo-600 dark:text-indigo-300">{tr(s.position, locale)}</p>
                    <p className="text-xs text-slate-500">{s.experience_years} {t("years")}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{tr(s.bio, locale)}</p>
                {s.certificates.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t("certificates")}>
                    {s.certificates.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" />{c}</span>
                    ))}
                  </div>
                )}
                {s.intro_video_url && (
                  <button onClick={() => setVideo(s)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 transition hover:gap-3 dark:text-indigo-300">
                    <PlayCircle className="h-5 w-5" />{t("watchIntro")}
                  </button>
                )}
              </Glass>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      <Modal open={!!video} onClose={() => setVideo(null)} label={t("watchIntro")} wide>
        {video && (
          <div>
            <button aria-label={t("close")} onClick={() => setVideo(null)} className="absolute right-3 top-3 rounded-full p-1.5 text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
            <h3 className="mb-3 pr-8 font-bold text-slate-900 dark:text-white">{tr(video.full_name, locale)}</h3>
            <div className="aspect-video overflow-hidden rounded-2xl bg-black">
              {/\.(mp4|webm)(\?|$)/i.test(video.intro_video_url ?? "") ? (
                <video src={video.intro_video_url!} controls autoPlay className="h-full w-full" />
              ) : (
                <iframe src={video.intro_video_url!} title={tr(video.full_name, locale)} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
