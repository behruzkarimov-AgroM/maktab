"use client";

import { ChevronDown, GraduationCap, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import NextLink from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** The two sign-in areas. They live outside the locale routes, so plain next/link (no locale prefix), not prefetched. */
export const LOGIN_TARGETS = [
  { href: "/school/login", label: "loginSchool", hint: "loginSchoolHint", Icon: GraduationCap },
  { href: "/admin/login", label: "loginAdmin", hint: "loginAdminHint", Icon: ShieldCheck },
  { href: "/school/register", label: "loginRegister", hint: "loginRegisterHint", Icon: UserPlus },
] as const;

/** Header "Sign in" button with a small menu: school portal / admin panel. */
export function LoginMenu({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`${id}-login`}
        aria-label={t("login")}
        title={t("login")}
        onClick={() => setOpen(!open)}
        className={cn(
          // the label only fits between 1024 and 1479px; on tablets and when the full navigation is shown (>= 1480px) icon only
          // (only "hide" utilities per range, so no two breakpoints compete for the same property)
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors max-lg:w-10 max-lg:px-0 min-[1480px]:w-10 min-[1480px]:px-0",
          open ? "bg-primary/15 text-primary" : "glass text-foreground hover:bg-muted",
        )}
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        <span className="max-lg:hidden min-[1480px]:hidden">{t("login")}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform max-lg:hidden min-[1480px]:hidden", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-login`} className="glass-strong absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl p-2">
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("loginMenu")}</p>
          <ul>
            {LOGIN_TARGETS.map(({ href, label, hint, Icon }) => (
              <li key={href}>
                <NextLink
                  href={href}
                  prefetch={false}
                  rel="nofollow"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{t(label)}</span>
                    <span className="block text-xs text-muted-foreground">{t(hint)}</span>
                  </span>
                </NextLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
