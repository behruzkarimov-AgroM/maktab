import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/home/Hero";
import { CtaBanner, OlympiadTeaser, ProgramsBento, StatsBar, Testimonials, WhyUs } from "@/components/home/HomeSections";
import { getNextOlympiad, getPrograms, getSettings } from "@/components/public/data";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { tr, type Locale } from "@/lib/types";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "home", "");
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [settings, programs, olympiad] = await Promise.all([getSettings(), getPrograms(), getNextOlympiad()]);

  const social = Object.values(settings.social_links ?? {}).filter((u) => /^https?:\/\//.test(u) && u.replace(/\/+$/, "").split("/").length > 3);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: tr(settings.school_name, locale as Locale) || "Children's Academy",
    url: `${siteUrl()}/${locale}`,
    logo: `${siteUrl()}/icon`,
    image: settings.hero_image_url || `${siteUrl()}/${locale}/opengraph-image`,
    description: tr(settings.about_mission, locale as Locale),
    email: settings.email,
    telephone: settings.phones?.[0],
    address: { "@type": "PostalAddress", streetAddress: tr(settings.address, locale as Locale), addressCountry: "UZ" },
    ...(settings.map_lat != null && settings.map_lng != null
      ? { geo: { "@type": "GeoCoordinates", latitude: settings.map_lat, longitude: settings.map_lng } }
      : {}),
    openingHours: tr(settings.working_hours, locale as Locale),
    ...(social.length ? { sameAs: social } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Hero settings={settings} />
      <StatsBar stats={settings.stats} />
      <ProgramsBento programs={programs} />
      <OlympiadTeaser olympiad={olympiad} />
      <WhyUs />
      <Testimonials />
      <CtaBanner />
    </>
  );
}