import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { CampusView } from "@/components/public/CampusView";
import { getCampus, getSettings } from "@/components/public/data";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "campus", "/campus");
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  const [sections, settings] = await Promise.all([getCampus(), getSettings()]);
  return <CampusView sections={sections} tourUrl={settings.virtual_tour_url} />;
}
