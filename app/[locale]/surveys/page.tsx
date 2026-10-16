import { SurveyList } from "@/components/surveys/SurveyList";
import { pageMetadata } from "@/lib/seo";
import { listPublicSurveys } from "@/lib/surveys/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "surveys", "/surveys");
}

export default async function SurveysPage() {
  const surveys = await listPublicSurveys();
  return <SurveyList surveys={surveys} />;
}
