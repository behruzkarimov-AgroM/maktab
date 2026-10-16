import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

export const OG_LOCALE: Record<string, string> = { uz: "uz_UZ", ru: "ru_RU", en: "en_US" };

let warned = false;

/** Canonical origin. Never falls back to localhost in production builds (throws on Vercel prod, warns elsewhere). */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("NEXT_PUBLIC_SITE_URL must be set in production (used for canonical/hreflang/sitemap).");
    }
    if (!warned) {
      warned = true;
      console.warn("[seo] NEXT_PUBLIC_SITE_URL is not set; canonical/sitemap URLs will point to http://localhost:3000.");
    }
  }
  return "http://localhost:3000";
}

/** Every indexable static route (without locale prefix). "" is the home page. */
export const STATIC_ROUTES = [
  "",
  "/about",
  "/programs",
  "/campus",
  "/team",
  "/achievements",
  "/olympiads",
  "/quizzes",
  "/psychology",
  "/surveys",
  "/games",
  "/assessment",
  "/contact",
  "/privacy",
] as const;

export const localePath = (locale: string, path: string) => `/${locale}${path}`;
export const ogImage = (locale: string) => ({ url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: "Children's Academy" });

export function languageAlternates(path: string) {
  return {
    ...Object.fromEntries(routing.locales.map((l) => [l, localePath(l, path)])),
    "x-default": localePath(routing.defaultLocale, path),
  };
}

/** Metadata from explicit strings (pages whose copy lives in component dictionaries): canonical, hreflang, OG, Twitter. */
export function buildMetadata(locale: string, path: string, title: string, description: string): Metadata {
  const url = localePath(locale, path);
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      title,
      description,
      url,
      siteName: "Children's Academy",
      locale: OG_LOCALE[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      type: "website",
      images: [ogImage(locale)],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage(locale).url] },
  };
}

/**
 * Metadata for a public page: title/description from messages `seo.<page>`,
 * canonical + hreflang alternates, OpenGraph and Twitter cards.
 */
export async function pageMetadata(
  locale: string,
  page: "home" | "about" | "programs" | "campus" | "team" | "achievements" | "contact" | "privacy" | "games" | "psychology" | "surveys" | "quizzes" | "olympiads" | "assessment",
  path: string,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "seo" });
  const title = t(`${page}.title`);
  const description = t(`${page}.description`);
  const url = localePath(locale, path);
  const isHome = page === "home";
  return {
    title: isHome ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      title,
      description,
      url,
      siteName: "Children's Academy",
      locale: OG_LOCALE[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      type: "website",
      images: [ogImage(locale)],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage(locale).url] },
  };
}
