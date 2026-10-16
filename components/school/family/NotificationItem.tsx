"use client";

import { Bell, CalendarX2, CheckCircle2, Megaphone, XCircle } from "lucide-react";
import type { Notification } from "@/lib/school/types";
import { cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { fmt } from "./logic";
import { useDateFmt } from "./useNames";

/** one notification row (text built from the type + payload; never raw JSON) */
export function NotificationItem({ n }: { n: Notification }) {
  const { t } = useSchool();
  const df = useDateFmt();
  const p = n.payload;
  const resolved = n.type === "excuse_resolved";
  const rejected = resolved && p.status === "rejected";
  const Icon = n.type === "absence" ? CalendarX2 : n.type === "announcement" ? Megaphone : resolved ? (rejected ? XCircle : CheckCircle2) : Bell;
  const text =
    n.type === "absence"
      ? fmt(t("f_notAbsence"), { name: String(p.student_name ?? ""), date: p.date ? df(String(p.date)) : "" })
      : n.type === "announcement"
        ? String(p.title ?? t("navAnnouncements"))
        : resolved
          ? fmt(t(rejected ? "a_not_excuse_rejected" : "a_not_excuse_accepted"), { name: String(p.student_name ?? ""), date: p.date ? df(String(p.date)) : "" })
          : t("f_notGeneric");
  return (
    <li className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", n.read_at ? "border-slate-100 dark:border-slate-800" : "border-indigo-200 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-900/20")}>
      <Icon className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn(!n.read_at && "font-semibold")}>{text}{resolved && p.by ? <span className="font-normal text-slate-600 dark:text-slate-300"> - {String(p.by)}</span> : null}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{df(n.created_at)}</p>
      </div>
      {!n.read_at && <span className="mt-1 size-2 shrink-0 rounded-full bg-red-600" role="img" aria-label={t("f_unread")} />}
    </li>
  );
}
