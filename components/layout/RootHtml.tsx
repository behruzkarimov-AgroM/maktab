import { Montserrat, Nunito } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider, themeInitScript } from "@/components/layout/ThemeProvider";
import "@/app/globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  display: "swap",
  weight: ["600", "700", "800"],
});

/**
 * Shared <html>/<body> shell. There is no app/layout.tsx: each top-level route tree
 * (app/[locale] and app/admin) is its own root layout, so <html lang> is rendered
 * correctly on the server (e.g. /ru -> lang="ru").
 */
export function RootHtml({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${nunito.variable} ${montserrat.variable} antialiased`}
    >
      {/*
        No manual <head>: a hand-written <head> next to Next's streamed metadata made React re-create the
        whole document on hydration (minified error #418, intermittent in production). The theme script runs
        synchronously as the first body child, i.e. before anything is painted, so there is no flash.
      */}
      <body className="flex min-h-dvh flex-col" suppressHydrationWarning>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
