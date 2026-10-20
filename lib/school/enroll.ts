// One-step enrolment (super admin, /admin/enroll): creates the student, the parent / guardian, links them, and issues a login for each.
// Built on the director services (saveStudent, createAccount, inviteGuardian): same validation, audit log and temporary-password rule
// (must_change_password). Logins live on the school domain (SCHOOL_EMAIL_DOMAIN), e.g. karimov.sardor@childrensacademy.uz.
// Nothing half-made is left behind: if a later step fails, the records and logins created by earlier steps are removed again.
import { getServiceClient } from "@/lib/admin/supabase";
import { isSchoolError, SchoolError } from "./errors";
import { createAccount, inviteGuardian, type ProvisionResult } from "./provision";
import { requireDirector, type Ctx } from "./svc-core";
import { deleteStudent, linkGuardian, saveStudent } from "./svc-people";
import type { Gender, Guardian, GuardianRelation, Student } from "./types";

export const DEFAULT_EMAIL_DOMAIN = "childrensacademy.uz";

/** the domain used for generated logins (SCHOOL_EMAIL_DOMAIN, validated; falls back to the default) */
export function schoolEmailDomain(): string {
  const d = (process.env.SCHOOL_EMAIL_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : DEFAULT_EMAIL_DOMAIN;
}

// Uzbek / Russian Cyrillic -> Latin (Uzbek spelling), so "Каримов Сардор" gets the same login as "Karimov Sardor"
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", қ: "q", л: "l", м: "m", н: "n",
  о: "o", ў: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ҳ: "h", ц: "s", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "",
  э: "e", ю: "yu", я: "ya",
};

/** "Ma'rufova O'g'iloy" -> "marufova"; "Каримов" -> "karimov". Only [a-z0-9] survive. */
export function latinSlug(word: string): string {
  // Cyrillic first (on composed letters: NFKD would split й into и + breve), then NFKD strips Latin diacritics (ş -> s)
  return [...word.toLowerCase().normalize("NFC")]
    .map((ch) => CYR[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/** login e-mail from name parts: ["Karimov", "Sardor"] -> karimov.sardor@domain (suffix 2, 3, ... when taken) */
export function loginEmail(parts: string[], domain: string, n = 1): string {
  const local = parts.map(latinSlug).filter(Boolean).slice(0, 2).join(".") || "user";
  return `${local.slice(0, 48)}${n > 1 ? n : ""}@${domain}`;
}

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^998(?=\d{9}$)/, "");

export interface EnrollInput {
  student: { last_name: string; first_name: string; middle_name?: string | null; birth_date?: string | null; gender?: Gender | null; class_id?: string | null };
  guardian: { full_name: string; relation: GuardianRelation; phone?: string | null; email?: string | null };
}

export interface EnrollResult {
  student: Student;
  guardian: Guardian;
  /** an existing guardian with the same phone number was linked instead of creating a duplicate */
  guardian_reused: boolean;
  student_account: ProvisionResult;
  /** null when the reused guardian already had a login */
  guardian_account: ProvisionResult | null;
}

const MAX_TRIES = 30;

// Demo mode has no auth table that could refuse a duplicate e-mail, so the logins issued in this process are remembered here
// (Supabase answers "already registered" itself and the loop moves on to the next number).
const g = globalThis as unknown as { __demoLogins?: Set<string> };
const demoLogins = (g.__demoLogins ??= new Set());

/** createAccount with generated logins: tries name@domain, name2@domain, ... until a free one is found */
async function accountWithGeneratedLogin(c: Ctx, kind: "student" | "guardian", id: string, parts: string[]): Promise<ProvisionResult> {
  const domain = schoolEmailDomain();
  for (let n = 1; n <= MAX_TRIES; n++) {
    const email = loginEmail(parts, domain, n);
    if (c.db.kind === "demo" && demoLogins.has(email)) continue;
    try {
      const acc = await createAccount(c, { kind, id, email });
      if (acc.demo) demoLogins.add(email);
      return acc;
    } catch (e) {
      if (!isSchoolError(e) || e.code !== "conflict") throw e;
    }
  }
  throw new SchoolError("conflict", 409, "no free login");
}

/** removes a login created by createAccount (Supabase mode); demo logins are only a simulated link */
async function dropLogin(acc: ProvisionResult | null): Promise<void> {
  if (!acc || acc.demo) return;
  await getServiceClient()?.auth.admin.deleteUser(acc.user_id).catch(() => undefined);
}

export async function enrollStudent(c: Ctx, input: EnrollInput): Promise<EnrollResult> {
  requireDirector(c);
  const s = input.student;
  const g = input.guardian;
  if (s.class_id && !c.classes.some((x) => x.id === s.class_id)) throw new SchoolError("not_found", 404, "class");

  // 1. student + student login
  const student = await saveStudent(c, {
    last_name: s.last_name, first_name: s.first_name, middle_name: s.middle_name ?? null,
    birth_date: s.birth_date ?? null, gender: s.gender ?? null, class_id: s.class_id ?? null, status: "active",
  });
  let studentAcc: ProvisionResult | null = null;
  try {
    studentAcc = await accountWithGeneratedLogin(c, "student", student.id, [s.last_name, s.first_name]);

    // 2. guardian: a sibling's parent (same phone) is reused, otherwise a new guardian with its own login
    const phone = digits(g.phone);
    const existing = phone.length >= 9 ? (await c.db.select("guardians")).find((x) => digits(x.phone) === phone) : undefined;
    if (existing) {
      await linkGuardian(c, { student_id: student.id, guardian_id: existing.id, is_primary: true });
      let guardianAcc: ProvisionResult | null = null;
      if (!existing.user_id) {
        guardianAcc = g.email
          ? await createAccount(c, { kind: "guardian", id: existing.id, email: g.email })
          : await accountWithGeneratedLogin(c, "guardian", existing.id, existing.full_name.split(/\s+/));
      }
      await c.db.audit(c.actor, "enroll", "students", student.id, { guardian_id: existing.id, guardian_reused: true });
      return {
        student: { ...student, user_id: studentAcc.user_id },
        guardian: { ...existing, user_id: guardianAcc?.user_id ?? existing.user_id },
        guardian_reused: true, student_account: studentAcc, guardian_account: guardianAcc,
      };
    }

    const nameParts = g.full_name.trim().split(/\s+/);
    const domain = schoolEmailDomain();
    for (let n = 1; n <= MAX_TRIES; n++) {
      const email = g.email ?? loginEmail(nameParts, domain, n);
      if (c.db.kind === "demo" && demoLogins.has(email)) {
        if (g.email) throw new SchoolError("conflict", 409, "email taken");
        continue;
      }
      try {
        const inv = await inviteGuardian(c, {
          full_name: g.full_name.trim(), relation: g.relation, phone: g.phone ?? null, email, student_ids: [student.id], is_primary: true,
        });
        if (inv.account?.demo) demoLogins.add(email);
        await c.db.audit(c.actor, "enroll", "students", student.id, { guardian_id: inv.guardian.id, guardian_reused: false });
        return {
          student: { ...student, user_id: studentAcc.user_id }, guardian: inv.guardian,
          guardian_reused: false, student_account: studentAcc, guardian_account: inv.account,
        };
      } catch (e) {
        // a parent's own e-mail that is already taken is reported; a generated login just moves on to the next free one
        if (g.email || !isSchoolError(e) || e.code !== "conflict") throw e;
      }
    }
    throw new SchoolError("conflict", 409, "no free login");
  } catch (e) {
    await dropLogin(studentAcc);
    await deleteStudent(c, student.id).catch(() => undefined);
    throw e;
  }
}
