"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t("toggle")}
      title={t("toggle")}
      className={cn(
        "glass relative inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-transform hover:scale-105 active:scale-95",
        className,
      )}
    >
      {/* Both icons rendered; CSS picks one so there is no flash / hydration mismatch. */}
      <Sun className="h-5 w-5 text-accent transition-all dark:hidden" aria-hidden="true" />
      <Moon className="hidden h-5 w-5 text-primary transition-all dark:block" aria-hidden="true" />
    </button>
  );
}
