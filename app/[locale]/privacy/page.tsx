import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };
type Section = { title: string; body: string[] };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "privacy", "/privacy");
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "privacy" });
  const sections = t.raw("sections") as Section[];

  return (
    <article className="container-page section-y">
      <div className="mx-auto max-w-3xl">
        <h1 className="gradient-text font-display text-2xl font-extrabold [overflow-wrap:anywhere] min-[420px]:text-3xl sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("intro")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("updated")}</p>
        <div className="mt-10 space-y-6">
          {sections.map((s, i) => (
            <section key={s.title} className="glass-strong rounded-2xl p-5 sm:p-6" aria-labelledby={`p-${i}`}>
              <h2 id={`p-${i}`} className="text-xl font-bold">
                {i + 1}. {s.title}
              </h2>
              {s.body.map((p) => (
                <p key={p} className="mt-3 leading-relaxed text-foreground/90">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}