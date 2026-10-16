import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { ProgramsView } from "@/components/public/ProgramsView";
import { getPrograms } from "@/components/public/data";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "programs", "/programs");
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  const programs = await getPrograms();
  return <ProgramsView programs={programs} />;
}
