"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** UZ / RU / EN segmented switcher. Keeps the current path, query and hash. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("language");
  const pathname = usePathname();
  const router = useRouter();

  const onClick = (e: MouseEvent<HTMLAnchorElement>, next: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const { search, hash } = window.location;
    router.replace(`${pathname}${search}${hash}`, { locale: next as (typeof routing.locales)[number] });
  };

  return (
    <div
      role="group"
      aria-label={t("switch")}
      className={cn("glass inline-flex items-center rounded-full p-0.5 text-xs font-bold", className)}
    >
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <Link
            key={l}
            href={pathname}
            locale={l}
            hrefLang={l}
            lang={l}
            aria-label={t(l)}
            aria-current={active ? "true" : undefined}
            onClick={(e) => onClick(e, l)}
            className={cn(
              "rounded-full px-2.5 py-1.5 uppercase tracking-wide transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l}
          </Link>
        );
      })}
    </div>
  );
}
