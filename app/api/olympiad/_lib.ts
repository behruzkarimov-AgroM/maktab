/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminClient } from "@/lib/supabase/admin";
import * as sb from "@/lib/supabase/server";
import type { LocalizedText } from "@/lib/types";
import { demoCheck, demoLeaderboardRows, demoOlympiads, demoRegister, demoTicketIds } from "@/components/olympiad/demo";
import { shortName, type IssuedTicket, type LeaderGroup, type LeaderRow, type Olympiad, type PublicResult, type RegistrationInput } from "@/components/olympiad/types";

/**
 * null ONLY in demo mode (Supabase not configured). When Supabase is configured but the client cannot
 * be created this throws, so callers answer 5xx instead of silently serving demo data / fake tickets.
 */
export async function getDb(): Promise<any | null> {
  if (!sb.isSupabaseConfigured()) return null;
  const c = await sb.getServerClient();
  if (!c) throw new Error("supabase_unavailable");
  return c;
}

/** Service-role client for RPCs that are NOT executable by anon (result lookup, leaderboard). */
function getPrivDb(): any {
  const c = getAdminClient();
  if (!c) throw new Error("service_role_required");
  return c;
}

/** @deprecated Routes use `enforceRateLimit` from lib/rate-limit.ts. Kept (in-memory, per instance) because tests/quiz.test.ts imports it. */
const hits = new Map<string, number[]>();
export function rateLimited(req: Request, bucket: string, max: number, windowMs: number): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

const loc = (v: any): LocalizedText => ({ uz: v?.uz ?? "", ru: v?.ru ?? "", en: v?.en ?? "" });

function mapOlympiad(r: any): Olympiad {
  return {
    id: String(r.id),
    title: loc(r.title),
    description: loc(r.description),
    rules: r.rules ? loc(r.rules) : null,
    subjects: Array.isArray(r.subjects) ? r.subjects.map((s: any) => ({ key: String(s.key), name: loc(s.name) })) : [],
    eligibleGrades: Array.isArray(r.eligible_grades) ? r.eligible_grades.map(Number) : [],
    eventDate: r.event_date,
    registrationDeadline: r.registration_deadline,
    location: loc(r.location),
    isRegistrationOpen: !!r.is_registration_open,
    isResultsPublished: !!r.is_results_published,
  };
}

export async function listOlympiads(): Promise<{ demo: boolean; demoTickets?: string[]; olympiads: Olympiad[] }> {
  const db = await getDb();
  if (!db) return { demo: true, demoTickets: demoTicketIds(), olympiads: demoOlympiads() };
  const { data, error } = await db.from("olympiads").select("*").order("event_date", { ascending: true });
  if (error) throw new Error(error.message);
  return { demo: false, olympiads: (data ?? []).map(mapOlympiad) };
}

export type RegisterError = "olympiad" | "closed" | "deadline" | "grade" | "subject" | "duplicate" | "tooMany" | "invalid" | "unavailable" | "server";

export async function registerForOlympiad(
  input: RegistrationInput,
): Promise<{ ok: true; ticket: IssuedTicket } | { ok: false; error: RegisterError }> {
  // writes go through the service role only (anon EXECUTE on register_olympiad is revoked, see docs/AUDIT-SCHEMA-REQUESTS.md)
  if (!sb.isSupabaseConfigured()) return demoRegister(input);
  const db = getAdminClient();
  if (!db) return { ok: false, error: "unavailable" };

  // Parameter names follow DB-OUTLINE; adjust here if schema.sql differs.
  const { data, error } = await db.rpc("register_olympiad", {
    p_olympiad_id: input.olympiadId,
    p_student_full_name: input.studentFullName,
    p_birth_date: input.birthDate,
    p_current_school: input.currentSchool,
    p_grade: input.grade,
    p_subject_key: input.subjectKey,
    p_parent_phone: input.parentPhone,
    p_extra_phone: input.extraPhone || null,
  });
  // returns jsonb object: { ticket_number, qr_code_payload, student_full_name, current_school, grade, subject_key, olympiad:{id,...} }
  if (error) {
    const m = String(error.message || "").toLowerCase();
    if (m.includes("registration_closed")) return { ok: false, error: "closed" };
    if (m.includes("grade_not_eligible")) return { ok: false, error: "grade" };
    if (m.includes("invalid_subject")) return { ok: false, error: "subject" };
    if (m.includes("too_many_registrations")) return { ok: false, error: "tooMany" };
    if (m.includes("already_registered")) return { ok: false, error: "duplicate" };
    if (m.includes("not_found")) return { ok: false, error: "olympiad" };
    if (m.includes("invalid_input")) return { ok: false, error: "invalid" };
    if (error.code === "23503") return { ok: false, error: "olympiad" };
    return { ok: false, error: "server" };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const ticket = row?.ticket_number ?? row?.ticket;
  if (!ticket) return { ok: false, error: "server" };
  return {
    ok: true,
    ticket: {
      ticket: String(ticket),
      qrPayload: String(row.qr_code_payload ?? ticket),
      studentName: String(row.student_full_name ?? input.studentFullName),
      school: String(row.current_school ?? input.currentSchool),
      grade: Number(row.grade ?? input.grade),
      subjectKey: String(row.subject_key ?? input.subjectKey),
      olympiadId: String(row.olympiad?.id ?? input.olympiadId),
    },
  };
}

/** Top 5 per subject for a published olympiad (olympiad_leaderboard RPC, public-safe; names shortened here). */
export async function leaderboard(olympiadId: string): Promise<LeaderGroup[]> {
  let rows: LeaderRow[];
  if (!sb.isSupabaseConfigured()) {
    rows = demoLeaderboardRows(olympiadId);
  } else {
    const db = getPrivDb();
    const { data, error } = await db.rpc("olympiad_leaderboard", { p_olympiad_id: olympiadId });
    if (error) throw new Error(error.message);
    rows = (Array.isArray(data) ? data : []).map((r: any) => ({
      name: String(r.student_full_name ?? ""),
      subjectKey: String(r.subject_key ?? ""),
      score: Number(r.score),
      maxScore: Number(r.max_score ?? 100),
      rank: Number(r.rank_place),
    }));
  }
  const groups = new Map<string, LeaderGroup>();
  for (const r of rows.sort((a, b) => a.rank - b.rank)) {
    const g = groups.get(r.subjectKey) ?? { subjectKey: r.subjectKey, rows: [] };
    if (g.rows.length < 5) g.rows.push({ rank: r.rank, name: shortName(r.name), score: r.score, maxScore: r.maxScore });
    groups.set(r.subjectKey, g);
  }
  return [...groups.values()];
}

/** Returns only whitelisted public fields, and only for published results. */
export async function checkResult(ticket: string): Promise<PublicResult | null> {
  if (!sb.isSupabaseConfigured()) return demoCheck(ticket);
  const db = getPrivDb();
  const { data, error } = await db.rpc("check_olympiad_result", { p_ticket: ticket });
  if (error) throw new Error(error.message);
  const r = Array.isArray(data) ? data[0] : data;
  // The RPC already returns null for unpublished results; keep the check as defence in depth.
  if (!r || !r.results_published || r.score == null) return null;
  const status = ["pending", "confirmed", "attended", "disqualified"].includes(r.status) ? r.status : "pending";
  return {
    name: String(r.student_full_name ?? r.name ?? ""),
    ticket: String(r.ticket_number ?? ticket),
    subjectKey: r.subject_key ?? null,
    subjectName: null,
    status,
    score: Number(r.score),
    maxScore: Number(r.max_score ?? 100),
    rank: r.rank_place == null ? null : Number(r.rank_place),
  };
}
