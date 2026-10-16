"use client";

import { useState } from "react";
import { Brain, ClipboardList, FileQuestion, Gamepad2, ShieldOff } from "lucide-react";
import { KIND_RESOURCE, type ImportKind } from "@/lib/admin/import/types";
import { canWrite, getResource } from "@/lib/admin/resources";
import type { UIKey } from "@/lib/admin/ui-i18n";
import { useAdmin } from "./AdminProvider";
import { ImportDialog } from "./ImportDialog";
import { Card, EmptyState, PageHeader } from "./ui";

const KINDS: { kind: ImportKind; Icon: typeof Brain }[] = [
  { kind: "quiz", Icon: FileQuestion },
  { kind: "psych", Icon: Brain },
  { kind: "survey", Icon: ClipboardList },
  { kind: "game", Icon: Gamepad2 },
];

/** Single entry page: pick what to import (only the types the signed-in role may create). */
export function ImportHub() {
  const { t, session } = useAdmin();
  const [kind, setKind] = useState<ImportKind | null>(null);
  const allowed = KINDS.filter(({ kind: k }) => {
    const res = getResource(KIND_RESOURCE[k]);
    return !!session && !!res && canWrite(res, session.role);
  });
  return (
    <div>
      <PageHeader title={t("imp_hub_title")} subtitle={t("imp_hub_text")} />
      {allowed.length === 0 ? (
        <Card>
          <EmptyState>
            <ShieldOff className="size-8 text-slate-400" />
            <p>{t("imp_no_kinds")}</p>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {allowed.map(({ kind: k, Icon }) => (
            <button
              key={k}
              type="button"
              data-testid={`import-kind-${k}`}
              onClick={() => setKind(k)}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-400 hover:shadow dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                <Icon className="size-6" />
              </span>
              <span>
                <span className="block text-base font-semibold text-slate-900 dark:text-slate-100">{t(`imp_kind_${k}` as UIKey)}</span>
                <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{t(`imp_kind_${k}_d` as UIKey)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {kind && <ImportDialog kind={kind} open onClose={() => setKind(null)} />}
    </div>
  );
}
