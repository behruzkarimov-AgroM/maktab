import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { AboutView } from "@/components/public/AboutView";
import { getSettings } from "@/components/public/data";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "about", "/about");
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  const settings = await getSettings();
  return <AboutView settings={settings} />;
}
