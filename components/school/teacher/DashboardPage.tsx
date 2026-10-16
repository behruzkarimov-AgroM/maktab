"use client";

import Link from "next/link";
import { BookOpen, CheckSquare, ClipboardCheck, FileCheck2, Megaphone, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, cn } from "@/components/school/ui/kit";
import { RISK_LABEL } from "@/lib/school/i18n";
import type { Announcement } from "@/lib/school/types";
import { useExcuseCount } from "./ExcusesInbox";
import { EmptyState, fmtDate, Gate, hhmm, PageHead, useApi, useBase, type Base } from "./common";
import { useTT } from "./use-tt";

const T = "/school/teacher";

export function DashboardPage() {
  const state = useBase();
  return <Gate state={state}>{(b) => <Dash b={b} />}</Gate>;
}

function Dash({ b }: { b: Base }) {
  const { tt, t, L, session } = useTT();
  const ann = useApi<{ announcements: Announcement[] }>("/announcements?limit=4");
  const notif = useApi<{ unread: number }>("/notifications?unread=1&limit=1");
  const pendingExcuses = useExcuseCount().pending;
  const { ov } = b;
  const subj = (id: string) => L(b.subjects.find((s) => s.id === id)?.name);
  const homeroom = ov.classes.filter((c) => c.homeroom);
  const pendingTerms = ov.pending_terms.filter((p) => p.confirmed < p.total);
  const unmarked = ov.classes.filter((c) => !c.marked_today);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHead title={`${tt("dash_hello")}, ${session?.name.split(" ")[0] ?? ""}`} sub={`${tt("today")}: ${fmtDate(ov.today)}${ov.term ? ` · ${ov.term.name}` : ""}`} actions={
        <>
          <Link href={`${T}/attendance`}><Button variant="primary" className="min-h-11"><CheckSquare className="size-4" />{tt("att_title")}</Button></Link>
          <Link href={`${T}/journal`}><Button className="min-h-11"><BookOpen className="size-4" />{tt("jr_title")}</Button></Link>
        </>
      } />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tt("dash_classes")} value={ov.classes.length} />
        <Stat label={tt("dash_students")} value={ov.classes.reduce((n, c) => n + c.student_count, 0)} />
        <Stat label={tt("dash_pendingAtt")} value={unmarked.length} tone={unmarked.length ? "amber" : "green"} />
        <Stat label={tt("dash_atRisk")} value={ov.risk.length} tone={ov.risk.length ? "red" : "green"} />
      </div>

      {pendingExcuses ? (
        <Link href={`${T}/announcements?tab=excuses`} data-testid="excuse-banner" className="flex min-h-14 items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <FileCheck2 className="size-5 shrink-0" aria-hidden />
          {t("a_ex_open").replace("{n}", String(pendingExcuses))}
        </Link>
      ) : null}

      <section aria-labelledby="h-lessons">
        <h2 id="h-lessons" className="mb-2 text-base font-bold">{tt("dash_todayLessons")}</h2>
        {ov.today_lessons.length === 0 ? (
          <EmptyState text={tt("dash_noLessons")} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {ov.today_lessons.map((l) => (
              <li key={l.slot.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400">#{l.slot.lesson_no} · {hhmm(l.slot.start_time)}–{hhmm(l.slot.end_time)}{l.slot.room ? ` · ${l.slot.room}` : ""}</p>
                      <p className="truncate text-base font-bold">{l.class_name} · {subj(l.slot.subject_id)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={l.attendance_marked ? "green" : "amber"}>{l.attendance_marked ? tt("dash_attDone") : tt("dash_attTodo")}</Badge>
                      <Badge tone={l.lesson_filled ? "green" : "gray"}>{l.lesson_filled ? tt("dash_topicDone") : tt("dash_topicTodo")}</Badge>
                    </div>
                  </div>
                  {l.topic && <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{l.topic}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`${T}/attendance?class=${l.slot.class_id}`}><Button size="sm" className="min-h-11"><CheckSquare className="size-4" />{tt("att_title")}</Button></Link>
                    <Link href={`${T}/journal?class=${l.slot.class_id}&subject=${l.slot.subject_id}&tab=lessons`}><Button size="sm" className="min-h-11"><ClipboardCheck className="size-4" />{tt("jr_tabLessons")}</Button></Link>
                    <Link href={`${T}/journal?class=${l.slot.class_id}&subject=${l.slot.subject_id}`}><Button size="sm" className="min-h-11"><BookOpen className="size-4" />{tt("jr_title")}</Button></Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="h-home">
          <h2 id="h-home" className="mb-2 text-base font-bold">{tt("dash_homeroom")}</h2>
          {homeroom.length === 0 ? <EmptyState text={tt("noData")} /> : (
            <ul className="space-y-2">
              {homeroom.map((c) => (
                <li key={c.id}>
                  <Link href={`${T}/attendance?class=${c.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900">
                    <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 font-bold text-white">{c.name}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      {c.marked_today ? (
                        <span>{t("stPresent")} {c.today.counts.present + c.today.counts.late} · {t("stAbsent")} {c.today.counts.absent} · {t("stSick")}/{t("stExcused")} {c.today.counts.sick + c.today.counts.excused}</span>
                      ) : <span className="text-amber-700 dark:text-amber-300">{tt("dash_notMarked")}</span>}
                    </span>
                    <Badge tone={c.marked_today ? "green" : "amber"}>{c.marked_today ? tt("att_stateSaved") : tt("att_stateNotMarked")}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="h-terms">
          <h2 id="h-terms" className="mb-2 text-base font-bold">{tt("dash_pendingTerms")}</h2>
          {pendingTerms.length === 0 ? <EmptyState text={tt("dash_allConfirmed")} /> : (
            <ul className="space-y-2">
              {pendingTerms.map((p) => (
                <li key={`${p.class_id}${p.subject_id}`}>
                  <Link href={`${T}/journal?class=${p.class_id}&subject=${p.subject_id}&tab=term`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.class_name} · {subj(p.subject_id)}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-emerald-500" style={{ width: `${p.total ? (p.confirmed / p.total) * 100 : 0}%` }} /></div>
                    </div>
                    <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{p.confirmed}/{p.total}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="h-risk">
          <h2 id="h-risk" className="mb-2 flex items-center gap-1.5 text-base font-bold"><TriangleAlert className="size-4 text-red-500" />{tt("dash_atRisk")}</h2>
          {ov.risk.length === 0 ? <EmptyState text={tt("dash_noRisk")} /> : (
            <ul className="space-y-2">
              {ov.risk.slice(0, 8).map((r) => (
                <li key={r.student_id}>
                  <Link href={`${T}/classes?class=${r.class_id}&student=${r.student_id}`} className="block rounded-2xl border border-slate-200 bg-white p-3 hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{r.name} <span className="font-normal text-slate-500 dark:text-slate-400">{r.class_name}</span></p>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{r.attendance_percent ?? "–"}% · {r.average?.toFixed(2) ?? "–"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">{r.flags.map((f) => <Badge key={f} tone="red">{t(RISK_LABEL[f])}</Badge>)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="h-ann">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="h-ann" className="flex items-center gap-1.5 text-base font-bold"><Megaphone className="size-4" />{tt("navAnnouncements")}</h2>
            <Link href={`${T}/announcements`} className="inline-flex min-h-11 items-center text-sm text-indigo-700 hover:underline dark:text-indigo-300">{tt("viewAll")}{notif.data?.unread ? ` (${notif.data.unread})` : ""}</Link>
          </div>
          {!ann.data ? <EmptyState text={tt("loading")} /> : ann.data.announcements.length === 0 ? <EmptyState text={tt("noData")} /> : (
            <ul className="space-y-2">
              {ann.data.announcements.map((a) => (
                <li key={a.id} className={cn("rounded-2xl border p-3", a.pinned ? "border-fuchsia-400 bg-fuchsia-50/50 dark:bg-fuchsia-950/10" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900")}>
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "red" | "green" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "amber" && "text-amber-600", tone === "red" && "text-red-600", tone === "green" && "text-emerald-600")}>{value}</p>
    </Card>
  );
}
