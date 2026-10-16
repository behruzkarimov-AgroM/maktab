import { describe, it, expect, vi } from "vitest";
import { rateLimit, demoAdd, demoList } from "@/app/api/games/leaderboard/store";
import { demoRegister, demoCheck, demoOlympiads, demoTicketIds } from "@/components/olympiad/demo";
import { escapeHtml } from "@/lib/telegram";
import { safeFileName } from "@/lib/pdf/canvas";
import { isActivePath } from "@/components/layout/nav";
import { buildDashboard } from "@/lib/admin/dashboard";
import { TICKET_RE } from "@/components/olympiad/types";

describe("leaderboard store", () => {
  it("rateLimit allows max then blocks, then recovers", () => {
    vi.useFakeTimers();
    const k = "k" + Math.random();
    expect(rateLimit(k, 2, 1000)).toBe(true);
    expect(rateLimit(k, 2, 1000)).toBe(true);
    expect(rateLimit(k, 2, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit(k, 2, 1000)).toBe(true);
    vi.useRealTimers();
  });
  it("demoList sorts by score desc, then faster time; respects limit and difficulty", () => {
    const slug = "schulte-table";
    demoAdd({ game_slug: slug, player_name: "T1", student_grade: 5, difficulty: "easy", score: 99999, completion_time_ms: 5000, accuracy_percent: 100 });
    demoAdd({ game_slug: slug, player_name: "T2", student_grade: 5, difficulty: "easy", score: 99999, completion_time_ms: 4000, accuracy_percent: 100 });
    const top = demoList(slug, "easy", 2);
    expect(top.map((r) => r.player_name)).toEqual(["T2", "T1"]);
    expect(demoList(slug, "hard", 3).every((r) => r.difficulty === "hard")).toBe(true);
    expect(demoList(slug, undefined, 1)).toHaveLength(1);
    expect(demoList("nonexistent", undefined, 5)).toEqual([]);
  });
});

describe("olympiad demo flow", () => {
  const o = demoOlympiads().find((x) => x.isRegistrationOpen)!;
  const input = (over = {}) => ({
    olympiadId: o.id, studentFullName: "Test Student", birthDate: "2013-01-01", currentSchool: "School 1",
    grade: o.eligibleGrades[0], subjectKey: o.subjects[0].key, parentPhone: "+998901234567", ...over,
  });
  it("registers an eligible student and issues a well-formed ticket", () => {
    const r = demoRegister(input());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ticket.ticket).toMatch(TICKET_RE);
  });
  it("rejects unknown olympiad, bad subject, ineligible grade", () => {
    expect(demoRegister(input({ olympiadId: "nope" }))).toEqual({ ok: false, error: "olympiad" });
    expect(demoRegister(input({ subjectKey: "zzz" }))).toEqual({ ok: false, error: "subject" });
    const bad = [1,2,3,4,5,6,7,8,9,10,11].find((g) => !o.eligibleGrades.includes(g));
    if (bad) expect(demoRegister(input({ grade: bad }))).toEqual({ ok: false, error: "grade" });
  });
  it("demo tickets are valid, result lookup is whitelisted, unknown -> null", () => {
    const ids = demoTicketIds();
    expect(ids.every((t) => TICKET_RE.test(t))).toBe(true);
    const res = ids.map(demoCheck).filter(Boolean);
    expect(res.length).toBeGreaterThan(0);
    expect(Object.keys(res[0]!).sort()).toEqual(["maxScore", "name", "rank", "score", "status", "subjectKey", "subjectName", "ticket"]);
    expect(demoCheck("OLY-0000-000000")).toBeNull();
  });
});

describe("misc helpers", () => {
  it("escapeHtml escapes &, <, > (Telegram HTML mode)", () => {
    expect(escapeHtml("<b>a & b</b>")).toBe("&lt;b&gt;a &amp; b&lt;/b&gt;");
    expect(escapeHtml("")).toBe("");
  });
  it("safeFileName keeps unicode letters, strips path chars, falls back", () => {
    expect(safeFileName("../Aziza Karimova!.pdf")).toBe("Aziza_Karimova_pdf");
    expect(safeFileName("Иван")).toBe("Иван");
    expect(safeFileName("///")).toBe("document");
  });
  it("isActivePath", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/about", "/")).toBe(false);
    expect(isActivePath("/games/schulte", "/games")).toBe(true);
    expect(isActivePath("/gamesx", "/games")).toBe(false);
  });
  it("buildDashboard aggregates with empty input", () => {
    const d = buildDashboard({ visits: [], attempts: [], olympiads: [], registrations: [], applications: [], leaderboardCount: 0, activeQuizzes: 0 }, true);
    expect(d.visitsPerDay).toHaveLength(30);
    expect(d.cards.visits30).toBe(0);
    expect(d.demo).toBe(true);
  });
  it("buildDashboard counts last-30-day visits and new applications", () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 100 * 86400000).toISOString();
    const d = buildDashboard({ visits: [{ created_at: now }, { created_at: now }, { created_at: old }], attempts: [], olympiads: [], registrations: [], applications: [{ status: "new", created_at: now }, { status: "done", created_at: now }], leaderboardCount: 0, activeQuizzes: 0 }, false);
    expect(d.cards.visits30).toBe(2);
    expect(d.cards.applicationsNew).toBe(1);
    expect(d.cards.applicationsTotal).toBe(2);
  });
});
