// Audit trail for admin mutations. Table: audit_log(id, user_id, user_email, action, resource, record_id, diff jsonb, created_at).
import { demoLog } from "./demo-store";
import { getServiceClient, getUserClient, isConfigured } from "./supabase";
import type { AdminSession } from "./types";

export type AuditAction = "create" | "update" | "delete" | "scan" | "export" | "import_ai";

const SECRET = new Set(["password"]);

/** Changed keys only: { field: { from, to } }. */
export function diffOf(before: Record<string, unknown> | null, after: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (SECRET.has(k)) continue;
    const a = before?.[k];
    if (JSON.stringify(a) !== JSON.stringify(after[k])) out[k] = { from: a ?? null, to: after[k] };
  }
  return out;
}

export async function logAudit(
  session: AdminSession,
  action: AuditAction,
  resource: string,
  recordId: string | number | null,
  diff: Record<string, unknown> | null = null,
): Promise<void> {
  const row = { user_id: session.demo ? null : session.id, user_email: session.email, action, resource, record_id: recordId === null ? null : String(recordId), diff };
  try {
    if (!isConfigured()) {
      demoLog({ ...row, user_id: session.id });
      return;
    }
    const c = getServiceClient() ?? (await getUserClient());
    await c.from("audit_log").insert(row);
  } catch {
    // auditing must never break the primary operation
  }
}
