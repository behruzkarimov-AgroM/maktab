export type Locale = "uz" | "ru" | "en";
export const LOCALES: Locale[] = ["uz", "ru", "en"];
export const DEFAULT_LOCALE: Locale = "uz";

export type LocalizedText = Record<Locale, string>;

export type Difficulty = "easy" | "medium" | "hard";
export type UserRole = "super_admin" | "methodist" | "psychologist" | "teacher" | "student";
export type GradeCategory = "primary" | "middle" | "high";

export const emptyLocalized = (): LocalizedText => ({ uz: "", ru: "", en: "" });

/** Pick text for a locale, falling back to uz then any non-empty value. */
export function tr(text: Partial<LocalizedText> | null | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] || text.uz || text.en || text.ru || "";
}
