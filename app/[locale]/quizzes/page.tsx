import type { Metadata } from "next";
import QuizCenter from "@/components/quiz/QuizCenter";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "quizzes", "/quizzes");
}

export default function Page() {
  return <QuizCenter />;
}
