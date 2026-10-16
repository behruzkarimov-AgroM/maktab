"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, BookOpen, CalendarDays, CheckSquare, GraduationCap, LayoutDashboard, LogOut, Megaphone, Menu, Moon, School, Settings, Sun, Upload, Users, X, FileText, BarChart3, Baby,
} from "lucide-react";
import { navFor, type NavItem } from "@/lib/school/nav";
import { ROLE_LABEL } from "@/lib/school/i18n";
import { spost } from "@/lib/school/client";
import { LOCALES } from "@/lib/types";
import { useTheme } from "@/components/layout/ThemeProvider";
import { Badge, cn } from "./kit";
import { useSchool } from "./SchoolProvider";

const ICONS: Record<NavItem["icon"], typeof Users> = {
  dashboard: LayoutDashboard, users: Users, class: School, book: BookOpen, calendar: CalendarDays, check: CheckSquare, chart: BarChart3,
  megaphone: Megaphone, settings: Settings, upload: Upload, file: FileText, bell: Bell, child: Baby, teacher: GraduationCap,
};

/** Sidebar + top bar for every portal page. Navigation comes from lib/school/nav.ts (role -> items). */
export function PortalShell({ children }: { children: ReactNode }) {
  const { session, t, lang, setLang } = useSchool();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const btn = menuBtnRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      btn?.focus();
    };
  }, [open]);
  if (!session) return <>{children}</>;
  const items = navFor(session.role);
  const active = (href: string) => (href === items[0].href ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  async function logout() {
    try {
      await spost("/auth/logout");
    } finally {
      router.replace("/school/login");
      router.refresh();
    }
  }

  const nav = (
    <nav aria-label={t("appName")} className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        return (
          <Link
            key={it.key}
            href={it.href}
            aria-current={active(it.href) ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active(it.href)
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {t(it.label as never)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">{t("a_skip")}</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-96.png" alt="" width={36} height={36} className="size-9 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{t("appName")}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">Children&apos;s Academy</p>
          </div>
        </div>
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("a_menu")}>
          <button aria-label={t("close")} className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className="text-sm font-bold">{t("appName")}</p>
              <button ref={closeRef} aria-label={t("close")} onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-slate-200 bg-white/90 px-2 py-1.5 backdrop-blur sm:gap-2 sm:px-4 dark:border-slate-800 dark:bg-slate-900/90">
          <button ref={menuBtnRef} aria-label={t("a_menu")} aria-expanded={open} onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden">
            <Menu className="size-5" />
          </button>
          {session.demo && <Badge tone="amber" className="hidden sm:inline-flex">DEMO</Badge>}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-0.5" role="group" aria-label={t("language")}>
              {LOCALES.map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={cn("min-h-11 min-w-11 shrink-0 rounded-md px-2 py-1 text-xs font-bold uppercase lg:min-h-8 lg:min-w-8", lang === l ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}
                >
                  {l}
                </button>
              ))}
            </div>
            <button aria-label={t("theme")} onClick={toggleTheme} className="grid size-11 place-items-center rounded-lg text-slate-600 lg:size-9 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              {resolvedTheme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <div className="hidden text-right leading-tight sm:block">
              <p className="max-w-40 truncate text-sm font-semibold">{session.name}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{t(ROLE_LABEL[session.role])}</p>
            </div>
            <button onClick={logout} aria-label={t("signOut")} title={t("signOut")} className="grid size-11 place-items-center rounded-lg text-slate-600 lg:size-9 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <LogOut className="size-5" />
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 p-4 outline-none sm:p-6">{children}</main>
      </div>
    </div>
  );
}
