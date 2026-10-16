"use client";

import { AnimatePresence, m as motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { NAV_ITEMS, isActivePath } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

type MobileNavProps = { open: boolean; onClose: () => void; id: string };

/** Slide-in full-height drawer for < xl screens. */
export function MobileNav({ open, onClose, id }: MobileNavProps) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Close on route change
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Escape + Tab trap + scroll lock + inert background + initial focus + focus return
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const bg = Array.from(document.querySelectorAll<HTMLElement>("main, footer, [data-site-header] > .container-page"));
    bg.forEach((el) => el.setAttribute("inert", ""));
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      bg.forEach((el) => el.removeAttribute("inert"));
      trigger?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm min-[1480px]:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.nav
            key="panel"
            ref={panelRef}
            id={id}
            data-mobile-nav
            aria-label={t("main")}
            role="dialog"
            aria-modal="true"
            className="glass-strong fixed inset-y-0 right-0 z-[70] flex w-[min(22rem,88vw)] flex-col gap-4 overflow-y-auto rounded-l-3xl p-5 min-[1480px]:hidden"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="flex items-center justify-between">
              <Logo onClick={onClose} />
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={t("closeMenu")}
                className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.map((item, i) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <motion.li
                    key={item.key}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i + 0.1 }}
                  >
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center rounded-xl px-4 py-3 text-base font-semibold transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {t(item.key)}
                    </Link>
                  </motion.li>
                );
              })}
            </ul>

            <div className="mt-auto flex flex-col gap-4 pt-2">
              <Button href="/contact" size="lg" className="w-full">
                {tc("apply")}
              </Button>
              <div className="flex items-center justify-between">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}
