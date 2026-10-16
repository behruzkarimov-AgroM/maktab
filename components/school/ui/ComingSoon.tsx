"use client";

import { usePathname } from "next/navigation";
import { Construction } from "lucide-react";
import { navFor } from "@/lib/school/nav";
import type { UiKey } from "@/lib/school/i18n";
import { Card } from "./kit";
import { useSchool } from "./SchoolProvider";

/** Placeholder page body used until a phase 2 agent replaces the route with a real page. */
export function ComingSoon() {
  const { t, session } = useSchool();
  const pathname = usePathname();
  const item = session ? navFor(session.role).find((n) => n.href === pathname) : undefined;
  return (
    <div className="mx-auto max-w-2xl pt-10">
      <Card className="text-center">
        <Construction className="mx-auto mb-3 size-10 text-fuchsia-500" />
        <h1 className="text-xl font-bold">{item ? t(item.label as UiKey) : t("comingSoon")}</h1>
        <p className="mt-1 text-sm font-semibold text-fuchsia-600 dark:text-fuchsia-400">{t("comingSoon")}</p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{t("comingSoonText")}</p>
      </Card>
    </div>
  );
}
