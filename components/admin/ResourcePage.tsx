"use client";

import { ShieldOff } from "lucide-react";
import { canRead, RESOURCE_MAP } from "@/lib/admin/resources";
import { useAdmin } from "./AdminProvider";
import { ResourceDetail } from "./ResourceDetail";
import { ResourceList } from "./ResourceList";
import { SingletonEditor } from "./SingletonEditor";
import { Card, EmptyState } from "./ui";

export function ResourcePage({ resKey, id }: { resKey: string; id?: string }) {
  const { session, t } = useAdmin();
  const res = RESOURCE_MAP[resKey];
  if (!session || !canRead(res, session.role))
    return (
      <Card>
        <EmptyState>
          <ShieldOff className="size-8 text-slate-400" />
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">{t("noAccess")}</p>
          <p>{t("noAccessText")}</p>
        </EmptyState>
      </Card>
    );
  if (id) return <ResourceDetail resKey={resKey} id={id} />;
  if (res.singleton) return <SingletonEditor resKey={resKey} />;
  return <ResourceList res={res} />;
}
