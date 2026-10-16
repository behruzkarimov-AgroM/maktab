import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";

export async function generateMetadata() {
  const t = await getTranslations("errors");
  return { title: t("notFoundTitle"), robots: { index: false, follow: false } };
}

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <section className="container-page section-y">
      <GlassCard strong className="mx-auto max-w-xl py-12 text-center">
        <p className="gradient-text font-display text-7xl font-extrabold sm:text-8xl" aria-hidden="true">
          404
        </p>
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{t("notFoundTitle")}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t("notFoundText")}</p>
        <Button href="/" size="lg" className="mt-8">
          {t("backHome")}
        </Button>
      </GlassCard>
    </section>
  );
}
