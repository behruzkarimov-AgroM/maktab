import { notFound } from "next/navigation";
import { PsychRunner } from "@/components/psych/PsychRunner";
import { loadPsychTest } from "@/components/psych/data";

import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo";
import { tr, type Locale } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const loc = (["uz", "ru", "en"].includes(locale) ? locale : "uz") as Locale;
  const test = await loadPsychTest(decodeURIComponent(id)).catch(() => null);
  const path = `/psychology/${encodeURIComponent(decodeURIComponent(id))}`;
  if (!test) {
    const te = await getTranslations({ locale: loc, namespace: "errors" });
    return { title: te("notFoundTitle"), robots: { index: false, follow: false } };
  }
  return buildMetadata(loc, path, tr(test.title, loc), tr(test.description, loc));
}

export default async function PsychTestPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const test = await loadPsychTest(decodeURIComponent(id));
  if (!test) notFound();
  return <PsychRunner test={test} />;
}
