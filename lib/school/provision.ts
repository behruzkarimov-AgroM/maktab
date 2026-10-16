// Account provisioning for directors: create teacher / parent / student logins, reset passwords, invite guardians.
// Supabase mode uses the service role (auth admin API). Demo mode only simulates the link (no real login is created).
// Every password issued here is TEMPORARY: profiles.must_change_password is set, so the account can only change its password
// (see api-helpers `allowMustChange` and POST /api/school/auth/change-password) until it picked its own.
import { randomBytes } from "node:crypto";
import { getServiceClient } from "@/lib/admin/supabase";
import { demoAuthState } from "./auth";
import { DEMO_ACCOUNTS } from "./demo-data";
import { SchoolError } from "./errors";
import { SCHOOL_ROLES, type SchoolRole } from "./types";
import { passwordIssues } from "./password";
import { requireDirector, need, type Ctx } from "./svc-core";
import { linkGuardian, saveGuardian } from "./svc-people";
import type { Guardian, GuardianRelation } from "./types";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 12 chars from an unambiguous alphabet; always contains a lower-case letter, an upper-case letter and a digit
 *  (passes lib/school/password.ts and even a Supabase "lower + upper + digits" password policy) */
export function generatePassword(len = 12): string {
  for (;;) {
    const bytes = randomBytes(len);
    const pw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) return pw;
  }
}

const ROLE_OF = { teacher: "teacher", guardian: "parent", student: "student" } as const;
const TABLE_OF = { teacher: "teachers", guardian: "guardians", student: "students" } as const;

export interface ProvisionResult {
  user_id: string;
  email: string;
  /** shown ONCE to the director; never logged or stored */
  temp_password: string | null;
  demo: boolean;
  /** the user has to choose a new password at first login */
  must_change_password: boolean;
}

/**
 * A director may only manage the logins of teachers, parents and students. Privilege escalation guard: a school_admin must NOT be able to
 * reset the password of (= take over) or deactivate a super_admin / another school_admin; nobody manages their own account here
 * (self-service change-password exists), and unknown ids look like not_found.
 */
export async function assertManageableAccount(c: Ctx, userId: string, opts: { allowSelf?: boolean } = {}): Promise<SchoolRole> {
  requireDirector(c);
  if (userId === c.s.id && !opts.allowSelf) throw new SchoolError("forbidden");
  let role: SchoolRole | null = null;
  if (c.db.kind === "demo") {
    role = DEMO_ACCOUNTS.find((a) => a.id === userId)?.role ?? (userId.startsWith("demo-acct-") ? "student" : null);
  } else {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new SchoolError("not_found");
    const svc = getServiceClient();
    if (!svc) throw new SchoolError("not_configured", 501);
    const { data, error } = await svc.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (error) throw new SchoolError("db_error", 500);
    role = SCHOOL_ROLES.includes(data?.role as SchoolRole) ? (data!.role as SchoolRole) : null;
  }
  if (!role) throw new SchoolError("not_found");
  if (role === "super_admin") throw new SchoolError("forbidden");
  if (role === "school_admin" && c.s.role !== "super_admin") throw new SchoolError("forbidden");
  return role;
}

