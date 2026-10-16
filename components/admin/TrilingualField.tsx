"use client";

import { useState } from "react";
import { cn } from "@/lib/admin/cn";
import { LOCALES, type Locale, type LocalizedText } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { inputCls } from "./ui";

const EMPTY: LocalizedText = { uz: "", ru: "", en: "" };

/** `[UZ] [RU] [EN]` tabs for a LocalizedText value; red dot on tabs with a missing translation. */
export function TrilingualField({
  value,
  onChange,
  multiline,
  required,
  error,
  placeholder,
  rows = 4,
  id,
}: {
  value: LocalizedText | null | undefined;
  onChange: (v: LocalizedText) => void;
  multiline?: boolean;
  required?: boolean;
  error?: string;
  placeholder?: string;
  rows?: number;
  id?: string;
}) {
  const { t } = useAdmin();
  const [tab, setTab] = useState<Locale>("uz");
  const v = value ?? EMPTY;
  const anyFilled = LOCALES.some((l) => v[l]?.trim());
  const missing = (l: Locale) => !v[l]?.trim() && (required || anyFilled);
  const Tag = multiline ? "textarea" : "input";

  return (
    <div>
      <div role="tablist" className="mb-1.5 inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={tab === l}
            onClick={() => setTab(l)}
            title={missing(l) ? t("missingTranslation") : undefined}
            className={cn(
              "relative rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide transition",
              tab === l ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-300" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {l}
            {missing(l) && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" aria-label={t("missingTranslation")} />}
          </button>
        ))}
      </div>
      <Tag
        id={id}
        className={cn(inputCls, multiline && "resize-y", error && "border-red-400 focus:border-red-500 focus:ring-red-500/25")}
        {...(multiline ? { rows } : {})}
        value={v[tab] ?? ""}
        placeholder={placeholder ? `${placeholder} (${tab.toUpperCase()})` : tab.toUpperCase()}
        onChange={(e) => onChange({ ...EMPTY, ...v, [tab]: e.target.value })}
        lang={tab}
      />
    </div>
  );
}
