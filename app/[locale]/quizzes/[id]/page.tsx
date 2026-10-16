import type { Metadata } from "next";
import QuizRunner from "@/components/quiz/QuizRunner";
import { quizDict } from "@/components/quiz/i18n";
import { listQuizzes } from "@/app/api/quiz/_lib";
import { buildMetadata } from "@/lib/seo";
import { tr, type Locale } from "@/lib/types";

type P = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, id } = await params;
  const loc: Locale = locale in quizDict ? (locale as Locale) : "uz";
  const t = quizDict[loc];
  try {
    const q = (await listQuizzes()).quizzes.find((x) => x.id === id);
    if (q) return buildMetadata(loc, `/quizzes/${encodeURIComponent(id)}`, tr(q.title, loc), tr(q.description, loc) || t.sub);
  } catch {
    /* fall through to the generic title */
  }
  return buildMetadata(loc, `/quizzes/${encodeURIComponent(id)}`, t.title, t.sub);
}

export default async function Page({ params }: P) {
  const { id } = await params;
  return <QuizRunner quizId={id} />;
}
