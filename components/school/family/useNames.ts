"use client";

import { useCallback } from "react";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { useFamily } from "./FamilyProvider";

/** subject id -> name in the active language */
export function useSubjectName() {
  const { subjects } = useFamily();
  const { L } = useSchool();
  return useCallback((id: string) => L(subjects.find((s) => s.id === id)?.name) || "-", [subjects, L]);
}

const DATE_LOCALE = { uz: "uz-UZ", ru: "ru-RU", en: "en-GB" } as const;
/** "YYYY-MM-DD" -> localized short date */
export function useDateFmt() {
  const { lang } = useSchool();
  return useCallback(
    (date: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
      new Intl.DateTimeFormat(DATE_LOCALE[lang], { ...opts, timeZone: "UTC" }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`)),
    [lang],
  );
}
