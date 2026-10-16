import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { TeamView } from "@/components/public/TeamView";
import { getStaff } from "@/components/public/data";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "team", "/team");
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  const staff = await getStaff();
  return <TeamView staff={staff} />;
}
