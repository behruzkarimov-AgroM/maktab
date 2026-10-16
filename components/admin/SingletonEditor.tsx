"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin/api";
import { canWrite, RESOURCE_MAP } from "@/lib/admin/resources";
import type { Row } from "@/lib/admin/types";
import { useAdmin } from "./AdminProvider";
import { ResourceForm } from "./ResourceForm";
import { Card, PageHeader, Spinner } from "./ui";

/** Editor for single-row tables (site_settings, id = 1). */
export function SingletonEditor({ resKey }: { resKey: string }) {
  const res = RESOURCE_MAP[resKey];
  const { L, t, session, toast } = useAdmin();
  const [row, setRow] = useState<Row | null | undefined>(undefined);

  useEffect(() => {
    api
      .list(resKey, { pageSize: 1 })
      .then((r) => setRow(r.rows[0] ?? null))
      .catch((e) => {
        toast(e instanceof Error ? e.message : t("networkError"), "error");
        setRow(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resKey]);

  return (
    <div>
      <PageHeader title={L(res.label)} subtitle={session && !canWrite(res, session.role) ? t("readOnly") : undefined} />
      {row === undefined ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <Card className="p-5">
          <ResourceForm res={res} initial={row ?? ({ id: 1 } as Row)} readOnly={!session || !canWrite(res, session.role)} bleed="-mx-5 -mb-5" onSaved={setRow} />
        </Card>
      )}
    </div>
  );
}
