import { getTranslations } from "next-intl/server";

/** Shown while a dynamic public page streams in. Reserves space so the footer does not jump. */
export default async function LocaleLoading() {
  const t = await getTranslations("common");
  return (
    <section className="container-page section-y" aria-busy="true">
      <p className="sr-only" role="status">
        {t("loading")}
      </p>
      <div className="animate-pulse space-y-4" aria-hidden="true">
        <div className="h-9 w-2/3 max-w-md rounded-xl bg-muted" />
        <div className="h-4 w-full max-w-xl rounded bg-muted" />
        <div className="h-4 w-5/6 max-w-lg rounded bg-muted" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    </section>
  );
}
