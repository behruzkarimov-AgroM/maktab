"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";

/** Error boundary for every public page (rendered inside the locale layout, so header/footer stay). */
export default function LocaleError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const t = useTranslations("errors");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="container-page section-y">
      <GlassCard strong className="mx-auto max-w-xl py-12 text-center" role="alert">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("somethingWrong")}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t("tryAgain")}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => (retry ?? reset)?.()}>
            {t("retryButton")}
          </Button>
          <Button href="/" size="lg" variant="outline">
            {t("backHome")}
          </Button>
        </div>
      </GlassCard>
    </section>
  );
}
