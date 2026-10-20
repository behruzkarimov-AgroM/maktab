"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { api } from "@/lib/admin/api";
import { cn } from "@/lib/admin/cn";
import { canWrite, RESOURCE_MAP } from "@/lib/admin/resources";
import type { Row } from "@/lib/admin/types";
import { tr } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { PsychBuilder, QuizQuestions } from "./Builders";
import { ResourceForm } from "./ResourceForm";
import { ResourceList } from "./ResourceList";
import { SurveyQuestions } from "./SurveyBuilder";
import { Button, Card, PageHeader, Spinner, Switch } from "./ui";

export function ResourceDetail({ resKey, id }: { resKey: string; id: string }) {
  const res = RESOURCE_MAP[resKey];
  const { t, L, lang, session, toast } = useAdmin();
  const router = useRouter();
  const [row, setRow] = useState<Row | null>(null);
  const [tab, setTab] = useState<"details" | "children">("details");
  const writable = !!session && canWrite(res, session.role);
  const creating = id === "new";
  // loading is derived: true from the moment the requested record changes until its response has arrived
  const reqKey = `${resKey}\u0000${id}`;
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const loading = !creating && doneKey !== reqKey;

  useEffect(() => {
    if (creating) return;
    let live = true;
    api
      .get(resKey, id)
      .then((r) => live && setRow(r), (e) => live && toast(e instanceof Error ? e.message : t("networkError"), "error"))
      .finally(() => live && setDoneKey(reqKey));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, creating]);

  const childLabel = res.detail === "olympiad" ? t("registrations") : res.detail === "psych" ? `${t("questions")} / ${t("scales")}` : t("questions");
  const heading = creating ? `${t("create")}: ${L(res.singular)}` : tr(row?.[res.titleField] as never, lang) || L(res.singular);

  async function setPublished(v: boolean) {
    if (!row) return;
    setRow({ ...row, is_results_published: v });
    try {
      await api.update(resKey, row.id, { is_results_published: v });
      toast(t("saved"));
    } catch (e) {
      setRow(row);
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    }
  }

  return (
    <div>
      <Link href={`/admin/${resKey}`} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="size-4" /> {L(res.label)}
      </Link>
      <PageHeader
        title={heading}
        actions={
          res.detail === "olympiad" && row ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!row.is_results_published} onChange={setPublished} disabled={!writable} label={t("publishResults")} />
              {t("publishResults")}
            </label>
          ) : res.detail === "survey" && row ? (
            <Link href={`/admin/surveys/${id}/results`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">
              <BarChart3 className="size-4" /> {L({ uz: "Natijalar", ru: "Результаты", en: "Results" })}
            </Link>
          ) : undefined
        }
      />
      {!creating && (
        <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {([["details", t("details")], ["children", childLabel]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", tab === k ? "bg-white shadow-sm dark:bg-slate-950" : "text-slate-500")}>
              {label}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === "details" || creating ? (
        <Card className="p-5">
          <ResourceForm
            res={res}
            initial={row}
            readOnly={!writable}
            bleed="-mx-5 -mb-5"
            onSaved={(saved) => {
              if (creating) router.replace(`/admin/${resKey}/${saved.id}`);
              else setRow(saved);
            }}
            onCancel={() => router.push(`/admin/${resKey}`)}
          />
        </Card>
      ) : res.detail === "quiz" ? (
        <QuizQuestions quizId={id} />
      ) : res.detail === "survey" ? (
        <SurveyQuestions surveyId={id} />
      ) : res.detail === "psych" ? (
        <PsychBuilder testId={id} />
      ) : res.detail === "olympiad" ? (
        <ResourceList res={RESOURCE_MAP.olympiad_registrations} fixed={{ olympiad_id: id }} embedded />
      ) : (
        <Button onClick={() => setTab("details")}>{t("back")}</Button>
      )}
    </div>
  );
}
