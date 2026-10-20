"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/types";

const noSubscribe = () => () => {};

const TEXT = {
  errorTitle: { uz: "Nimadir xato ketdi", ru: "Что-то пошло не так", en: "Something went wrong" },
  errorText: { uz: "Kutilmagan xatolik yuz berdi. Qayta urinib ko'ring.", ru: "Произошла непредвиденная ошибка. Попробуйте ещё раз.", en: "An unexpected error occurred. Please try again." },
  retry: { uz: "Qayta urinish", ru: "Повторить", en: "Try again" },
  home: { uz: "Bosh sahifaga", ru: "На главную", en: "Back to home" },
  nfTitle: { uz: "Sahifa topilmadi", ru: "Страница не найдена", en: "Page not found" },
  nfText: { uz: "Siz izlayotgan sahifa mavjud emas yoki ko'chirilgan.", ru: "Страница, которую вы ищете, не существует или была перемещена.", en: "The page you are looking for does not exist or has been moved." },
} as const satisfies Record<string, Record<Locale, string>>;

const KEYS = ["school-lang", "admin_lang"];

function detectLang(): Locale {
  try {
    const seg = window.location.pathname.split("/")[1];
    if (seg === "uz" || seg === "ru" || seg === "en") return seg;
    for (const k of KEYS) {
      const v = localStorage.getItem(k);
      if (v === "uz" || v === "ru" || v === "en") return v;
    }
  } catch {
    /* storage blocked */
  }
  return "uz";
}

/**
 * Self-contained, framework-free error / 404 card for the trees that have no next-intl provider
 * (/school, /admin, global-error). Language comes from the URL prefix or the portal's stored language.
 * Uses neutral inline-safe Tailwind classes only; works with or without the app shell around it.
 */
export function BoundaryCard({
  kind,
  home,
  onRetry,
  error,
  asMain,
}: {
  kind: "error" | "notFound";
  home: string;
  onRetry?: () => void;
  error?: Error & { digest?: string };
  /** render a <main> landmark (use when no portal shell with its own <main> wraps the card) */
  asMain?: boolean;
}) {
  const Wrapper = asMain ? "main" : "div";
  // read once on the client (server markup is Uzbek); URL and storage do not change while the card is shown
  const lang = useSyncExternalStore(noSubscribe, detectLang, () => "uz" as Locale);
  useEffect(() => {
    if (error) console.error(error);
  }, [error]);
  const isErr = kind === "error";
  return (
    <Wrapper className="flex min-h-[60vh] items-center justify-center p-6">
      <div role={isErr ? "alert" : undefined} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        {!isErr && (
          <p className="text-6xl font-extrabold text-indigo-600 dark:text-indigo-400" aria-hidden="true">
            404
          </p>
        )}
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">{isErr ? TEXT.errorTitle[lang] : TEXT.nfTitle[lang]}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{isErr ? TEXT.errorText[lang] : TEXT.nfText[lang]}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {isErr && onRetry && (
            <button type="button" onClick={onRetry} className="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
              {TEXT.retry[lang]}
            </button>
          )}
          {/* plain anchor on purpose: a full navigation also clears a broken client state */}
          <a href={home} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            {TEXT.home[lang]}
          </a>
        </div>
      </div>
    </Wrapper>
  );
}