export async function createAccount(c: Ctx, input: { kind: "teacher" | "guardian" | "student"; id: string; email: string; password?: string }): Promise<ProvisionResult> {
  requireDirector(c);
  const table = TABLE_OF[input.kind];
  const [row] = (await c.db.select(table as "teachers", { eq: { id: input.id } })) as unknown as { id: string; user_id: string | null; full_name?: string; first_name?: string; last_name?: string }[];
  need(row);
  if (row.user_id) throw new SchoolError("conflict", 409, "account exists");
  const fullName = row.full_name ?? `${row.last_name ?? ""} ${row.first_name ?? ""}`.trim();
  if (c.db.kind === "demo") {
    const user_id = `demo-acct-${input.id.slice(0, 8)}`;
    await c.db.update(table as "teachers", { eq: { id: input.id } }, { user_id } as never);
    demoAuthState().mustChange.add(user_id);
    await c.db.audit(c.actor, "create_account", table, input.id, { kind: input.kind, email: input.email });
    return { user_id, email: input.email, temp_password: null, demo: true, must_change_password: true };
  }
  const svc = getServiceClient();
  if (!svc) throw new SchoolError("not_configured", 501);
  if (input.password && passwordIssues(input.password, { email: input.email }).length) throw new SchoolError("weak_password", 422);
  const password = input.password ?? generatePassword();
  const { data, error } = await svc.auth.admin.createUser({ email: input.email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) throw new SchoolError(error?.message?.toLowerCase().includes("already") ? "conflict" : "db_error");
  const uid = data.user.id;
  // handle_new_user() created a 'student' profile; set the real role (service role bypasses the privilege trigger)
  const prof = await svc.from("profiles").update({ role: ROLE_OF[input.kind], full_name: fullName, is_active: true, must_change_password: true }).eq("id", uid);
  if (prof.error) {
    await svc.auth.admin.deleteUser(uid);
    throw new SchoolError("db_error");
  }
  try {
    await c.db.update(table as "teachers", { eq: { id: input.id } }, { user_id: uid } as never);
  } catch (e) {
    await svc.auth.admin.deleteUser(uid); // no orphan login without its teacher / guardian / student link
    throw e;
  }
  await c.db.audit(c.actor, "create_account", table, input.id, { kind: input.kind, email: input.email });
  return { user_id: uid, email: input.email, temp_password: password, demo: false, must_change_password: true };
}

export async function resetPassword(c: Ctx, input: { user_id: string; password?: string }): Promise<{ temp_password: string | null; demo: boolean; must_change_password: boolean }> {
  await assertManageableAccount(c, input.user_id);
  if (c.db.kind === "demo") {
    if (input.user_id.startsWith("demo-acct-")) demoAuthState().mustChange.add(input.user_id);
    await c.db.audit(c.actor, "reset_password", "auth", input.user_id, null);
    return { temp_password: null, demo: true, must_change_password: true };
  }
  const svc = getServiceClient();
  if (!svc) throw new SchoolError("not_configured", 501);
  if (input.password && passwordIssues(input.password).length) throw new SchoolError("weak_password", 422);
  const password = input.password ?? generatePassword();
  const { error } = await svc.auth.admin.updateUserById(input.user_id, { password });
  if (error) throw new SchoolError("not_found");
  const flag = await svc.from("profiles").update({ must_change_password: true }).eq("id", input.user_id);
  if (flag.error) throw new SchoolError("db_error");
  await c.db.audit(c.actor, "reset_password", "auth", input.user_id, null);
  return { temp_password: password, demo: false, must_change_password: true };
}

export interface InviteInput {
  /** existing guardian, or omit and give `full_name` to create one */
  guardian_id?: string;
  full_name?: string;
  relation?: GuardianRelation;
  phone?: string | null;
  email: string;
  /** children to link (at least one when the guardian is created here) */
  student_ids: string[];
  is_primary?: boolean;
  password?: string;
}
export interface InviteResult {
  guardian: Guardian;
  /** null when the guardian already had a login (only the children were linked) */
  account: ProvisionResult | null;
  linked: number;
}

/**
 * Director invites a guardian: creates the guardian record if needed, links the children, provisions the parent login with a
 * temporary password (must_change_password) and returns the credentials ONCE.
 */
export async function inviteGuardian(c: Ctx, input: InviteInput): Promise<InviteResult> {
  requireDirector(c);
  for (const sid of input.student_ids) need((await c.db.select("students", { eq: { id: sid } }))[0]);
  let guardian: Guardian;
  let created = false;
  if (input.guardian_id) {
    guardian = need((await c.db.select("guardians", { eq: { id: input.guardian_id } }))[0]);
  } else {
    if (!input.full_name || !input.student_ids.length) throw new SchoolError("invalid_input");
    guardian = await saveGuardian(c, { full_name: input.full_name, relation: input.relation ?? "parent", phone: input.phone ?? null, email: input.email });
    created = true;
  }
  let account: ProvisionResult | null = null;
  if (!guardian.user_id) {
    try {
      account = await createAccount(c, { kind: "guardian", id: guardian.id, email: input.email, password: input.password });
    } catch (e) {
      if (created) await c.db.remove("guardians", { eq: { id: guardian.id } }); // do not leave a half-created guardian behind
      throw e;
    }
    if (!guardian.email) await c.db.update("guardians", { eq: { id: guardian.id } }, { email: input.email });
  }
  for (const sid of input.student_ids) await linkGuardian(c, { student_id: sid, guardian_id: guardian.id, is_primary: input.is_primary ?? false });
  await c.db.audit(c.actor, "invite_guardian", "guardians", guardian.id, { students: input.student_ids.length, account: !!account });
  return { guardian: { ...guardian, user_id: account?.user_id ?? guardian.user_id }, account, linked: input.student_ids.length };
}
