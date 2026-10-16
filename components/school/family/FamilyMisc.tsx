"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Check, Phone, UserRound } from "lucide-react";
import { qs, sget, spost } from "@/lib/school/client";
import type { Announcement, Guardian, Notification } from "@/lib/school/types";
import { LOCALES } from "@/lib/types";
import { Badge, Button, Card, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { ROLE_LABEL } from "@/lib/school/i18n";
import { BundleGate, childName, useFamily } from "./FamilyProvider";
import { AccountPanel } from "@/components/school/ui/AccountPanel";
import { useAsync, useErrorText } from "./hooks";
import { fmtGpa, fmtPct } from "./logic";
import { NotificationItem } from "./NotificationItem";
import { useDateFmt } from "./useNames";
import { EmptyBox, ErrorBox, PageSkeleton, PageTitle } from "./widgets";

/* ------------------------------ children ------------------------------ */
export function FamilyChildren() {
  const { t } = useSchool();
  const { children, childId, setChildId, isStudent } = useFamily();
  return (
    <>
      <PageTitle title={isStudent ? t("f_myProfile") : t("navChildren")} />
      <div className="grid gap-3 sm:grid-cols-2">
        {children.map((c) => (
          <Card key={c.id} className={cn(c.id === childId && "ring-2 ring-indigo-500")}>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-full bg-fuchsia-400 text-lg font-bold text-slate-900">{c.first_name.slice(0, 1)}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{childName(c)}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("class")}: {c.class_name ?? "-"} - {c.student_code}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-sm">
              <span>{t("navAttendance")}: <b>{fmtPct(c.attendance_percent)}</b></span>
              <span>{t("average")}: <b>{fmtGpa(c.average)}</b></span>
            </div>
            <div className="mt-3 flex gap-2">
              {c.id !== childId && <Button size="sm" onClick={() => setChildId(c.id)}>{t("f_select")}</Button>}
              <Link className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300" href="/school/family">{t("navDashboard")}</Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ------------------------------ announcements ------------------------------ */
export function FamilyAnnouncements() {
  const { t } = useSchool();
  const df = useDateFmt();
  const errText = useErrorText();
  const a = useAsync("ann", () => sget<{ announcements: Announcement[] }>("/announcements?limit=50"));
  return (
    <>
      <PageTitle title={t("navAnnouncements")} />
      {a.loading ? <PageSkeleton /> : a.error ? <ErrorBox message={errText(a.error)} onRetry={a.reload} /> : !a.data?.announcements.length ? <EmptyBox text={t("f_noAnnouncements")} /> : (
        <ul className="space-y-3">
          {a.data.announcements.map((x) => (
            <li key={x.id}>
              <Card>
                <p className="flex items-center gap-2 font-semibold">{x.pinned && <Badge tone="amber">{t("f_pinned")}</Badge>}{x.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{x.body}</p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{df(x.publish_at, { day: "numeric", month: "long", year: "numeric" })}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ------------------------------ notifications ------------------------------ */
export function FamilyNotifications() {
  const { t } = useSchool();
  const errText = useErrorText();
  const n = useAsync("notifs", () => sget<{ unread: number; items: Notification[] }>("/notifications?limit=100"));
  const [busy, setBusy] = useState(false);
  const items = (n.data?.items ?? []).filter((x) => x.type !== "excuse_sent");
  async function readAll() {
    setBusy(true);
    try {
      await spost("/notifications", { all: true });
      n.reload();
    } catch {
      /* the list reload below shows the real state */
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title={t("navNotifications")} right={!!n.data?.unread && <Button size="sm" loading={busy} onClick={readAll}><Check className="size-4" />{t("f_markAllRead")} ({n.data.unread})</Button>} />
      {n.loading ? <PageSkeleton /> : n.error ? <ErrorBox message={errText(n.error)} onRetry={n.reload} /> : !items.length ? <EmptyBox text={t("f_noNotifications")} icon={<BellRing className="size-8 opacity-60" />} /> : (
        <ul className="space-y-2">{items.map((x) => <NotificationItem key={x.id} n={x} />)}</ul>
      )}
    </>
  );
}

/* ------------------------------ profile & settings ------------------------------ */
export function FamilyProfile() {
  const { t, session, lang, setLang } = useSchool();
  const { isStudent } = useFamily();
  return (
    <>
      <PageTitle title={t("f_profile")} />
      <div className="space-y-4">
        <Card>
          <div className="flex items-center gap-3">
            <UserRound className="size-10 rounded-full bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200" aria-hidden />
            <div><p className="font-semibold">{session?.name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{session?.email} - {session ? t(ROLE_LABEL[session.role]) : ""}</p></div>
          </div>
        </Card>
        {!isStudent && <BundleGate>{() => <Guardians />}</BundleGate>}
        <Card>
          <h2 className="mb-2 text-sm font-semibold">{t("language")}</h2>
          <div className="flex gap-2" role="group" aria-label={t("language")}>
            {LOCALES.map((l) => <Button key={l} size="sm" className="min-w-11" variant={lang === l ? "primary" : "secondary"} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</Button>)}
          </div>
        </Card>
        <AccountPanel />
        <Card>
          <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">{t("f_telegramHelp")}</div>
        </Card>
      </div>
    </>
  );
}

function Guardians() {
  const { t } = useSchool();
  const { child } = useFamily();
  const g = useAsync(`g:${child.id}`, () => sget<{ guardians: (Guardian & { student_ids?: string[] })[] }>(`/guardians${qs({ student_id: child.id })}`));
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold">{t("f_guardians")} - {child.first_name}</h2>
      {g.loading ? <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : g.error || !g.data?.guardians.length ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("f_noGuardians")}</p> : (
        <ul className="space-y-2">
          {g.data.guardians.map((x) => (
            <li key={x.id} className="rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800">
              <p className="font-medium">{x.full_name} <Badge>{x.relation}</Badge></p>
              {x.phone && <p className="flex items-center gap-1 text-slate-500 dark:text-slate-400"><Phone className="size-3" aria-hidden />{x.phone}</p>}
              {x.email && <p className="text-slate-500 dark:text-slate-400">{x.email}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("f_contactChange")}</p>
    </Card>
  );
}
