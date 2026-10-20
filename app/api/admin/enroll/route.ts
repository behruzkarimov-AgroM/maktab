import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkMutation, getSession, jsonError } from "@/lib/admin/auth";
import { parseBody } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enrollStudent, schoolEmailDomain } from "@/lib/school/enroll";
import { isSchoolError } from "@/lib/school/errors";
import { loadCtx } from "@/lib/school/svc-core";
import type { SchoolSession } from "@/lib/school/types";

/**
 * Super admin enrolment: GET -> classes of the current school year + login domain (for the form);
 * POST { student, guardian } -> creates the student, the guardian, the link and both logins; the temporary passwords are in the
 * response ONCE (never logged or stored).
 */

const name = z.string().trim().min(1).max(80);
const optional = (s: z.ZodTypeAny) => z.preprocess((v) => (v === "" ? null : v), s.nullable().optional());
const schema = z.object({
  student: z.object({
    last_name: name,
    first_name: name,
    middle_name: optional(z.string().trim().max(80)),
    birth_date: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    gender: optional(z.enum(["m", "f"])),
    class_id: optional(z.string().uuid()),
  }),
  guardian: z.object({
    full_name: z.string().trim().min(3).max(120),
    relation: z.enum(["mother", "father", "guardian", "parent", "other"]),
    phone: optional(z.string().trim().regex(/^\+?[\d\s()-]{9,20}$/)),
    email: optional(z.string().trim().toLowerCase().email().max(320)),
  }),
});

/** the admin session as a school-portal session (super admin = director rights in the school services) */
async function superAdminCtx() {
  const session = await getSession();
  if (!session) return { res: jsonError("Unauthorized", 401) };
  if (session.role !== "super_admin") return { res: jsonError("Forbidden", 403) };
  const s: SchoolSession = {
    id: session.id, email: session.email, name: session.name, role: "super_admin", demo: session.demo,
    teacherId: null, studentIds: [], mustChangePassword: false,
  };
  return { session, ctx: await loadCtx(s) };
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const r = await superAdminCtx();
    if (r.res) return r.res;
    const classes = r.ctx.classes.map((c) => ({ id: c.id, name: `${c.grade}${c.letter}` }));
    return NextResponse.json({ ok: true, classes, domain: schoolEmailDomain(), demo: r.session.demo }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const bad = checkMutation(req, { maxBytes: 8192 });
  if (bad) return bad;
  try {
    const r = await superAdminCtx();
    if (r.res) return r.res;
    const limited = await enforceRateLimit(req, { key: "admin:enroll", identity: r.session.id, max: 60, windowSec: 600 });
    if (limited) return jsonError("Too many requests", 429, { code: "rate_limited" });
    const raw = await parseBody(req, z.unknown(), { maxBytes: 8192 });
    if (!raw.ok) return raw.res;
    const body = schema.safeParse(raw.data);
    // field paths ("student.last_name", "guardian.phone") so the form can mark the exact inputs
    if (!body.success) return jsonError("validation", 422, { code: "validation", fields: [...new Set(body.error.issues.map((i) => i.path.join(".")))] });
    const out = await enrollStudent(r.ctx, body.data as Parameters<typeof enrollStudent>[1]);
    return NextResponse.json({ ok: true, ...out }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

function fail(e: unknown): NextResponse {
  if (isSchoolError(e)) {
    if (e.status >= 500) console.error("[admin:enroll]", e.message.slice(0, 200));
    // the parent's own e-mail is already used by another login
    const code = e.code === "conflict" ? "email_taken" : e.code;
    return jsonError(code, e.status, { code });
  }
  console.error("[admin:enroll]", e instanceof Error ? e.message.slice(0, 200) : "unknown");
  return jsonError("server_error", 500, { code: "server_error" });
}
