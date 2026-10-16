"use client";

import { AnimatePresence, m as motion } from "framer-motion";
import { Bus, ChevronLeft, ChevronRight, Clock, ShieldCheck, Utensils, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DEMO_GALLERY, DEMO_SCHEDULE, type CampusSectionData } from "@/lib/demo-data";
import { tr, type LocalizedText } from "@/lib/types";
import { AdmissionDialog } from "./AdmissionDialog";
import { FadeIn, Glass, Modal, PageHero, Section, SectionTitle, usePublic } from "./ui";

type GalleryItem = { url?: string; caption?: LocalizedText; hue: number; emoji: string };

/** Placeholder tile backgrounds stay inside the navy / steel-blue / gold brand palette. */
const TILE_GRADIENTS = [
  "linear-gradient(135deg, #1d3557, #457b9d)",
  "linear-gradient(135deg, #264f77, #4f8fb0)",
  "linear-gradient(135deg, #14253f, #2f5f87)",
  "linear-gradient(135deg, #335d7a, #5a8fae)",
  "linear-gradient(135deg, #8a5a00, #c98a12)",
];
const brandGradient = (hue: number) => TILE_GRADIENTS[Math.floor(Math.abs(hue) / 72) % TILE_GRADIENTS.length];

function Tile({ item, locale, big }: { item: GalleryItem; locale: "uz" | "ru" | "en"; big?: boolean }) {
  if (item.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.url} alt={tr(item.caption, locale)} className="h-full w-full object-cover" loading="lazy" />;
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ background: brandGradient(item.hue) }}>
      <span className={big ? "text-8xl" : "text-5xl"}>{item.emoji}</span>
    </div>
  );
}

