import type { Metadata } from "next";
import OlympiadsPage from "@/components/olympiad/OlympiadsPage";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "olympiads", "/olympiads");
}

export default function Page() {
  return <OlympiadsPage />;
}
