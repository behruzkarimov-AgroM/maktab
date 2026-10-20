// Initial accounts for a fresh Supabase project: one login per role, plus the sample teacher / student / parent records those portal
// roles need to be usable. Used by scripts/create-accounts.mjs (CLI) and tests/create-accounts.test.ts (real schema in PGlite).
// Idempotent: an e-mail that already has a login is reported as "exists" and left untouched (unless `reset` is set).
import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 14 chars from an unambiguous alphabet, always with a lower-case letter, an upper-case letter and a digit */
export function strongPassword(len = 14) {
  for (;;) {
    const pw = Array.from(randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) return pw;
  }
}

/**
 * @typedef {{ role: string; email: string; name: string; portal: string; link?: "teacher" | "student" | "guardian" }} AccountSpec
 * @typedef {AccountSpec & { status: "created" | "exists" | "reset"; password: string | null; user_id: string | null }} AccountRow
 */

/** @param {string} domain @returns {AccountSpec[]} */
export function accountSpecs(domain) {
  return [
    { role: "super_admin", email: `admin@${domain}`, name: "Super Admin", portal: "/admin/login" },
    { role: "school_admin", email: `direktor@${domain}`, name: "Maktab direktori", portal: "/school/login" },
    { role: "methodist", email: `metodist@${domain}`, name: "Metodist", portal: "/admin/login" },
    { role: "psychologist", email: `psixolog@${domain}`, name: "Psixolog", portal: "/admin/login" },
    { role: "teacher", email: `oqituvchi@${domain}`, name: "Namuna O'qituvchi", portal: "/school/login", link: "teacher" },
    { role: "student", email: `oquvchi@${domain}`, name: "Namuna O'quvchi", portal: "/school/login", link: "student" },
    { role: "parent", email: `ota-ona@${domain}`, name: "Namuna Ota-ona", portal: "/school/login", link: "guardian" },
  ];
}

// roles that sign in to the school portal get the "change the temporary password first" flag (the portal enforces it)
const MUST_CHANGE = new Set(["super_admin", "school_admin", "teacher", "student", "parent"]);

/** @param {any} svc @param {string} email */
async function findUserId(svc, email) {
  if (typeof svc.auth.admin.listUsers !== "function") return null;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const u = data.users.find((/** @type {{ email?: string }} */ x) => (x.email ?? "").toLowerCase() === email);
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** @param {any} res @param {string} what */
function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/**
 * @param {any} svc service-role Supabase client
 * @param {{ domain: string; today: string; reset?: boolean }} opts
 * @returns {Promise<AccountRow[]>}
 */
export async function createInitialAccounts(svc, { domain, today, reset = false }) {
  /** @type {AccountRow[]} */
  const out = [];
  let sampleStudentId = null;
  for (const spec of accountSpecs(domain)) {
    const password = strongPassword();
    /** @type {AccountRow} */
    const row = { ...spec, status: "created", password, user_id: null };
    const created = await svc.auth.admin.createUser({ email: spec.email, password, email_confirm: true, user_metadata: { full_name: spec.name } });
    if (created.error) {
      if (!/already/i.test(created.error.message)) throw new Error(`createUser ${spec.email}: ${created.error.message}`);
      row.user_id = await findUserId(svc, spec.email);
      if (reset && row.user_id) {
        must(await svc.auth.admin.updateUserById(row.user_id, { password }), `reset ${spec.email}`);
        row.status = "reset";
      } else {
        row.status = "exists";
        row.password = null;
      }
    } else {
      row.user_id = created.data.user.id;
    }

    if (row.user_id && row.status !== "exists") {
      // the auth trigger created a 'student' profile: set the real role (the service role bypasses the privilege guard)
      const prof = await svc
        .from("profiles")
        .update({ role: spec.role, full_name: spec.name, is_active: true, must_change_password: MUST_CHANGE.has(spec.role) })
        .eq("id", row.user_id);
      if (prof.error) {
        if (row.status === "created") await svc.auth.admin.deleteUser(row.user_id);
        throw new Error(`profile ${spec.email}: ${prof.error.message}`);
      }
    }

    // portal roles need their record: teacher -> teachers, student -> students (first class of the current year), parent -> guardians + link
    if (row.user_id && spec.link === "teacher") {
      const has = must(await svc.from("teachers").select("id").eq("user_id", row.user_id), "teachers");
      if (!has.length) must(await svc.from("teachers").insert({ user_id: row.user_id, full_name: spec.name, email: spec.email, status: "active", hired_at: today }), "insert teacher");
    }
    if (row.user_id && spec.link === "student") {
      const has = must(await svc.from("students").select("id").eq("user_id", row.user_id), "students");
      if (has.length) sampleStudentId = has[0].id;
      else {
        const years = must(await svc.from("school_years").select("id,is_current,start_date").order("start_date", { ascending: false }), "school_years");
        const year = years.find((/** @type {{ is_current: boolean }} */ y) => y.is_current) ?? years[0];
        const classes = year ? must(await svc.from("classes").select("id,grade,letter").eq("year_id", year.id).order("grade").order("letter"), "classes") : [];
        const ins = must(
          await svc
            .from("students")
            .insert({ user_id: row.user_id, last_name: "Namuna", first_name: "O'quvchi", class_id: classes[0]?.id ?? null, student_code: `NAMUNA-${row.user_id.slice(0, 8)}`, status: "active", enrolled_at: today })
            .select("id"),
          "insert student",
        );
        sampleStudentId = ins[0].id;
      }
    }
    if (row.user_id && spec.link === "guardian") {
      const has = must(await svc.from("guardians").select("id").eq("user_id", row.user_id), "guardians");
      const guardianId = has.length
        ? has[0].id
        : must(await svc.from("guardians").insert({ user_id: row.user_id, full_name: spec.name, relation: "parent", email: spec.email }).select("id"), "insert guardian")[0].id;
      if (sampleStudentId) must(await svc.from("student_guardians").upsert({ student_id: sampleStudentId, guardian_id: guardianId, is_primary: true }, { onConflict: "student_id,guardian_id" }), "link guardian");
    }
    out.push(row);
  }
  return out;
}

const ROLE_LABEL = {
  super_admin: "Super admin", school_admin: "Direktor", methodist: "Metodist", psychologist: "Psixolog",
  teacher: "O'qituvchi", student: "O'quvchi", parent: "Ota-ona",
};

/** Markdown section for HISOBLAR.local.md (one per run, newest first in the file) */
export function credentialsMarkdown(/** @type {AccountRow[]} */ rows, /** @type {string} */ siteUrl, /** @type {Date} */ when) {
  const lines = [
    `## ${when.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    "| Rol | Login (e-pochta) | Parol | Kirish sahifasi | Holat |",
    "|---|---|---|---|---|",
    ...rows.map((r) => {
      const status = r.status === "created" ? "yangi" : r.status === "reset" ? "parol yangilandi" : "oldin bor edi (parol o'zgarmadi)";
      return `| ${ROLE_LABEL[/** @type {keyof typeof ROLE_LABEL} */ (r.role)] ?? r.role} | \`${r.email}\` | ${r.password ? `\`${r.password}\`` : "-"} | ${siteUrl}${r.portal} | ${status} |`;
    }),
    "",
  ];
  return lines.join("\n");
}
