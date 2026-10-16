"use client";

import { useEffect, useState } from "react";
import { Award, Flame, Star, Target, TrendingUp, Trophy, CalendarCheck, Sparkles } from "lucide-react";
import { Button, Card, cn, inputCls } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { BundleGate, useFamily, type Bundle } from "./FamilyProvider";
import { useLocalValue } from "./hooks";
import {
  bestAttendanceStreak, buildTimeline, computeBadges, currentAttendanceStreak, fmt, fmtGpa, fmtPct, goodGradeStreak, parseGoals, ratio, termTrend, type BadgeKey,
} from "./logic";
import { useDateFmt, useSubjectName } from "./useNames";
import { EmptyBox, PageTitle, Ring } from "./widgets";

const BADGE_ICON: Record<BadgeKey, typeof Star> = { perfect_week: CalendarCheck, star: Star, streak10: Flame, streak20: Flame, attendance95: Award, improver: TrendingUp, straight_a: Trophy };

export function FamilyProgress() {
  const { t } = useSchool();
  return (
    <>
      <PageTitle title={t("f_progress")} sub={t("f_progressSub")} />
      <BundleGate>{(b) => <Body b={b} />}</BundleGate>
    </>
  );
}

function Body({ b }: { b: Bundle }) {
  const { t } = useSchool();
  const { child } = useFamily();
  const df = useDateFmt();
  const subj = useSubjectName();
  const [raw, setRaw] = useLocalValue(`school-goals-${child.id}`);
  const goals = parseGoals(raw);
  const [avgDraft, setAvgDraft] = useState(String(goals.average));
  const [attDraft, setAttDraft] = useState(String(goals.attendance));
  useEffect(() => {
    const id = setTimeout(() => {
      setAvgDraft(String(goals.average));
      setAttDraft(String(goals.attendance));
    }, 0);
    return () => clearTimeout(id);
  }, [goals.average, goals.attendance]);

  const scores = b.grades.filter((g) => g.kind !== "term" && g.kind !== "year").map((g) => g.score);
  const streak = currentAttendanceStreak(b.att.days);
  const best = bestAttendanceStreak(b.att.days);
  const good = goodGradeStreak(scores, 4);
  const trend = termTrend(b.perf.trend.filter((p) => p.count > 0));
  const att = b.perf.attendance.percent;
  const avg = b.perf.overall_average;
  const badges = computeBadges({ days: b.att.days, scores, attendancePercent: att, trendDir: trend.dir });
  const timeline = buildTimeline(b.att.days, b.grades.map((g) => ({ date: g.date, score: g.score, subject_id: g.subject_id })));

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-3 gap-2">
          <Ring value={ratio(att, 100)} label={fmtPct(att)} sub={t("f_ringAttendance")} color="stroke-emerald-500" />
          <Ring value={ratio(avg, 5)} label={fmtGpa(avg)} sub={t("f_ringAverage")} color="stroke-indigo-600 dark:stroke-indigo-400" />
          <Ring value={ratio(avg, goals.average)} label={`${Math.round(ratio(avg, goals.average) * 100)}%`} sub={t("f_ringGoal")} color="stroke-fuchsia-400" />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4"><Flame className="size-8 text-orange-500" aria-hidden /><div><p className="text-2xl font-bold tabular-nums">{streak}</p><p className="text-xs text-slate-500 dark:text-slate-400">{t("f_streakDays")} ({t("f_best")}: {best})</p></div></Card>
        <Card className="flex items-center gap-3 p-4"><Star className="size-8 text-fuchsia-500" aria-hidden /><div><p className="text-2xl font-bold tabular-nums">{good}</p><p className="text-xs text-slate-500 dark:text-slate-400">{t("f_streakGrades")}</p></div></Card>
        <Card className="flex items-center gap-3 p-4"><TrendingUp className="size-8 text-emerald-500" aria-hidden /><div><p className="text-sm font-semibold">{trend.dir === "up" ? fmt(t("f_improved"), { delta: trend.delta.toFixed(2) }) : trend.dir === "down" ? t("f_keepGoing") : trend.dir === "flat" ? t("f_steady") : t("f_trendNone")}</p></div></Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("f_badges")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {badges.map((bd) => {
            const I = BADGE_ICON[bd.key];
            return (
              <li key={bd.key} className={cn("rounded-2xl border p-3 text-center", bd.earned ? "border-fuchsia-300 bg-fuchsia-50 dark:border-fuchsia-500/40 dark:bg-fuchsia-900/20" : "border-slate-200 opacity-70 dark:border-slate-800")}>
                <I className={cn("mx-auto size-8", bd.earned ? "text-fuchsia-500" : "text-slate-500 dark:text-slate-400")} aria-hidden />
                <p className="mt-1 text-sm font-semibold">{t(`f_badge_${bd.key}` as never)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{bd.earned ? t("f_earned") : `${bd.progress}/${bd.target}`}</p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Target className="size-4" />{t("f_goals")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("f_goalAverage")}</span><input type="number" step="0.1" min={2} max={5} className={cn(inputCls, "w-28")} value={avgDraft} onChange={(e) => setAvgDraft(e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("f_goalAttendance")}</span><input type="number" min={50} max={100} className={cn(inputCls, "w-28")} value={attDraft} onChange={(e) => setAttDraft(e.target.value)} /></label>
          <Button variant="gold" onClick={() => setRaw(JSON.stringify(parseGoals(JSON.stringify({ average: Number(avgDraft), attendance: Number(attDraft) }))))}>{t("save")}</Button>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {avg !== null && avg >= goals.average ? t("f_goalReached") : fmt(t("f_goalToGo"), { value: avg === null ? "-" : Math.max(0, goals.average - avg).toFixed(2) })}
          {" "}{att !== null && att >= goals.attendance ? t("f_goalAttReached") : ""}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("f_goalLocal")}</p>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4" />{t("f_timeline")}</h2>
        {timeline.length === 0 ? <EmptyBox text={t("f_noAchievements")} /> : (
          <ol className="relative space-y-3 border-l-2 border-fuchsia-300 pl-4 dark:border-fuchsia-500/40">
            {timeline.map((a, i) => (
              <li key={i} className="text-sm">
                <span className="absolute -left-[7px] mt-1.5 size-3 rounded-full bg-fuchsia-400" aria-hidden />
                <span className="text-xs text-slate-500 dark:text-slate-400">{df(a.date)}</span>
                <p>{a.kind === "five" ? fmt(t("f_tlFive"), { subject: subj(a.subject_id ?? "") }) : t("f_tlPerfectWeek")}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
