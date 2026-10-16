import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SurveyRunner } from "@/components/surveys/SurveyRunner";
import { buildMetadata } from "@/lib/seo";
import { getPublicSurvey } from "@/lib/surveys/server";
import { tr, type Locale } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const loc = (["uz", "ru", "en"].includes(locale) ? locale : "uz") as Locale;
  const survey = await getPublicSurvey(decodeURIComponent(id)).catch(() => null);
  if (!survey) {
    const te = await getTranslations({ locale: loc, namespace: "errors" });
    return { title: te("notFoundTitle"), robots: { index: false, follow: false } };
  }
  return buildMetadata(loc, `/surveys/${encodeURIComponent(survey.id)}`, tr(survey.title, loc), tr(survey.description, loc));
}

export default async function SurveyPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const survey = await getPublicSurvey(decodeURIComponent(id));
  if (!survey || !survey.questions?.length) notFound();
  return <SurveyRunner survey={survey} />;
}
