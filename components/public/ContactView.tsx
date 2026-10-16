"use client";

import { Bus, Car, ExternalLink, Mail, MapPin, Phone, Train, Clock, Navigation } from "lucide-react";
import type { SiteSettingsData } from "@/lib/demo-data";
import { tr } from "@/lib/types";
import { AdmissionForm } from "./AdmissionDialog";
import { FadeIn, Glass, PageHero, Section, usePublic } from "./ui";

function MapEmbed({ s }: { s: SiteSettingsData }) {
  const { t } = usePublic();
  const hasCoords = s.map_lat != null && s.map_lng != null;
  // Custom embed URL from site_settings (Yandex/Google) wins; fallback to OpenStreetMap by coordinates.
  const src =
    s.map_embed_url ||
    (hasCoords
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${s.map_lng! - 0.01}%2C${s.map_lat! - 0.006}%2C${s.map_lng! + 0.01}%2C${s.map_lat! + 0.006}&layer=mapnik&marker=${s.map_lat}%2C${s.map_lng}`
      : null);
  const link = hasCoords ? `https://yandex.com/maps/?pt=${s.map_lng},${s.map_lat}&z=16&l=map` : null;
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/40 bg-slate-200 shadow-xl dark:border-white/10 dark:bg-slate-800 lg:aspect-auto lg:h-full lg:min-h-[420px]">
      {src ? (
        <iframe src={src} title={t("openMap")} className="absolute inset-0 h-full w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-center text-slate-500"><div><MapPin className="mx-auto h-10 w-10" /><p className="mt-2">{t("mapFallback")}</p></div></div>
      )}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-slate-800 shadow backdrop-blur hover:bg-white">
          {t("openMap")} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export function ContactView({ settings }: { settings: SiteSettingsData }) {
  const { locale, t } = usePublic();
  const rows = [
    { Icon: MapPin, label: t("address"), value: tr(settings.address, locale) },
    { Icon: Navigation, label: t("landmark"), value: tr(settings.landmark, locale) },
    { Icon: Clock, label: t("hoursLabel"), value: tr(settings.working_hours, locale) },
  ];
  return (
    <>
      <PageHero title={t("contactTitle")} subtitle={t("contactSub")} />
      <Section className="pt-2">
        <div className="grid gap-5 lg:grid-cols-2">
          <FadeIn>
            <Glass hover={false} className="h-full">
              <ul className="space-y-4">
                {rows.map(({ Icon, label, value }) => (
                  <li key={label} className="flex gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"><Icon className="h-5 w-5" /></span>
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="text-slate-800 dark:text-slate-100">{value}</div></div>
                  </li>
                ))}
                <li className="flex gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"><Phone className="h-5 w-5" /></span>
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("phones")}</div>
                    {settings.phones.map((p) => <a key={p} href={`tel:${p.replace(/[^+\d]/g, "")}`} className="block text-slate-800 hover:text-indigo-600 dark:text-slate-100">{p}</a>)}</div>
                </li>
                <li className="flex gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"><Mail className="h-5 w-5" /></span>
                  <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("email")}</div><a href={`mailto:${settings.email}`} className="text-slate-800 hover:text-indigo-600 dark:text-slate-100">{settings.email}</a></div>
                </li>
              </ul>
              <h2 className="mb-3 mt-8 text-lg font-bold text-slate-900 dark:text-white">{t("directions")}</h2>
              <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                <li className="flex gap-2"><Train className="h-4 w-4 shrink-0 text-indigo-500" />{t("dirMetro")}</li>
                <li className="flex gap-2"><Bus className="h-4 w-4 shrink-0 text-indigo-500" />{t("dirBus")}</li>
                <li className="flex gap-2"><Car className="h-4 w-4 shrink-0 text-indigo-500" />{t("dirCar")}</li>
              </ul>
            </Glass>
          </FadeIn>
          <FadeIn delay={0.1}><MapEmbed s={settings} /></FadeIn>
        </div>
      </Section>

      <Section className="pb-24">
        <FadeIn>
          <Glass hover={false} className="mx-auto max-w-3xl p-6 sm:p-10">
            <h2 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white">{t("formTitle")}</h2>
            <AdmissionForm />
          </Glass>
        </FadeIn>
      </Section>
    </>
  );
}
