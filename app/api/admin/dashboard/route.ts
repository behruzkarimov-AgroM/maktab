import { NextResponse } from "next/server";
import { failResponse, getSession, jsonError } from "@/lib/admin/auth";
import { canRead, getResource } from "@/lib/admin/resources";
import { dashboard } from "@/lib/admin/store";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  try {
    const d = await dashboard();
    const can = (key: string) => {
      const r = getResource(key);
      return !!r && canRead(r, session.role);
    };
    // only expose the sections the caller may read in the CMS
    const regs = can("olympiad_registrations");
    const apps = can("admission_applications");
    const out = {
      ...d,
      cards: {
        ...d.cards,
        registrations: regs ? d.cards.registrations : 0,
        applicationsNew: apps ? d.cards.applicationsNew : 0,
        applicationsTotal: apps ? d.cards.applicationsTotal : 0,
        leaderboardCount: can("game_leaderboard") ? d.cards.leaderboardCount : 0,
        activeQuizzes: can("academic_quizzes") ? d.cards.activeQuizzes : 0,
        attempts30: can("academic_quizzes") ? d.cards.attempts30 : 0,
      },
      regsPerOlympiad: regs ? d.regsPerOlympiad : [],
      appsByStatus: apps ? d.appsByStatus : d.appsByStatus.map((x) => ({ ...x, count: 0 })),
      appsOverTime: apps ? d.appsOverTime : [],
      attemptsPerDay: can("academic_quizzes") ? d.attemptsPerDay : d.attemptsPerDay.map((x) => ({ ...x, attempts: 0 })),
      recent: d.recent.filter((x) => (x.type === "registration" ? regs : apps)),
    };
    return NextResponse.json(out);
  } catch (e) {
    return failResponse(e, "admin:dashboard");
  }
}
