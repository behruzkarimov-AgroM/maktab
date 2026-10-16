// Supabase backend for the SIS. Table access uses the service-role client (callers are verified in lib/school/service.ts;
// RLS in supabase/schema.sql protects every other path). Bulk writes call the SECURITY DEFINER RPCs with the USER's JWT,
// so ownership, ranges, locked terms and auditing are enforced by the database itself.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient, getUserClient } from "@/lib/admin/supabase";
import { logError } from "@/lib/api";
import type { Actor, AttendanceBulkArgs, GradesBulkArgs, Q, SchoolDb, TermGradesBulkArgs } from "./db";
import { RPC_CODES, SchoolError } from "./errors";
import { tashkentToday } from "./grading";
import type { TableName, TableRows } from "./types";

const PAGE = 1000;

function mapError(e: { code?: string; message?: string } | null | undefined): never {
  const msg = (e?.message ?? "").trim();
  if (RPC_CODES.has(msg)) throw new SchoolError(msg);
  switch (e?.code) {
    case "23505":
      // unique violations that deserve their own stable code (index names from supabase/schema.sql)
      if (msg.includes("schedule_slots_room_uq")) throw new SchoolError("room_busy", 409);
      throw new SchoolError("conflict", 409);
    case "23503": throw new SchoolError("reference_conflict", 409); // FK: missing parent row, or still referenced by children
    case "23514": throw new SchoolError("invalid_input", 422);
    case "42501": throw new SchoolError("forbidden", 403);
    default:
      logError("school-db", e);
      throw new SchoolError("db_error", 500);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any;
function applyFilters(b: Builder, q?: Q): Builder {
  if (!q) return b;
  for (const [k, v] of Object.entries(q.eq ?? {})) b = v === null ? b.is(k, null) : b.eq(k, v);
  for (const [k, v] of Object.entries(q.in ?? {})) b = b.in(k, v as (string | number)[]);
  for (const [k, v] of Object.entries(q.gte ?? {})) b = b.gte(k, v);
  for (const [k, v] of Object.entries(q.lte ?? {})) b = b.lte(k, v);
  return b;
}

export function createSupabaseDb(): SchoolDb {
  const svc = (): SupabaseClient => {
    const c = getServiceClient();
    if (!c) throw new SchoolError("not_configured", 501);
    return c;
  };

  return {
    kind: "supabase",
    today: () => tashkentToday(),

    async select<K extends TableName>(table: K, q?: Q) {
      const out: TableRows[K][] = [];
      const want = q?.limit ?? Infinity;
      let offset = q?.offset ?? 0;
      for (;;) {
        let b = applyFilters(svc().from(table).select("*"), q);
        for (const [col, dir] of q?.order ?? []) b = b.order(col, { ascending: dir === "asc" });
        const size = Math.min(PAGE, want - out.length);
        const { data, error } = await b.range(offset, offset + size - 1);
        if (error) mapError(error);
        out.push(...((data ?? []) as TableRows[K][]));
        if (!data || data.length < size || out.length >= want) break;
        offset += size;
      }
      return out;
    },

    async insert<K extends TableName>(table: K, rows: Partial<TableRows[K]>[]) {
      if (!rows.length) return [];
      const { data, error } = await svc().from(table).insert(rows as never).select();
      if (error) mapError(error);
      return (data ?? []) as TableRows[K][];
    },

    async update<K extends TableName>(table: K, match: Q, patch: Partial<TableRows[K]>) {
      const { data, error } = await applyFilters(svc().from(table).update(patch as never), match).select();
      if (error) mapError(error);
      return (data ?? []) as TableRows[K][];
    },

    async upsert<K extends TableName>(table: K, rows: Partial<TableRows[K]>[], onConflict: string[]) {
      if (!rows.length) return [];
      const { data, error } = await svc().from(table).upsert(rows as never, { onConflict: onConflict.join(",") }).select();
      if (error) mapError(error);
      return (data ?? []) as TableRows[K][];
    },

    async remove(table: TableName, match: Q) {
      const { data, error } = await applyFilters(svc().from(table).delete(), match).select();
      if (error) mapError(error);
      return (data ?? []).length;
    },

    async audit(actor: Actor, action, resource, recordId, diff = null) {
      try {
        await svc().from("audit_log").insert({ user_id: actor.demo ? null : actor.id, user_email: actor.email, action, resource, record_id: recordId, diff });
      } catch {
        // auditing must never break the primary operation
      }
    },

    async markAttendanceBulk(_actor: Actor, a: AttendanceBulkArgs) {
      const { data, error } = await (await getUserClient()).rpc("mark_attendance_bulk", { p_class: a.class_id, p_date: a.date, p_lesson_no: a.lesson_no, p_records: a.records });
      if (error) mapError(error);
      return data as { saved: number };
    },
    async saveGradesBulk(_actor: Actor, a: GradesBulkArgs) {
      const { data, error } = await (await getUserClient()).rpc("save_grades_bulk", { p_class: a.class_id, p_subject: a.subject_id, p_term: a.term_id, p_entries: a.entries });
      if (error) mapError(error);
      return data as { saved: number; deleted: number };
    },
    async saveTermGradesBulk(_actor: Actor, a: TermGradesBulkArgs) {
      const { data, error } = await (await getUserClient()).rpc("save_term_grades_bulk", { p_class: a.class_id, p_subject: a.subject_id, p_term: a.term_id, p_rows: a.rows });
      if (error) mapError(error);
      return data as { saved: number };
    },
    async lockTerm(_actor: Actor, termId: string, locked: boolean) {
      const { data, error } = await (await getUserClient()).rpc("lock_term", { p_term: termId, p_locked: locked });
      if (error) mapError(error);
      return data as { term_id: string; is_locked: boolean };
    },
  };
}
