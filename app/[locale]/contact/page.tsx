import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { ContactView } from "@/components/public/ContactView";
import { getSettings } from "@/components/public/data";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "contact", "/contact");
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  const settings = await getSettings();
  return <ContactView settings={settings} />;
}
