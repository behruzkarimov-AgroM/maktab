// Pure aggregation for the dashboard; fed by either the demo store or Supabase.
import type { L } from "./types";

export interface DashInput {
  visits: { created_at: string }[];
  attempts: { created_at: string }[];
  olympiads: { id: string | number; title: L }[];
  registrations: { olympiad_id: string | number; created_at: string; student_full_name?: string }[];
  applications: { status: string; created_at: string; parent_name?: string; child_name?: string; application_type?: string }[];
  leaderboardCount: number;
  activeQuizzes: number;
}

export interface DashData {
  cards: {
    visits30: number;
    visitsTrend: number; // % vs previous 30d
    attempts30: number;
    registrations: number;
    applicationsNew: number;
    applicationsTotal: number;
    leaderboardCount: number;
    activeQuizzes: number;
  };
  visitsPerDay: { date: string; visits: number }[];
  attemptsPerDay: { date: string; attempts: number }[];
  regsPerOlympiad: { name: L; count: number }[];
  appsByStatus: { status: string; count: number }[];
  appsOverTime: { date: string; count: number }[];
  recent: { type: "application" | "registration"; title: string; at: string; href: string }[];
  demo: boolean;
}

const dkey = (iso: string) => iso.slice(0, 10);
function lastDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
}

export function buildDashboard(i: DashInput, demo: boolean): DashData {
  const days30 = lastDays(30);
  const since30 = Date.now() - 30 * 86400000;
  const since60 = Date.now() - 60 * 86400000;
  const v30 = i.visits.filter((v) => +new Date(v.created_at) >= since30).length;
  const vPrev = i.visits.filter((v) => +new Date(v.created_at) >= since60 && +new Date(v.created_at) < since30).length;
  const count = (arr: { created_at: string }[], days: string[]) => {
    const m = new Map(days.map((d) => [d, 0]));
    for (const x of arr) {
      const k = dkey(x.created_at);
      if (m.has(k)) m.set(k, m.get(k)! + 1);
    }
    return days.map((d) => m.get(d)!);
  };
  const vc = count(i.visits, days30);
  const ac = count(i.attempts, days30);
  const days90 = lastDays(90);
  const appc = count(i.applications, days90);
  // weekly buckets for apps over time
  const weekly: { date: string; count: number }[] = [];
  for (let w = 0; w < days90.length; w += 7) {
    weekly.push({ date: days90[w], count: appc.slice(w, w + 7).reduce((a, b) => a + b, 0) });
  }
  const statuses = ["new", "contacted", "interview_scheduled", "accepted", "rejected"];
  const recent = [
    ...i.applications.map((a) => ({
      type: "application" as const,
      title: [a.parent_name, a.child_name].filter(Boolean).join(" / ") || a.application_type || "",
      at: a.created_at,
      href: "/admin/admission_applications",
    })),
    ...i.registrations.map((r) => ({
      type: "registration" as const,
      title: r.student_full_name ?? "",
      at: r.created_at,
      href: `/admin/olympiads/${r.olympiad_id}`,
    })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 8);

  return {
    cards: {
      visits30: v30,
      visitsTrend: vPrev ? Math.round(((v30 - vPrev) / vPrev) * 100) : 0,
      attempts30: ac.reduce((a, b) => a + b, 0),
      registrations: i.registrations.length,
      applicationsNew: i.applications.filter((a) => a.status === "new").length,
      applicationsTotal: i.applications.length,
      leaderboardCount: i.leaderboardCount,
      activeQuizzes: i.activeQuizzes,
    },
    visitsPerDay: days30.map((date, k) => ({ date, visits: vc[k] })),
    attemptsPerDay: days30.map((date, k) => ({ date, attempts: ac[k] })),
    regsPerOlympiad: i.olympiads.map((o) => ({
      name: o.title,
      count: i.registrations.filter((r) => String(r.olympiad_id) === String(o.id)).length,
    })),
    appsByStatus: statuses.map((status) => ({ status, count: i.applications.filter((a) => a.status === status).length })),
    appsOverTime: weekly,
    recent,
    demo,
  };
}
