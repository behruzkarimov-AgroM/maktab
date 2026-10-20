"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTheme as useSiteTheme } from "@/components/layout/ThemeProvider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, LayoutDashboard, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { api } from "@/lib/admin/api";
import { cn } from "@/lib/admin/cn";
import { canRead, GROUP_LABEL, RESOURCES } from "@/lib/admin/resources";
import { loadAdminClient, supabaseConfigured } from "./supabase-lazy";
import type { AdminSession, ResourceGroup } from "@/lib/admin/types";
import { LOCALES } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { ICONS } from "./icons";
import { Badge } from "./ui";

const ROLE_KEY = { super_admin: "roleSuper", methodist: "roleMethodist", psychologist: "rolePsychologist" } as const;

export function AdminShell({ session, children }: { session: AdminSession; children: ReactNode }) {
  const { t, L, lang, setLang } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();
  // one theme store for the whole site (key "maktab-theme"), same as the public pages and the school portal
  const { resolvedTheme, toggleTheme: toggle } = useSiteTheme();
  const dark = resolvedTheme === "dark";
  // the mobile menu remembers the path it was opened on: navigating closes it without a state reset in an effect
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = useCallback((v: boolean) => setOpenAt(v ? pathname : null), [pathname]);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const btn = menuBtnRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      btn?.focus();
    };
  }, [open, setOpen]);

  // keep the Supabase session cookie fresh (server components cannot write cookies)
  useEffect(() => {
    if (!supabaseConfigured()) return;
    let stop = false;
    let h: ReturnType<typeof setInterval> | undefined;
    void loadAdminClient().then((c) => {
      if (stop) return;
      const tick = () => void c.auth.getSession();
      tick();
      h = setInterval(tick, 10 * 60 * 1000);
    });
    return () => {
      stop = true;
      if (h) clearInterval(h);
    };
  }, []);

  const groups = useMemo(() => {
    const out: { group: ResourceGroup; items: typeof RESOURCES }[] = [];
    for (const g of ["content", "learn", "mind", "system"] as ResourceGroup[]) {
      const items = RESOURCES.filter((r) => r.group === g && r.nav !== false && canRead(r, session.role));
      if (items.length) out.push({ group: g, items });
    }
    return out;
  }, [session.role]);

  async function logout() {
    try {
      if (supabaseConfigured()) await (await loadAdminClient()).auth.signOut();
      await api.logout();
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  const link = (href: string, label: string, Icon: (typeof ICONS)[string], active: boolean) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t("adminNavLabel")}>
      <div className="space-y-0.5">
        {link("/admin", t("dashboard"), LayoutDashboard, pathname === "/admin")}
        {session.role === "super_admin" && link("/admin/enroll", t("en_nav"), ICONS.UserPlus, pathname === "/admin/enroll")}
        {link("/admin/import", t("imp_nav"), ICONS.FileUp, pathname === "/admin/import")}
        {(session.role === "super_admin" || session.role === "methodist") && link("/admin/scan", t("scan"), ICONS.ScanLine, pathname === "/admin/scan")}
      </div>
      {groups.map(({ group, items }) => (
        <div key={group}>
          <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{L(GROUP_LABEL[group])}</p>
          <div className="space-y-0.5">
            {items.map((r) => link(`/admin/${r.key}`, L(r.label), ICONS[r.icon] ?? LayoutDashboard, pathname === `/admin/${r.key}` || pathname.startsWith(`/admin/${r.key}/`)))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-96.png" alt="" width={32} height={32} className="size-8 rounded-full object-cover" />
          <span className="text-sm font-bold">{t("appName")}</span>
        </div>
        {nav}
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("menu")}>
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
              <span className="text-sm font-bold">{t("appName")}</span>
              <button onClick={() => setOpen(false)} aria-label={t("close")}>
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/85 px-3 backdrop-blur sm:px-5 dark:border-slate-800 dark:bg-slate-900/85">
          <button ref={menuBtnRef} className="rounded-lg p-2 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" onClick={() => setOpen(true)} aria-label={t("menu")} aria-expanded={open}>
            <Menu className="size-5" />
          </button>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700" role="group" aria-label={t("language")}>
              {LOCALES.map((l) => (
                <button key={l} onClick={() => setLang(l)} className={cn("rounded-md px-2 py-1 text-xs font-bold uppercase", lang === l ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100")} aria-pressed={lang === l}>
                  {l}
                </button>
              ))}
            </div>
            <button onClick={toggle} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={t("theme")}>
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <a href="/" target="_blank" rel="noreferrer" className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:block dark:text-slate-300 dark:hover:bg-slate-800" aria-label={t("openSite")} title={t("openSite")}>
              <ExternalLink className="size-5" />
            </a>
            <div className="mx-1 hidden text-right leading-tight md:block">
              <div className="max-w-40 truncate text-sm font-medium">{session.name}</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">{session.email}</div>
            </div>
            <Badge tone="violet">{t(ROLE_KEY[session.role])}</Badge>
            <button onClick={logout} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={t("signOut")} title={t("signOut")}>
              <LogOut className="size-5" />
            </button>
          </div>
        </header>
        {session.demo && (
          <section aria-label={t("demoLogin")} className="border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {t("demoBanner")}
          </section>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
