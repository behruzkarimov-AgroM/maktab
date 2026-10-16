import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { AchievementsView } from "@/components/public/AchievementsView";
import { getAchievements } from "@/components/public/data";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "achievements", "/achievements");
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  const items = await getAchievements();
  return <AchievementsView items={items} />;
}
