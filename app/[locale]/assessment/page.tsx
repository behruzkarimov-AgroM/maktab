import type { Metadata } from "next";
import AssessmentCenter, { type PsychLite } from "@/components/assessment/AssessmentCenter";
import { loadPsychTests } from "@/components/psych/data";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "assessment", "/assessment");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const tests = await loadPsychTests();
  // Only public, score-free fields cross to the client.
  const psych: PsychLite[] = tests.map((x) => ({
    id: x.id,
    title: x.title,
    description: x.description,
    audience: x.audience,
    topic: x.topic,
    questionCount: x.questions.length,
  }));
  return <AssessmentCenter psych={psych} initialTab={tab === "psychology" ? "psychology" : "academic"} />;
}
