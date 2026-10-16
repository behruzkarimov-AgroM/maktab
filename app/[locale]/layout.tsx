import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MotionProvider } from "@/components/layout/MotionProvider";
import { RootHtml } from "@/components/layout/RootHtml";
import { PageTransition } from "@/components/layout/PageTransition";
import { SmoothScroll } from "@/components/layout/SmoothScroll";
import { VisitTracker } from "@/components/layout/VisitTracker";
import { routing } from "@/i18n/routing";
import { OG_LOCALE, ogImage, siteUrl } from "@/lib/seo";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1424" },
  ],
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(siteUrl()),
    applicationName: "Children's Academy",
    title: { default: t("title"), template: t("titleTemplate") },
    description: t("description"),
    openGraph: {
      title: t("title"),
      description: t("description"),
      siteName: "Children's Academy",
      locale: OG_LOCALE[locale],
      type: "website",
      images: [ogImage(locale)],
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description"), images: [ogImage(locale).url] },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "nav" });

  return (
    <RootHtml lang={locale}>
      <NextIntlClientProvider>
        <MotionProvider>
          <SmoothScroll />
          <VisitTracker />
          <a
            href="#main"
            className="sr-only z-[100] rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            {t("skipToContent")}
          </a>
          <Header />
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            <PageTransition>{children}</PageTransition>
          </main>
          <Footer />
        </MotionProvider>
      </NextIntlClientProvider>
    </RootHtml>
  );
}