export function CampusView({ sections, tourUrl }: { sections: CampusSectionData[]; tourUrl: string | null }) {
  const { locale, t } = usePublic();
  const by = (k: string) => sections.find((s) => s.section_key === k);
  const schedule = ((by("schedule")?.extra_data?.items as { time: string; title: LocalizedText }[] | undefined) ?? DEMO_SCHEDULE);
  const menu = (by("kitchen")?.extra_data?.menu as { day: LocalizedText; items: LocalizedText }[] | undefined) ?? [];
  const points = (by("security")?.extra_data?.points as LocalizedText[] | undefined) ?? [];
  const routes = (by("transport")?.extra_data?.routes as LocalizedText[] | undefined) ?? [];

  const urls = sections.flatMap((s) => s.gallery_urls ?? []);
  const gallery: GalleryItem[] = urls.length
    ? urls.map((url, i) => ({ url, hue: 200, emoji: "", caption: DEMO_GALLERY[i % DEMO_GALLERY.length].caption }))
    : DEMO_GALLERY;
  const [lb, setLb] = useState<number | null>(null);
  const [day, setDay] = useState(0);

  useEffect(() => {
    if (lb === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setLb((v) => (v === null ? v : (v + 1) % gallery.length));
      if (e.key === "ArrowLeft") setLb((v) => (v === null ? v : (v - 1 + gallery.length) % gallery.length));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lb, gallery.length]);

  return (
    <>
      <PageHero title={t("campusTitle")} subtitle={t("campusSub")} />

      <Section className="pt-2">
        <div className="grid gap-5 lg:grid-cols-5">
          {/* schedule */}
          <Glass hover={false} className="lg:col-span-2">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><Clock className="h-5 w-5 text-indigo-500" />{t("scheduleTitle")}</h2>
            <ol className="relative mt-5 space-y-4 border-l-2 border-indigo-500/30 pl-5">
              {schedule.map((s, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="relative">
                  <span className="absolute -left-[1.62rem] top-1.5 h-3 w-3 rounded-full bg-indigo-500 ring-4 ring-indigo-500/20" />
                  <span className="mr-2 font-mono text-sm font-bold text-indigo-600 dark:text-indigo-300">{s.time}</span>
                  <span className="text-slate-700 dark:text-slate-200">{tr(s.title, locale)}</span>
                </motion.li>
              ))}
            </ol>
          </Glass>

          {/* menu */}
          <Glass hover={false} className="lg:col-span-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><Utensils className="h-5 w-5 text-orange-500" />{t("menuTitle")}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(by("kitchen")?.description, locale)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {menu.map((m, i) => (
                <button key={i} onClick={() => setDay(i)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${day === i ? "bg-orange-700 text-white shadow" : "bg-slate-200/70 text-slate-700 hover:bg-slate-300/70 dark:bg-white/10 dark:text-slate-200"}`}>
                  {tr(m.day, locale)}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {menu[day] && (
                <motion.div key={day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-2xl bg-orange-500/10 p-5 text-lg text-slate-800 dark:text-slate-100">
                  {tr(menu[day].items, locale)}
                </motion.div>
              )}
            </AnimatePresence>
            <details className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              <summary className="cursor-pointer font-semibold">{t("menuTitle")} — {t("all")}</summary>
              <ul className="mt-2 space-y-1.5">
                {menu.map((m, i) => <li key={i}><b>{tr(m.day, locale)}:</b> {tr(m.items, locale)}</li>)}
              </ul>
            </details>
          </Glass>

          {/* security */}
          <Glass className="lg:col-span-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><ShieldCheck className="h-5 w-5 text-emerald-500" />{t("securityTitle")}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(by("security")?.description, locale)}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {points.map((p, i) => (
                <li key={i} className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-slate-800 dark:text-slate-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{tr(p, locale)}</li>
              ))}
            </ul>
          </Glass>

          {/* transport */}
          <Glass className="lg:col-span-2">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><Bus className="h-5 w-5 text-sky-500" />{t("transportTitle")}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tr(by("transport")?.description, locale)}</p>
            <ul className="mt-4 space-y-2">
              {routes.map((r, i) => (
                <li key={i} className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">🚌 {tr(r, locale)}</li>
              ))}
            </ul>
          </Glass>
        </div>
      </Section>

      <Section>
        <SectionTitle title={tourUrl ? t("tourTitle") : t("galleryTitle")} />
        {tourUrl && (
          <FadeIn className="mb-8">
            <div className="aspect-video overflow-hidden rounded-3xl border border-white/30 shadow-xl">
              <iframe src={tourUrl} title={t("tourTitle")} className="h-full w-full" allowFullScreen loading="lazy" />
            </div>
          </FadeIn>
        )}
        {!tourUrl && <p className="mb-6 text-center text-sm text-slate-500 dark:text-slate-400">{t("tourFallback")}</p>}
        <div className="grid auto-rows-[140px] grid-cols-2 gap-3 sm:auto-rows-[170px] md:grid-cols-4">
          {gallery.map((g, i) => (
            <FadeIn key={i} delay={(i % 4) * 0.05} className={i === 0 || i === 5 ? "col-span-2 row-span-2" : ""}>
              <button onClick={() => setLb(i)} className="group relative block h-full w-full overflow-hidden rounded-2xl shadow-md" aria-label={tr(g.caption, locale)}>
                <motion.div className="h-full w-full" whileHover={{ scale: 1.08 }} transition={{ duration: 0.4 }}><Tile item={g} locale={locale} big={i === 0 || i === 5} /></motion.div>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100">{tr(g.caption, locale)}</span>
              </button>
            </FadeIn>
          ))}
        </div>
        <div className="mt-10 flex justify-center"><AdmissionDialog type="campus_tour" /></div>
      </Section>

      <Modal open={lb !== null} onClose={() => setLb(null)} label={t("galleryTitle")} wide>
        {lb !== null && (
          <div>
            <button aria-label={t("close")} onClick={() => setLb(null)} className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"><X className="h-5 w-5" /></button>
            <div className="relative aspect-video overflow-hidden rounded-2xl">
              <AnimatePresence mode="wait">
                <motion.div key={lb} className="h-full w-full" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <Tile item={gallery[lb]} locale={locale} big />
                </motion.div>
              </AnimatePresence>
              <button type="button" aria-label={t("prevImage")} onClick={() => setLb((lb - 1 + gallery.length) % gallery.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"><ChevronLeft className="h-6 w-6" /></button>
              <button type="button" aria-label={t("nextImage")} onClick={() => setLb((lb + 1) % gallery.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"><ChevronRight className="h-6 w-6" /></button>
            </div>
            <p className="mt-3 text-center font-semibold text-slate-800 dark:text-slate-100">{tr(gallery[lb].caption, locale)} <span className="text-sm font-normal opacity-60">({lb + 1}/{gallery.length})</span></p>
          </div>
        )}
      </Modal>
    </>
  );
}
