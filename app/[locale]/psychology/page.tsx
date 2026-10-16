import { PsychList } from "@/components/psych/PsychList";
import { loadPsychTests } from "@/components/psych/data";

import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "psychology", "/psychology");
}

export default async function PsychologyPage() {
  const tests = await loadPsychTests();
  return <PsychList tests={tests} />;
}
