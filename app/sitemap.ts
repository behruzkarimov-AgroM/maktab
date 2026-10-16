import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { STATIC_ROUTES, localePath, siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return STATIC_ROUTES.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${base}${localePath(locale, path)}`,
      lastModified: now,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : path === "/contact" || path === "/programs" ? 0.9 : 0.7,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}${localePath(l, path)}`])),
      },
    })),
  );
}