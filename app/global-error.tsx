"use client";

import { BoundaryCard } from "@/components/layout/BoundaryCard";
import { themeInitScript } from "@/components/layout/ThemeProvider";
import "@/app/globals.css";

/** Last resort: replaces the root layout, so it brings its own <html>/<body> (no providers, no fonts). */
export default function GlobalError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <BoundaryCard asMain kind="error" home="/" error={error} onRetry={retry ?? reset} />
      </body>
    </html>
  );
}
