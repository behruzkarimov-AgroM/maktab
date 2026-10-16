import { Clock, Mail, MapPin, Phone } from "lucide-react";
import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DEMO_SETTINGS } from "@/lib/demo-data";
import { getSiteContact } from "@/lib/supabase/public";
import { tr } from "@/lib/types";
import type { Locale } from "@/lib/types";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { NAV_ITEMS } from "./nav";

const svg = { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, className: "h-4 w-4" } as const;
const SOCIALS: { key: "telegram" | "instagram" | "youtube" | "facebook"; label: string; icon: React.ReactNode }[] = [
  {
    key: "telegram",
    label: "Telegram",
    icon: (
      <svg {...svg}>
        <path d="M21.9 4.3 18.6 19.6c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.4l-4.7-1.5c-1-.3-1-1 .2-1.5L20.400 3.2c.9-.3 1.600.2 1.500 1.100Z" />
      </svg>
    ),
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: (
      <svg {...svg}>
        <path d="M7.500 2h9A5.500 5.500 0 0 1 22 7.500v9a5.500 5.500 0 0 1-5.500 5.500h-9A5.500 5.500 0 0 1 2 16.500v-9A5.500 5.500 0 0 1 7.500 2Zm0 2A3.500 3.500 0 0 0 4 7.500v9A3.500 3.500 0 0 0 7.500 20h9a3.500 3.500 0 0 0 3.500-3.500v-9A3.500 3.500 0 0 0 16.500 4h-9ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.300-3.300a1.200 1.200 0 1 1 0 2.400 1.200 1.200 0 0 1 0-2.400Z" />
      </svg>
    ),
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: (
      <svg {...svg}>
        <path d="M21.600 7.200a2.500 2.500 0 0 0-1.800-1.800C18.200 5 12 5 12 5s-6.200 0-7.800.4A2.500 2.500 0 0 0 2.400 7.200C2 8.800 2 12 2 12s0 3.200.4 4.800a2.500 2.500 0 0 0 1.800 1.800C5.800 19 12 19 12 19s6.200 0 7.800-.4a2.500 2.500 0 0 0 1.800-1.800c.4-1.600.4-4.800.4-4.800s0-3.200-.4-4.800ZM10 15V9l5.200 3L10 15Z" />
      </svg>
    ),
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: (
      <svg {...svg}>
        <path d="M13.500 22v-8.200h2.800l.5-3.300h-3.300V8.400c0-1 .4-1.700 1.800-1.700h1.600V3.800c-.3 0-1.300-.2-2.400-.2-2.500 0-4.100 1.500-4.100 4.200v2.700H7.600v3.300h2.800V22h3.100Z" />
      </svg>
    ),
  },
];

const DEFAULT_PHONES = ["+998 71 200 00 00"];
const DEFAULT_EMAIL = "info@example.com";

export async function Footer() {
  const [t, tn, locale, contact] = await Promise.all([
    getTranslations("footer"),
    getTranslations("nav"),
    getLocale(),
    getSiteContact(),
  ]);

  const address = tr(contact?.address, locale as Locale) || t("defaultAddress");
  const hours = tr(contact?.working_hours, locale as Locale) || t("defaultHours");
  const phones = contact?.phones?.length ? contact.phones : DEFAULT_PHONES;
  const email = contact?.email || DEFAULT_EMAIL;
  const socialLinks: Record<string, string> = contact ? contact.social_links ?? {} : DEMO_SETTINGS.social_links;
  // A bare domain root ("https://t.me/") means the handle was never filled in: hide the icon.
  const hasHandle = (u?: string) => {
    if (!u?.trim()) return false;
    try {
      const x = new URL(u.trim());
      return x.pathname.replace(/\/+$/, "").length > 0 || x.search.length > 1;
    } catch {
      return false;
    }
  };
  const socials = SOCIALS.filter((s) => hasHandle(socialLinks[s.key]));

  return (
    <footer data-site-footer className="mt-16 pb-6 pt-4">
      <div className="container-page">
        <div className="glass-strong rounded-3xl p-6 sm:p-10">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4 lg:col-span-1">
              <Logo />
              <p className="max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
              {socials.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("followUs")}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {socials.map((s) => (
                      <li key={s.key}>
                        <a
                          href={socialLinks[s.key]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-xs font-semibold transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          {s.icon}
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <nav aria-label={t("quickLinks")} className="lg:col-span-2">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t("quickLinks")}
              </h2>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {NAV_ITEMS.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="text-sm font-medium transition-colors hover:text-primary"
                    >
                      {tn(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t("contacts")}
              </h2>
              <address className="space-y-3 text-sm not-italic">
                <p className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <span className="sr-only">{t("address")}: </span>
                    {address}
                  </span>
                </p>
                {phones.map((p) => (
                  <p key={p} className="flex gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <a href={`tel:${p.replace(/[^+\d]/g, "")}`} className="hover:text-primary">
                      {p}
                    </a>
                  </p>
                ))}
                <p className="flex gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <a href={`mailto:${email}`} className="break-all hover:text-primary">
                    {email}
                  </a>
                </p>
                <p className="flex gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <span className="sr-only">{t("workingHours")}: </span>
                    {hours}
                  </span>
                </p>
              </address>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-5 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
            <div className="space-y-1">
              <p>
                &copy; {new Date().getFullYear()} Children&apos;s Academy. {t("rights")}
              </p>
              <p className="max-w-xl">{t("privacyNote")}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/privacy" className="font-semibold underline underline-offset-2 hover:text-primary">
                {t("privacy")}
              </Link>
              {/* plain anchor: /school is outside locale routing */}
              <NextLink href="/school" prefetch={false} rel="nofollow" className="font-semibold underline underline-offset-2 hover:text-primary">
                {t("schoolSystem")}
              </NextLink>
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
