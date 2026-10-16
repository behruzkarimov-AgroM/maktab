// Data-access abstraction for the SIS. One interface, two backends: the in-memory demo store (lib/school/demo-store.ts)
// and Supabase (lib/school/db-supabase.ts). All business logic lives in lib/school/service.ts on top of this interface.
import { demoAllowed, isConfigured } from "@/lib/admin/supabase";
import { SchoolError } from "./errors";
import type { SchoolSession, TableName, TableRows } from "./types";

type Scalar = string | number | boolean | null;
export interface Q {
  eq?: Record<string, Scalar>;
  in?: Record<string, readonly (string | number)[]>;
  gte?: Record<string, string | number>;
  lte?: Record<string, string | number>;
  order?: [string, "asc" | "desc"][];
  limit?: number;
  offset?: number;
}

/** identity used for RPC-style writes (the SQL RPCs read auth.uid(); the demo store mirrors them) */
export type Actor = Pick<SchoolSession, "id" | "email" | "role" | "teacherId" | "demo">;

export interface AttendanceBulkArgs {
  class_id: string;
  date: string;
  lesson_no: number | null;
  records: { student_id: string; status: string; minutes_late?: number; note?: string | null }[];
}
export interface GradesBulkArgs {
  class_id: string;
  subject_id: string;
  term_id: string;
  entries: { id?: string; delete?: boolean; student_id?: string; date?: string; kind?: string; score?: number; weight?: number; comment?: string | null }[];
}
export interface TermGradesBulkArgs {
  class_id: string;
  subject_id: string;
  term_id: string;
  rows: { student_id: string; value: number | null; suggested?: number | null; override_reason?: string | null }[];
}
export interface AuditRow {
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource: string;
  record_id: string | null;
  diff: Record<string, unknown> | null;
  created_at: string;
}

export interface SchoolDb {
  readonly kind: "demo" | "supabase";
  /** current school date (YYYY-MM-DD, Asia/Tashkent) */
  today(): string;
  select<K extends TableName>(table: K, q?: Q): Promise<TableRows[K][]>;
  insert<K extends TableName>(table: K, rows: Partial<TableRows[K]>[]): Promise<TableRows[K][]>;
  update<K extends TableName>(table: K, match: Q, patch: Partial<TableRows[K]>): Promise<TableRows[K][]>;
  upsert<K extends TableName>(table: K, rows: Partial<TableRows[K]>[], onConflict: string[]): Promise<TableRows[K][]>;
  remove(table: TableName, match: Q): Promise<number>;
  audit(actor: Actor, action: string, resource: string, recordId: string | null, diff?: Record<string, unknown> | null): Promise<void>;
  /** RPC equivalents (SQL: mark_attendance_bulk, save_grades_bulk, save_term_grades_bulk, lock_term) */
  markAttendanceBulk(actor: Actor, args: AttendanceBulkArgs): Promise<{ saved: number }>;
  saveGradesBulk(actor: Actor, args: GradesBulkArgs): Promise<{ saved: number; deleted: number }>;
  saveTermGradesBulk(actor: Actor, args: TermGradesBulkArgs): Promise<{ saved: number }>;
  lockTerm(actor: Actor, termId: string, locked: boolean): Promise<{ term_id: string; is_locked: boolean }>;
}

export { tashkentToday } from "./grading";

export type Backend = "supabase" | "demo" | "off";
export function backend(): Backend {
  if (isConfigured()) return "supabase";
  return demoAllowed() ? "demo" : "off";
}

let cached: SchoolDb | null = null;
/** Returns the backend for this process. Throws `not_configured` when neither Supabase nor demo mode is available. */
export async function getDb(): Promise<SchoolDb> {
  const b = backend();
  if (b === "off") throw new SchoolError("not_configured", 501);
  if (b === "demo") {
    const { getDemoStore } = await import("./demo-store");
    return getDemoStore(); // singleton on globalThis (tests may replace it with resetDemoStore)
  }
  if (cached && cached.kind === b) return cached;
  const { createSupabaseDb } = await import("./db-supabase");
  cached = createSupabaseDb();
  return cached;
}
