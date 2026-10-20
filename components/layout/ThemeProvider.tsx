"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useLocalStorage } from "@/lib/use-local-storage";

export type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "maktab-theme";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Inline script run before first paint (no flash). Inject in <head> of the root layout. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

function apply(theme: Theme): "light" | "dark" {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  return dark ? "dark" : "light";
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeSystem(cb: () => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // stored choice and OS preference are external stores: no mount effect, the server render uses "system" / light.
  // The <html> class itself is set before first paint by themeInitScript, and afterwards only by setTheme / an OS change.
  const [stored, store] = useLocalStorage(STORAGE_KEY);
  const theme: Theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia(DARK_QUERY).matches, () => false);
  const resolvedTheme: "light" | "dark" = theme === "dark" || (theme === "system" && systemDark) ? "dark" : "light";

  useEffect(() => {
    if (theme !== "system") return;
    return subscribeSystem(() => apply("system"));
  }, [theme]);

  const setTheme = useCallback(
    (t: Theme) => {
      store(t);
      apply(t);
    },
    [store],
  );

  const toggleTheme = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  }, [setTheme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
