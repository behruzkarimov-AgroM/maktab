// Shared fixture for the Supabase-mode simulation tests: the real supabase/schema.sql in PGlite + a small school with one account per role.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addUser, PgGateway } from "./pglite-supabase";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const U = {
  dir: "a1111111-1111-4111-8111-111111111111",
  tA: "a2222222-2222-4222-8222-222222222222", // homeroom + math teacher of class A
  tB: "a3333333-3333-4333-8333-333333333333", // math teacher of class B
  par: "a4444444-4444-4444-8444-444444444444", // guardian of s1 (class A)
  stu: "a5555555-5555-4555-8555-555555555555", // pupil s2 (class A)
  par2: "a6666666-6666-4666-8666-666666666666", // guardian of s7 (class B)
};
export const PASSWORD = "Secret-pass-1";
export const CLS_A = id(9201);
export const CLS_B = id(9202);
export const SUBJ_MATH = id(9104);
export const SUBJ_PHYS = id(9105);
export const TERM1 = id(9011);
export const TERM2 = id(9012);
export const YEAR = id(9001);
export const TEA = id(9401);
export const TEB = id(9402);
export const GU1 = id(9501);
export const GU2 = id(9502);
/** class A: s1..s6, class B: s7 */
export const ST = { s1: id(9301), s2: id(9302), s3: id(9303), s4: id(9304), s5: id(9305), s6: id(9306), s7: id(9307) };
export const GRADE_DATE = "2026-09-10"; // inside term 1, in the past

export interface Fixture {
  db: PGlite;
  gw: PgGateway;
}

export async function buildFixture(): Promise<Fixture> {
  const db = new PGlite();
  await db.exec(readFileSync(join(process.cwd(), "scripts/db/stubs.sql"), "utf8"));
  await db.exec(readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8"));
  const gw = await new PgGateway(db).init();
  for (const [k, uid] of Object.entries(U)) await addUser(gw, `${k}@school.test`, PASSWORD, uid, `Full ${k}`);
  const q = (sql: string, p?: unknown[]) => gw.raw((x) => x(sql, p));
  await q("update public.profiles set role='school_admin' where id=$1", [U.dir]);
  await q("update public.profiles set role='teacher' where id in ($1,$2)", [U.tA, U.tB]);
  await q("update public.profiles set role='parent' where id in ($1,$2)", [U.par, U.par2]);
  await q("update public.profiles set role='student' where id=$1", [U.stu]);
  await q("insert into public.teachers (id, user_id, full_name) values ($1,$2,'Teacher A'),($3,$4,'Teacher B')", [TEA, U.tA, TEB, U.tB]);
  await q("update public.classes set homeroom_teacher_id=$1 where id=$2", [TEA, CLS_A]);
  await q("insert into public.teaching_assignments (class_id, subject_id, teacher_id) values ($1,$2,$3),($4,$2,$5)", [CLS_A, SUBJ_MATH, TEA, CLS_B, TEB]);
  const rows = [
    [ST.s1, null, "Ali", "Aliev", CLS_A, "T1"], [ST.s2, U.stu, "Vali", "Valiev", CLS_A, "T2"], [ST.s3, null, "Soli", "Soliev", CLS_A, "T3"],
    [ST.s4, null, "Dilya", "Dilov", CLS_A, "T4"], [ST.s5, null, "Eli", "Elov", CLS_A, "T5"], [ST.s6, null, "Fari", "Farov", CLS_A, "T6"],
    [ST.s7, null, "Gani", "Ganiev", CLS_B, "T7"],
  ];
  for (const [sid, uid, first, last, cls, code] of rows) {
    await q("insert into public.students (id, user_id, first_name, last_name, class_id, student_code) values ($1,$2,$3,$4,$5,$6)", [sid, uid, first, last, cls, code]);
  }
  await q("insert into public.guardians (id, user_id, full_name) values ($1,$2,'Parent One'),($3,$4,'Parent Two')", [GU1, U.par, GU2, U.par2]);
  await q("insert into public.student_guardians (student_id, guardian_id, is_primary) values ($1,$2,true),($3,$4,true)", [ST.s1, GU1, ST.s7, GU2]);
  return { db, gw };
}
