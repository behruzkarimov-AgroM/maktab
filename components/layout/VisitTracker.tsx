"use client";

import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Lightweight page-view beacon -> POST /api/visit (once per path per browser session). */
export function VisitTracker() {
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => {
    if (!pathname) return;
    try {
      const key = `visit:${pathname}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    const body = JSON.stringify({ path: pathname, locale });
    try {
      fetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [pathname, locale]);

  return null;
}
