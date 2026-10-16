import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

/** Catch-all so unknown /{locale}/... URLs render app/[locale]/not-found.tsx inside the locale layout. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const loc = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: loc, namespace: "errors" });
  return { title: t("notFoundTitle"), robots: { index: false, follow: false } };
}

export default function CatchAll() {
  notFound();
}
