"use client";

import Link from "next/link";
import { AlertTriangle, BellRing, BookOpenCheck, CalendarCheck, ChevronRight, Gauge, GraduationCap, Medal, Megaphone, Sparkles, Trophy } from "lucide-react";
import { sget } from "@/lib/school/client";
import type { Announcement, Notification } from "@/lib/school/types";
import { Badge, Card, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { BundleGate, childName, useFamily, type Bundle } from "./FamilyProvider";
import { useAsync } from "./hooks";
import { buildAlerts, countDays, fmt, fmtGpa, fmtPct, nextSchoolDay, termTrend, weekdayIso, type Alert } from "./logic";
import { NotificationItem } from "./NotificationItem";
import { useDateFmt, useSubjectName } from "./useNames";
import { EmptyBox, Kpi, PageTitle, STATUS_VIEW, TrendIcon } from "./widgets";
import { ATTENDANCE_LABEL } from "@/lib/school/i18n";

export function FamilyHome() {
  const { child, isStudent } = useFamily();
  const { t } = useSchool();
  return (
    <>
      <PageTitle
        title={isStudent ? fmt(t("f_hiStudent"), { name: child.first_name }) : fmt(t("f_hiParent"), { name: child.first_name })}
        sub={`${childName(child)} - ${child.class_name ?? "-"}`}
      />
      <BundleGate>{(b) => <HomeBody b={b} />}</BundleGate>
    </>
  );
}

function HomeBody({ b }: { b: Bundle }) {
  const { t } = useSchool();
  const { me, child, isStudent } = useFamily();
  const subj = useSubjectName();
  const df = useDateFmt();
  const today = me.today;

  const todayDay = b.att.days.find((d) => d.date === today);
  const lessonDate = nextSchoolDay(today);
  const todaySlots = b.slots.filter((s) => s.weekday === weekdayIso(lessonDate)).sort((a, z) => a.lesson_no - z.lesson_no);
  const homework = b.lessons.filter((l) => l.homework).sort((a, z) => (a.date < z.date ? 1 : -1)).slice(0, 4);

  const term = me.term;
  const termDays = term ? b.att.days.filter((d) => d.date >= term.start_date && d.date <= term.end_date) : [];
  const termAtt = countDays(termDays);
  const trend = termTrend(b.perf.trend.filter((p) => p.count > 0));
  const termAvg = term ? b.perf.trend.find((p) => p.term_id === term.id)?.average ?? null : null;

  const recentLow = b.grades.filter((g) => g.score <= 2 && g.date >= addDays(today, -14) && !["term", "year"].includes(g.kind)).slice(-3).reverse().map((g) => ({ subject_id: g.subject_id, date: g.date, score: g.score }));
  const unexcused = b.att.days.filter((d) => d.status === "absent" && d.date >= addDays(today, -14)).length;
  const alerts = buildAlerts({
    risk: b.perf.risk, streak: b.perf.attendance.streak, attendancePercent: b.perf.attendance.percent, average: b.perf.overall_average,
    todayStatus: todayDay?.status ?? null, recentLow, unexcusedRecent: unexcused,
  });

  const alertText = (a: Alert): string => {
    switch (a.kind) {
      case "absent_today": return fmt(t("f_alAbsentToday"), { name: child.first_name });
      case "streak": return fmt(t("f_alStreak"), { name: child.first_name, n: a.n });
      case "low_attendance": return fmt(t("f_alLowAtt"), { value: fmtPct(a.value) });
      case "low_average": return fmt(t("f_alLowAvg"), { value: fmtGpa(a.value) });
      case "low_grade": return fmt(t("f_alLowGrade"), { subject: subj(a.subject_id ?? ""), score: a.value, date: df(a.date ?? today) });
      default: return fmt(t("f_alUnexcused"), { n: a.n });
    }
  };

  return (
    <div className="space-y-4">
      {/* Today */}
      <Card className="overflow-hidden bg-gradient-to-br from-indigo-600 to-indigo-800 p-0 text-white dark:from-indigo-800 dark:to-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-100"><CalendarCheck className="size-4" />{t("f_todayCard")} - {df(today, { weekday: "long", day: "numeric", month: "long" })}</p>
            <div className="mt-2 flex items-center gap-2">
              {todayDay ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-900">
                  {(() => { const I = STATUS_VIEW[todayDay.status].icon; return <I className="size-4" aria-hidden />; })()}
                  {t(ATTENDANCE_LABEL[todayDay.status])}
                </span>
              ) : (
                <span className="rounded-full bg-white/15 px-3 py-1 text-sm">{t("f_notMarkedYet")}</span>
              )}
            </div>
          </div>
          <Link href="/school/family/schedule" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fuchsia-300 hover:underline">{t("navSchedule")}<ChevronRight className="size-4" /></Link>
        </div>
        <div className="grid gap-px bg-white/10 sm:grid-cols-2">
          <div className="bg-indigo-900/30 p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-indigo-100">{lessonDate === today ? t("f_todayLessons") : fmt(t("f_nextLessons"), { date: df(lessonDate, { weekday: "long" }) })}</p>
            {todaySlots.length === 0 ? (
              <p className="text-sm text-indigo-100">{t("f_noLessons")}</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {todaySlots.map((s) => (
                  <li key={s.id} className="flex items-baseline gap-2">
                    <span className="w-11 shrink-0 tabular-nums text-indigo-200">{s.start_time.slice(0, 5)}</span>
                    <span className="font-medium">{subj(s.subject_id)}</span>
                    {s.room && <span className="ml-auto text-xs text-indigo-200">{s.room}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="bg-indigo-900/30 p-4">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-indigo-100"><BookOpenCheck className="size-4" />{t("f_homework")}</p>
            {homework.length === 0 ? (
              <p className="text-sm text-indigo-100">{t("f_noHomework")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {homework.slice(0, 3).map((l) => (
                  <li key={l.id}><span className="font-medium">{subj(l.subject_id)}</span> <span className="text-indigo-200">({df(l.date)})</span>: {l.homework}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("f_kpiAttendance")} value={fmtPct(termAtt.percent)} hint={term ? `${term.name}` : undefined} icon={<Gauge className="size-4" />} tone={termAtt.percent !== null && termAtt.percent < 85 ? "red" : "green"} />
        <Kpi label={t("f_kpiTermAvg")} value={fmtGpa(termAvg)} hint={<span className="inline-flex items-center gap-1"><TrendIcon dir={trend.dir} />{trend.dir === "none" ? t("f_trendNone") : trend.dir === "flat" ? t("f_trendFlat") : `${trend.delta > 0 ? "+" : ""}${trend.delta.toFixed(2)}`}</span>} icon={<GraduationCap className="size-4" />} tone="navy" />
        <Kpi label={t("f_kpiRank")} value={b.perf.rank_in_class ? `${b.perf.rank_in_class}/${b.perf.class_size}` : "-"} hint={t("f_inClass")} icon={<Medal className="size-4" />} tone="gold" />
        <Kpi label={t("f_kpiGpa")} value={fmtGpa(b.perf.gpa)} hint={fmtPct(b.perf.percent)} icon={<Trophy className="size-4" />} tone="navy" />
      </div>

      {/* Alerts */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-amber-500" />{t("f_alerts")}</h2>
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"><Sparkles className="size-4 shrink-0" />{isStudent ? t("f_allGoodStudent") : t("f_allGood")}</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className={cn("flex items-start gap-2 rounded-xl p-3 text-sm", a.severity === "high" ? "bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-100" : "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100")}>
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{alertText(a)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AnnouncementsCard />
        <NotificationsCard />
      </div>
    </div>
  );
}

function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function AnnouncementsCard() {
  const { t } = useSchool();
  const df = useDateFmt();
  const a = useAsync("home-ann", () => sget<{ announcements: Announcement[] }>("/announcements?limit=4"));
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Megaphone className="size-4 text-fuchsia-500" />{t("navAnnouncements")}</h2>
        <Link href="/school/family/announcements" className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">{t("f_seeAll")}</Link>
      </div>
      {a.loading ? <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : a.error ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("errorGeneric")}</p> : !a.data?.announcements.length ? <EmptyBox text={t("f_noAnnouncements")} /> : (
        <ul className="space-y-2">
          {a.data.announcements.map((x) => (
            <li key={x.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
              <p className="flex items-center gap-2 text-sm font-semibold">{x.pinned && <Badge tone="amber">{t("f_pinned")}</Badge>}{x.title}</p>
              <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{x.body}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{df(x.publish_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NotificationsCard() {
  const { t } = useSchool();
  const n = useAsync("home-notif", () => sget<{ unread: number; items: Notification[] }>("/notifications?limit=6"));
  const items = (n.data?.items ?? []).filter((x) => x.type !== "excuse_sent").slice(0, 4);
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="size-4 text-indigo-500" />{t("navNotifications")}
          {!!n.data?.unread && <span className="rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{n.data.unread}<span className="sr-only"> {t("f_unread")}</span></span>}
        </h2>
        <Link href="/school/family/notifications" className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">{t("f_seeAll")}</Link>
      </div>
      {n.loading ? <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : n.error ? <p className="text-sm text-slate-500 dark:text-slate-400">{t("errorGeneric")}</p> : !items.length ? <EmptyBox text={t("f_noNotifications")} /> : (
        <ul className="space-y-2">{items.map((x) => <NotificationItem key={x.id} n={x} />)}</ul>
      )}
    </Card>
  );
}
