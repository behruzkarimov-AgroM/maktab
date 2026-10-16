import { LazySurveyResults } from "@/components/layout/LazyViews";

export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LazySurveyResults id={id} />;
}
