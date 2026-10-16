// Password strength rules for self-service changes / resets (client-safe, pure). Director-issued temporary passwords are generated
// by provision.generatePassword() and always satisfy these rules.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt (Supabase) ignores everything after 72 bytes

export type PasswordIssue = "too_short" | "too_long" | "no_letter" | "no_digit" | "common" | "repeated" | "contains_email" | "same_as_current";

const COMMON = new Set([
  "password", "password1", "password123", "qwerty123", "qwertyuiop", "12345678", "123456789", "1234567890", "11111111", "iloveyou1",
  "abc12345", "abcd1234", "admin123", "admin1234", "welcome1", "welcome123", "letmein123", "demo1234", "parol123", "parol1234", "maktab123", "maktab1234",
  "school123", "school1234", "qwerty12", "asdfghjk1", "zaq12wsx", "1q2w3e4r", "uzbekistan1",
]);

/** Returns the list of violated rules (empty = acceptable). */
export function passwordIssues(pw: string, ctx: { email?: string; current?: string } = {}): PasswordIssue[] {
  const out: PasswordIssue[] = [];
  if (pw.length < PASSWORD_MIN) out.push("too_short");
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX) out.push("too_long");
  if (!/\p{L}/u.test(pw)) out.push("no_letter");
  if (!/\d/.test(pw)) out.push("no_digit");
  if (COMMON.has(pw.toLowerCase())) out.push("common");
  if (/(.)\1{3,}/u.test(pw)) out.push("repeated");
  const local = ctx.email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && pw.toLowerCase().includes(local)) out.push("contains_email");
  if (ctx.current !== undefined && pw === ctx.current) out.push("same_as_current");
  return out;
}

/** 0 = empty, 1 = weak (rules violated), 2 = fair (valid, short), 3 = strong (valid and long / varied). Display only; the server decides. */
export function passwordStrength(pw: string, ctx: { email?: string; current?: string } = {}): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  if (passwordIssues(pw, ctx).length) return 1;
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(pw)).length;
  return pw.length >= 12 && classes >= 3 ? 3 : pw.length >= 10 && classes >= 2 ? 3 : 2;
}

export const isStrongPassword = (pw: string, ctx: { email?: string; current?: string } = {}): boolean => passwordIssues(pw, ctx).length === 0;
