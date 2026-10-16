// Data access layer: Supabase (service role / user JWT) when configured, in-memory demo store otherwise.
// Callers MUST have passed lib/admin/auth.guard() first.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDashboard, type DashData } from "./dashboard";
import {
  demoCreate, demoDelete, demoDeleteWhere, demoExtra, demoGet, demoList, demoTable, demoUpdate, type ListParams,
} from "./demo-store";
import { getServiceClient, getUserClient, isConfigured } from "./supabase";
import type { L, ListResult, ResourceDef, Row } from "./types";

export type { ListParams };
const demo = () => !isConfigured();

async function db(): Promise<SupabaseClient> {
  return getServiceClient() ?? (await getUserClient());
}

const isLocField = (res: ResourceDef, name: string) =>
  res.fields.find((f) => f.name === name)?.type === "localized" ||
  res.fields.find((f) => f.name === name)?.type === "localizedArea" ||
  res.columns.find((c) => c.name === name)?.kind === "loc";

export class StoreError extends Error {
  override name = "StoreError";
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Postgres 23503 (foreign key) and 23505 (unique) become HTTP 409 so clients get a stable "conflict" code instead of a generic error. */
function storeErr(error: { message: string; code?: string }, status: number): StoreError {
  return new StoreError(error.message, error.code === "23503" || error.code === "23505" ? 409 : status);
}

export async function listRows(res: ResourceDef, p: ListParams): Promise<ListResult> {
  if (demo()) return demoList(res, p);
  const c = await db();
  let q = c.from(res.table).select("*", { count: "exact" });
  for (const [k, v] of Object.entries(p.filters ?? {})) if (v !== "" && v != null) q = q.eq(k, v);
  const term = p.q?.trim().replace(/[,()*%\\"'`:;]/g, " ").slice(0, 100);
  if (term && res.search.length) {
    q = q.or(res.search.map((f) => (isLocField(res, f) ? `${f}->>uz.ilike.*${term}*,${f}->>ru.ilike.*${term}*,${f}->>en.ilike.*${term}*` : `${f}.ilike.*${term}*`)).join(","));
  }
  const sortField = p.sort || res.sort.field;
  q = q.order(isLocField(res, sortField) ? `${sortField}->>uz` : sortField, { ascending: (p.dir || res.sort.dir) === "asc" });
  // unique tie-breaker so pages never overlap / skip rows
  if (sortField !== "id") q = q.order("id", { ascending: true });
  if (!p.all) {
    const size = Math.min(p.pageSize || res.pageSize || 15, 200);
    const page = Math.max(p.page || 1, 1);
    q = q.range((page - 1) * size, page * size - 1);
  } else q = q.limit(10000);
  const { data, error, count } = await q;
  if (error) throw new StoreError(error.message, 500);
  let rows = (data ?? []) as Row[];
  if (res.table === "profiles") rows = await withEmails(rows);
  return { rows, total: count ?? rows.length };
}

async function withEmails(rows: Row[]): Promise<Row[]> {
  const svc = getServiceClient();
  if (!svc) return rows;
  try {
    const m = new Map<string, string | undefined>();
    for (let page = 1; page <= 20; page++) {
      const { data } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
      const users = data?.users ?? [];
      users.forEach((u) => m.set(u.id, u.email));
      if (users.length < 1000) break;
    }
    return rows.map((r) => ({ ...r, email: m.get(String(r.id)) ?? "" }));
  } catch {
    return rows;
  }
}

export async function getRow(res: ResourceDef, id: string): Promise<Row | null> {
  if (demo()) return demoGet(res, id);
  const c = await db();
  const { data, error } = await c.from(res.table).select("*").eq("id", id).maybeSingle();
  if (error) throw new StoreError(error.message, 500);
  return (data as Row) ?? null;
}

export async function createRow(res: ResourceDef, data: Record<string, unknown>, virtuals: Record<string, unknown> = {}): Promise<Row> {
  if (res.table === "profiles") return createProfile(data, virtuals);
  if (demo()) return demoCreate(res, data);
  const c = await db();
  const { data: row, error } = await c.from(res.table).insert(data).select("*").single();
  if (error) throw storeErr(error, 400);
  return row as Row;
}

/** Atomic bulk insert (single statement). Not used for profiles. */
export async function createMany(res: ResourceDef, rows: Record<string, unknown>[]): Promise<Row[]> {
  if (res.table === "profiles") throw new StoreError("bulk create not supported", 405);
  if (demo()) {
    // validate-first, then commit (demo store cannot fail halfway)
    return rows.map((r) => demoCreate(res, r));
  }
  const c = await db();
  const { data, error } = await c.from(res.table).insert(rows).select("*");
  if (error) throw storeErr(error, 400);
  return (data ?? []) as Row[];
}

/** Atomic check-in: only flips rows whose status is not attended/disqualified. Returns the row or null. */
export async function markAttended(id: string): Promise<Row | null> {
  if (demo()) {
    const r = demoTable("olympiad_registrations").find((x) => String(x.id) === id);
    if (!r || r.status === "attended" || r.status === "disqualified") return null;
    r.status = "attended";
    return r;
  }
  const c = await db();
  const { data, error } = await c
    .from("olympiad_registrations")
    .update({ status: "attended" })
    .eq("id", id)
    .not("status", "in", "(attended,disqualified)")
    .select("*")
    .maybeSingle();
  if (error) throw storeErr(error, 400);
  return (data as Row) ?? null;
}

async function createProfile(data: Record<string, unknown>, v: Record<string, unknown>): Promise<Row> {
  const email = String(v.email ?? "").trim().toLowerCase();
  const password = String(v.password ?? "");
  if (!email || password.length < 8) throw new StoreError("email and password (min 8) required", 400);
  if (demo()) {
    const row = demoCreate({ key: "profiles", table: "profiles" } as ResourceDef, { ...data, email });
    return row;
  }
  const svc = getServiceClient();
  if (!svc) throw new StoreError("SUPABASE_SERVICE_ROLE_KEY is required to create users", 501);
  const { data: u, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: data.full_name } });
  if (error || !u.user) throw new StoreError(error?.message ?? "createUser failed", 400);
  const { data: row, error: e2 } = await svc.from("profiles").upsert({ id: u.user.id, ...data }).select("*").single();
  if (e2) {
    // roll back the auth user so no orphan account without a profile remains
    await svc.auth.admin.deleteUser(u.user.id).catch(() => null);
    throw new StoreError(e2.message, 400);
  }
  return { ...(row as Row), email };
}

export async function updateRow(res: ResourceDef, id: string, data: Record<string, unknown>): Promise<Row | null> {
  if (demo()) return demoUpdate(res, id, data);
  const c = await db();
  if (res.singleton) {
    const { data: row, error } = await c.from(res.table).upsert({ ...data, id: 1 }).select("*").single();
    if (error) throw storeErr(error, 400);
    return row as Row;
  }
  const { data: row, error } = await c.from(res.table).update(data).eq("id", id).select("*").maybeSingle();
  if (error) throw storeErr(error, 400);
  return (row as Row) ?? null;
}

export async function deleteRow(res: ResourceDef, id: string): Promise<boolean> {
  if (demo()) return demoDelete(res, id);
  const c = await db();
  const { error, count } = await c.from(res.table).delete({ count: "exact" }).eq("id", id);
  if (error) throw storeErr(error, 400);
  return (count ?? 0) > 0;
}

export async function deleteWhere(res: ResourceDef, field: string, value: string): Promise<number> {
  if (demo()) return demoDeleteWhere(res, field, value);
  const c = await db();
  const { error, count } = await c.from(res.table).delete({ count: "exact" }).eq(field, value);
  if (error) throw storeErr(error, 400);
  return count ?? 0;
}

// ---------------------------------------------------------------- dashboard
export async function dashboard(): Promise<DashData> {
  if (demo()) {
    const ex = demoExtra();
    return buildDashboard(
      {
        visits: ex.site_visits,
        attempts: ex.quiz_attempts,
        olympiads: demoTable("olympiads") as unknown as { id: string; title: L }[],
        registrations: demoTable("olympiad_registrations") as never,
        applications: demoTable("admission_applications") as never,
        leaderboardCount: demoTable("game_leaderboard").length,
        activeQuizzes: demoTable("academic_quizzes").filter((q) => q.is_active).length,
      },
      true,
    );
  }
  const c = await db();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const [visits, attempts, olys, regs, apps, lb, quizzes] = await Promise.all([
    c.from("site_visits").select("created_at").gte("created_at", since).limit(50000),
    c.from("academic_quiz_attempts").select("created_at").gte("created_at", since).limit(20000),
    c.from("olympiads").select("id,title"),
    c.from("olympiad_registrations").select("olympiad_id,created_at,student_full_name").order("created_at", { ascending: false }).limit(20000),
    c.from("admission_applications").select("status,created_at,parent_name,child_name,application_type").gte("created_at", since90).limit(5000),
    c.from("game_leaderboard").select("id", { count: "exact", head: true }),
    c.from("academic_quizzes").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  return buildDashboard(
    {
      visits: (visits.data ?? []) as never,
      attempts: (attempts.data ?? []) as never,
      olympiads: (olys.data ?? []) as never,
      registrations: (regs.data ?? []) as never,
      applications: (apps.data ?? []) as never,
      leaderboardCount: lb.count ?? 0,
      activeQuizzes: quizzes.count ?? 0,
    },
    false,
  );
}
