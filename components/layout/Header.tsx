"use client";

import { ChevronDown, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LoginMenu } from "./LoginMenu";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { PRIMARY_NAV, SECONDARY_NAV, isActivePath } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const navId = useId();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // the "more" menu remembers the path it was opened on, so navigating closes it without a state reset in an effect
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null);
  const moreOpen = moreOpenAt === pathname;
  const setMoreOpen = useCallback((v: boolean) => setMoreOpenAt(v ? pathname : null), [pathname]);
  const moreRef = useRef<HTMLLIElement>(null);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen, setMoreOpen]);

  const secondaryActive = SECONDARY_NAV.some((i) => isActivePath(pathname, i.href));

  return (
    <header
      data-site-header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled ? "py-2" : "py-3 sm:py-4",
      )}
    >
      <div className="container-page max-w-[90rem]!">
        <div
          className={cn(
            "glass-strong flex min-w-0 items-center justify-between gap-2 rounded-full px-3 py-2 sm:px-4 xl:gap-3",
            scrolled && "shadow-xl",
          )}
        >
          <Logo />

          <nav aria-label={t("main")} className="hidden min-[1480px]:block">
            <ul className="flex items-center gap-0.5">
              {PRIMARY_NAV.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-semibold transition-colors",
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {t(item.key)}
                    </Link>
                  </li>
                );
              })}
              <li ref={moreRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={moreOpen}
                  aria-controls={`${navId}-more`}
                  onClick={() => setMoreOpen(!moreOpen)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
                    secondaryActive || moreOpen
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t("more")}
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
                {moreOpen && (
                  <ul
                    id={`${navId}-more`}
                    className="glass-strong absolute right-0 top-full mt-2 w-52 rounded-2xl p-2"
                  >
                    {SECONDARY_NAV.map((item) => {
                      const active = isActivePath(pathname, item.href);
                      return (
                        <li key={item.key}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "block rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                              active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                            )}
                          >
                            {t(item.key)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle className="hidden sm:inline-flex" />
            <LoginMenu className="hidden sm:block" />
            <Button href="/contact" size="sm" className="hidden md:inline-flex">
              {tc("apply")}
            </Button>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t("openMenu")}
              aria-expanded={mobileOpen}
              aria-controls={`${navId}-mobile`}
              className="glass grid h-10 w-10 place-items-center rounded-full min-[1480px]:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <MobileNav id={`${navId}-mobile`} open={mobileOpen} onClose={closeMobile} />
    </header>
  );
}
