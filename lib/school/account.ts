// Self-service account flows for the school portal: change password, "forgot password" e-mail, complete reset.
// Supabase mode uses Supabase Auth (session cookies / recovery e-mail); demo mode keeps everything in memory (lib/school/auth.ts demoAuthState).
// Server only.
import { createClient } from "@supabase/supabase-js";
import { getServiceClient, getUserClient, isConfigured } from "@/lib/admin/supabase";
import { logError } from "@/lib/api";
import { demoAuthState } from "./auth";
import { DEMO_ACCOUNTS } from "./demo-data";
import { SchoolError } from "./errors";
import { passwordIssues } from "./password";
import { type SchoolSession } from "./types";

function assertStrong(pw: string, email: string, current?: string): void {
  if (passwordIssues(pw, { email, current }).length) throw new SchoolError("weak_password", 422);
}

/** Redirect target of the recovery e-mail (must also be listed in Supabase Auth -> URL Configuration -> Redirect URLs). */
export function resetRedirectUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/school/reset-password` : undefined;
}

/** Verifies the current password without touching the visitor's cookies (separate, session-less anon client). */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new SchoolError("not_configured", 501);
  const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (data?.session) await probe.auth.signOut().catch(() => null);
  return !error && !!data.user;
}

async function clearMustChange(userId: string): Promise<void> {
  const svc = getServiceClient();
  if (!svc) return;
  const { error } = await svc.from("profiles").update({ must_change_password: false }).eq("id", userId);
  if (error) {
    logError("school-account", error);
    throw new SchoolError("db_error", 500);
  }
}

/** Signed-in user changes their own password. Throws wrong_password (403) / weak_password (422). */
export async function changePassword(s: SchoolSession, current: string, next: string): Promise<void> {
  assertStrong(next, s.email, current);
  if (s.demo) {
    const st = demoAuthState();
    const acc = DEMO_ACCOUNTS.find((a) => a.id === s.id);
    const now = acc ? st.passwords.get(acc.email) ?? acc.password : null;
    if (acc && now !== current) throw new SchoolError("wrong_password", 403);
    if (acc) st.passwords.set(acc.email, next);
    st.mustChange.delete(s.id);
    return;
  }
  if (!(await verifyPassword(s.email, current))) throw new SchoolError("wrong_password", 403);
  const { error } = await (await getUserClient()).auth.updateUser({ password: next });
  if (error) {
    if (/reauth|nonce/i.test(error.message)) {
      // "Secure password change" is on and the session is old: the current password was verified above, so the admin API may set it
      const svc = getServiceClient();
      const r = svc ? await svc.auth.admin.updateUserById(s.id, { password: next }) : null;
      if (!r || r.error) throw new SchoolError("db_error", 500);
    } else if (/weak|short|password should|characters/i.test(error.message)) throw new SchoolError("weak_password", 422);
    else {
      logError("school-account", error);
      throw new SchoolError("db_error", 500);
    }
  }
  await clearMustChange(s.id);
}

/**
 * Sends the recovery e-mail. NEVER reveals whether the address belongs to an account: unknown addresses, inactive accounts and
 * delivery errors all look like success to the caller.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!isConfigured()) return; // demo: nothing is sent, the UI shows a simulated message
  try {
    const redirectTo = resetRedirectUrl();
    const { error } = await (await getUserClient()).auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) logError("school-reset", error);
  } catch (e) {
    logError("school-reset", e);
  }
}

/** Demo only: this code stands in for the e-mail link. */
export const DEMO_RESET_CODE = "demo-reset";

/**
 * Finishes a reset with the credential from the e-mail link: `token_hash` (cross-device, requires the customised e-mail template, see
 * docs/SUPABASE-GO-LIVE.md) or `code` (PKCE, same browser that requested the reset). Signs the user out afterwards.
 */
export async function completePasswordReset(input: { code?: string; token_hash?: string; password: string; email?: string }): Promise<void> {
  if (!isConfigured()) {
    if (input.code !== DEMO_RESET_CODE) throw new SchoolError("invalid_token", 422);
    const acc = DEMO_ACCOUNTS.find((a) => a.email === input.email?.trim().toLowerCase());
    if (acc) {
      assertStrong(input.password, acc.email);
      demoAuthState().passwords.set(acc.email, input.password);
      demoAuthState().mustChange.delete(acc.id);
    } else assertStrong(input.password, "");
    return;
  }
  const client = await getUserClient();
  const sess = input.token_hash
    ? await client.auth.verifyOtp({ token_hash: input.token_hash, type: "recovery" })
    : await client.auth.exchangeCodeForSession(input.code ?? "");
  const user = sess.data?.user ?? sess.data?.session?.user;
  if (sess.error || !user) throw new SchoolError("invalid_token", 422);
  try {
    assertStrong(input.password, user.email ?? "");
    const { error } = await client.auth.updateUser({ password: input.password });
    if (error) {
      if (/weak|short|password should|characters/i.test(error.message)) throw new SchoolError("weak_password", 422);
      if (/same/i.test(error.message)) throw new SchoolError("weak_password", 422);
      logError("school-reset", error);
      throw new SchoolError("db_error", 500);
    }
    await clearMustChange(user.id);
  } finally {
    await client.auth.signOut().catch(() => null);
  }
}
