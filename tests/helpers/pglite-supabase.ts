/* eslint-disable @typescript-eslint/no-explicit-any */
// A small supabase-js compatible client on top of PGlite, used to run lib/school/db-supabase.ts, auth.ts, provision.ts, account.ts ...
// "end to end" against the REAL supabase/schema.sql without a Supabase project.
//
// Fidelity goals (what makes this more than a mock):
//   * every request is ONE transaction with `set local role <anon|authenticated|service_role>` and request.jwt.claims set, exactly like
//     PostgREST, so GRANTs, RLS policies, SECURITY DEFINER functions and auth.uid() behave as in production;
//   * rows come back as JSON produced by Postgres (dates as 'YYYY-MM-DD', numeric as numbers, jsonb as objects) like PostgREST responses;
//   * errors are { message, code (SQLSTATE), details, hint } like PostgREST, so lib/school/db-supabase.ts mapError() is exercised;
//   * rpc() uses named arguments cast to the declared parameter types (PostgREST semantics).
// Supported query surface = what the project uses: from().select/insert/update/upsert/delete, eq/neq/is/in/gt/gte/lt/lte/like/ilike/not/or,
// order/limit/range/single/maybeSingle, count:'exact', head. Embedded resources (a(b)) are NOT supported and throw.
// Auth surface: getUser, signInWithPassword, signOut, updateUser, resetPasswordForEmail, exchangeCodeForSession, verifyOtp, admin.createUser /
// updateUserById / deleteUser (auth.users rows are real, so the handle_new_user trigger creates the profile).
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";

export type Role = "anon" | "authenticated" | "service_role";
export interface PgErr { message: string; code: string; details: string | null; hint: string | null }
export interface Result<T = any> { data: T | null; error: PgErr | null; count?: number | null }

type Exec = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
const IDENT = /^[a-z_][a-z0-9_]*$/i;
const ident = (s: string) => {
  if (!IDENT.test(s)) throw new Error(`pglite-supabase: bad identifier "${s}"`);
  return `"${s}"`;
};
const toErr = (e: any): PgErr => ({ message: String(e?.message ?? e), code: String(e?.code ?? "XX000"), details: e?.detail ?? null, hint: e?.hint ?? null });

interface FnMeta { names: string[]; types: string[]; set: boolean; nreq: number }

export class PgGateway {
  private chain: Promise<unknown> = Promise.resolve();
  private colTypes = new Map<string, Map<string, string>>(); // table -> col -> format_type
  private pks = new Map<string, string[]>();
  private fns = new Map<string, FnMeta>();
  /** auth.users emulation: id -> credentials */
  users = new Map<string, { id: string; email: string; password: string }>();
  /** recovery tokens handed out by the fake mailer: token -> user id */
  recoveryTokens = new Map<string, string>();
  sentResets: { email: string; redirectTo?: string }[] = [];

  constructor(readonly db: PGlite) {}

  /** reads catalog metadata (run once, as superuser, after the schema is loaded) */
  async init(): Promise<this> {
    for (const r of (await this.db.query(`select c.relname t, a.attname col, format_type(a.atttypid, a.atttypmod) ty
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and c.relkind in ('r','v')`)).rows as any[]) {
      if (!this.colTypes.has(r.t)) this.colTypes.set(r.t, new Map());
      this.colTypes.get(r.t)!.set(r.col, r.ty);
    }
    for (const r of (await this.db.query(`select c.relname t, (select array_agg(a.attname order by k.o) from unnest(i.indkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n) cols
        from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and i.indisprimary`)).rows as any[]) {
      this.pks.set(r.t, r.cols);
    }
    for (const r of (await this.db.query(`select p.proname n, p.proargnames an, p.proretset rs, p.pronargs na, p.pronargdefaults nd,
        (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) ty
        from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prokind = 'f'`)).rows as any[]) {
      this.fns.set(r.n, { names: r.an ?? [], types: r.ty ?? [], set: r.rs, nreq: r.na - r.nd });
    }
    return this;
  }

  /** one PostgREST-like request: own transaction, role + claims applied with SET LOCAL */
  run<T>(role: Role, uid: string | null, fn: (x: Exec) => Promise<T>): Promise<T> {
    const job = this.chain.then(async () => {
      await this.db.exec("begin");
      try {
        await this.db.exec(`set local role ${role}`);
        const claims = JSON.stringify(uid ? { sub: uid, role } : { role });
        await this.db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)", [claims, uid ?? "", role]);
        const out = await fn((sql, params) => this.db.query(sql, params) as any);
        await this.db.exec("commit");
        return out;
      } catch (e) {
        await this.db.exec("rollback").catch(() => null);
        throw e;
      }
    });
    this.chain = job.catch(() => null);
    return job;
  }

  /** superuser lane (auth.users bookkeeping); serialised with run() */
  raw<T>(fn: (x: Exec) => Promise<T>): Promise<T> {
    const job = this.chain.then(() => fn((sql, params) => this.db.query(sql, params) as any));
    this.chain = job.catch(() => null);
    return job as Promise<T>;
  }

  colType(table: string, col: string): string {
    const t = this.colTypes.get(table);
    if (!t) throw new PgFail({ message: `relation "public.${table}" does not exist`, code: "42P01", details: null, hint: null });
    const ty = t.get(col);
    if (!ty) throw new PgFail({ message: `column "${col}" of relation "${table}" does not exist`, code: "42703", details: null, hint: null });
    return ty;
  }
  pk(table: string): string[] {
    return this.pks.get(table) ?? [];
  }
  fn(name: string): FnMeta | undefined {
    return this.fns.get(name);
  }

  client(role: Role, uid: string | null = null): FakeSupabase {
    return new FakeSupabase(this, role, uid);
  }
  /** client as the service role (bypasses RLS) */
  service(): FakeSupabase {
    return this.client("service_role");
  }
  /** client of a signed-in user (role `authenticated`, JWT sub = uid) */
  as(uid: string): FakeSupabase {
    return this.client("authenticated", uid);
  }
  anon(): FakeSupabase {
    return this.client("anon");
  }
}

class PgFail extends Error {
  constructor(readonly err: PgErr) {
    super(err.message);
  }
}

/* --------------------------------- query builder --------------------------------- */

type Param = unknown;
interface Ctx2 { params: Param[]; table: string; gw: PgGateway }
const bind = (cx: Ctx2, col: string, value: unknown): string => {
  const ty = cx.gw.colType(cx.table, col);
  cx.params.push(/^jsonb?$/.test(ty) && value !== null && typeof value !== "undefined" ? JSON.stringify(value) : value);
  return `$${cx.params.length}::${ty}`;
};
const OPS: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };

function cond(cx: Ctx2, col: string, op: string, value: unknown): string {
  col = col.split("->")[0];
  const c = ident(col);
  if (op === "is") return value === null ? `${c} is null` : `${c} is ${value ? "true" : "false"}`;
  if (op === "in") {
    const list = Array.isArray(value) ? value : String(value).replace(/^\(|\)$/g, "").split(",").map((x) => x.trim());
    return list.length ? `${c} in (${list.map((v) => bind(cx, col, v)).join(", ")})` : "false";
  }
  if (!OPS[op]) throw new Error(`pglite-supabase: operator ${op} not supported`);
  return `${c} ${OPS[op]} ${bind(cx, col, value)}`;
}

function parseOr(cx: Ctx2, expr: string): string {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of expr) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return `(${parts.map((p) => {
    const [col, op, ...rest] = p.split(".");
    const raw = rest.join(".");
    return cond(cx, col, op, op === "is" ? (raw === "null" ? null : raw === "true") : raw);
  }).join(" or ")})`;
}

class Builder implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private cols = "*";
  private returning = false;
  private payload: any;
  private opts: any = {};
  private conds: ((cx: Ctx2) => string)[] = [];
  private orders: [string, boolean][] = [];
  private lim: number | null = null;
  private off = 0;
  private mode: "many" | "single" | "maybe" = "many";
  private wantCount = false;
  private head = false;

  constructor(private gw: PgGateway, private role: Role, private uid: string | null, private table: string) {}

  select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (/[()]/.test(cols)) throw new Error(`pglite-supabase: embedded resources are not supported (${cols})`);
    this.cols = cols.replace(/\s+/g, "");
    if (this.op === "select") {
      this.wantCount = opts.count === "exact";
      this.head = !!opts.head;
    } else this.returning = true;
    return this;
  }
  insert(rows: any, opts: any = {}) {
    this.op = "insert";
    this.payload = rows;
    this.opts = opts;
    return this;
  }
  update(patch: any, opts: any = {}) {
    this.op = "update";
    this.payload = patch;
    this.opts = opts;
    return this;
  }
  upsert(rows: any, opts: any = {}) {
    this.op = "upsert";
    this.payload = rows;
    this.opts = opts;
    return this;
  }
  delete(opts: any = {}) {
    this.op = "delete";
    this.opts = opts;
    return this;
  }
  private f(fn: (cx: Ctx2) => string) {
    this.conds.push(fn);
    return this;
  }
  eq(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "eq", v)); }
  neq(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "neq", v)); }
  gt(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "gt", v)); }
  gte(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "gte", v)); }
  lt(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "lt", v)); }
  lte(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "lte", v)); }
  like(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "like", v)); }
  ilike(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "ilike", v)); }
  is(c: string, v: unknown) { return this.f((cx) => cond(cx, c, "is", v)); }
  in(c: string, v: readonly unknown[]) { return this.f((cx) => cond(cx, c, "in", v)); }
  not(c: string, op: string, v: unknown) { return this.f((cx) => `not (${cond(cx, c, op, op === "is" && v === "null" ? null : v)})`); }
  or(expr: string) { return this.f((cx) => parseOr(cx, expr)); }
  match(o: Record<string, unknown>) { Object.entries(o).forEach(([k, v]) => this.eq(k, v)); return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.orders.push([c, o.ascending !== false]); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.off = a; this.lim = b - a + 1; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  abortSignal() { return this; }
  returns() { return this; }

  private where(cx: Ctx2): string {
    return this.conds.length ? ` where ${this.conds.map((c) => c(cx)).join(" and ")}` : "";
  }
  private projection(rows: any[]): any[] {
    if (this.cols === "*") return rows;
    const keys = this.cols.split(",").map((c) => c.split(":").pop()!.split("::")[0]);
    return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
  }

  private async exec(x: Exec): Promise<Result> {
    const t = `public.${ident(this.table)}`;
    const cx: Ctx2 = { params: [], table: this.table, gw: this.gw };
    if (this.op === "select") {
      const w = this.where(cx);
      const ord = this.orders.length ? ` order by ${this.orders.map(([c, a]) => `${ident(c)} ${a ? "asc" : "desc"}`).join(", ")}` : "";
      const page = `${this.lim !== null ? ` limit ${this.lim}` : ""}${this.off ? ` offset ${this.off}` : ""}`;
      const cols = this.cols === "*" ? "*" : this.cols.split(",").map((c) => ident(c.split(":").pop()!.split("::")[0])).join(", ");
      let count: number | null = null;
      if (this.wantCount) {
        const n = await x(`select count(*)::int c from ${t}${w}`, cx.params);
        count = n.rows[0].c;
      }
      if (this.head) return { data: null, error: null, count };
      const r = await x(`select coalesce(json_agg(q), '[]'::json) j from (select ${cols} from ${t}${w}${ord}${page}) q`, cx.params);
      return this.shape(r.rows[0].j, count);
    }
    // mutations: run each statement, collect the affected rows as JSON
    const out: any[] = [];
    const wrap = async (sql: string, params: unknown[]) => {
      const r = await x(`with r as (${sql} returning *) select coalesce(json_agg(r), '[]'::json) j from r`, params);
      out.push(...r.rows[0].j);
    };
    if (this.op === "insert" || this.op === "upsert") {
      const rows: Record<string, unknown>[] = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const row of rows) {
        const c2: Ctx2 = { params: [], table: this.table, gw: this.gw };
        const keys = Object.keys(row).filter((k) => row[k] !== undefined);
        let sql = keys.length
          ? `insert into ${t} (${keys.map(ident).join(", ")}) values (${keys.map((k) => bind(c2, k, row[k])).join(", ")})`
          : `insert into ${t} default values`;
        if (this.op === "upsert") {
          const oc: string[] = this.opts.onConflict ? String(this.opts.onConflict).split(",").map((s: string) => s.trim()) : this.gw.pk(this.table);
          const set = keys.filter((k) => !oc.includes(k));
          sql += this.opts.ignoreDuplicates || !set.length
            ? ` on conflict (${oc.map(ident).join(", ")}) do nothing`
            : ` on conflict (${oc.map(ident).join(", ")}) do update set ${set.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`;
        }
        await wrap(sql, c2.params);
      }
    } else if (this.op === "update") {
      const keys = Object.keys(this.payload).filter((k) => this.payload[k] !== undefined);
      const sets = keys.map((k) => `${ident(k)} = ${bind(cx, k, this.payload[k])}`).join(", ");
      await wrap(`update ${t} set ${sets}${this.where(cx)}`, cx.params);
    } else {
      await wrap(`delete from ${t}${this.where(cx)}`, cx.params);
    }
    if (!this.returning) return { data: null, error: null, count: this.opts.count === "exact" ? out.length : null };
    return this.shape(out, null);
  }

  private shape(rows: any[], count: number | null): Result {
    const data = this.projection(rows);
    if (this.mode === "many") return { data, error: null, count };
    if (data.length === 1) return { data: data[0], error: null, count };
    if (this.mode === "maybe" && data.length === 0) return { data: null, error: null, count };
    return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: `The result contains ${data.length} rows`, hint: null }, count };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    const p: Promise<Result> = this.gw
      .run(this.role, this.uid, (x) => this.exec(x))
      .catch((e: any) => ({ data: null, error: e instanceof PgFail ? e.err : toErr(e) }));
    return p.then(ok, bad);
  }
}

/* --------------------------------- client --------------------------------- */

export class FakeSupabase {
  auth: any;
  /** user id the cookie session belongs to (changes with exchangeCodeForSession / verifyOtp) */
  sessionUid: string | null;
  constructor(private gw: PgGateway, private role: Role, uid: string | null) {
    this.sessionUid = uid;
    this.auth = this.makeAuth();
  }
  from(table: string) {
    return new Builder(this.gw, this.role, this.sessionUid, table);
  }
  async rpc(name: string, args: Record<string, unknown> = {}): Promise<Result> {
    const meta = this.gw.fn(name);
    if (!meta) return { data: null, error: { message: `Could not find the function public.${name} in the schema cache`, code: "PGRST202", details: null, hint: null } };
    const keys = Object.keys(args);
    const unknown = keys.filter((k) => !meta.names.includes(k));
    if (unknown.length) return { data: null, error: { message: `Could not find the function public.${name}(${keys.join(", ")}) in the schema cache`, code: "PGRST202", details: null, hint: "unknown argument(s): " + unknown.join(", ") } };
    const missing = meta.names.slice(0, meta.nreq).filter((k) => !keys.includes(k));
    if (missing.length) return { data: null, error: { message: `Could not find the function public.${name}(${keys.join(", ")}) in the schema cache`, code: "PGRST202", details: null, hint: "missing argument(s): " + missing.join(", ") } };
    const params: unknown[] = [];
    const named = keys.map((k) => {
      const ty = meta.types[meta.names.indexOf(k)];
      const v = args[k];
      params.push(/^jsonb?$/.test(ty) && v !== null ? JSON.stringify(v) : v);
      return `${ident(k)} => $${params.length}::${ty}`;
    });
    try {
      return await this.gw.run(this.role, this.sessionUid, async (x) => {
        const call = `public.${ident(name)}(${named.join(", ")})`;
        const r = meta.set
          ? await x(`select coalesce(json_agg(f), '[]'::json) j from ${call} f`, params)
          : await x(`select to_json(${call}) j`, params);
        return { data: r.rows[0].j, error: null } as Result;
      });
    } catch (e: any) {
      return { data: null, error: e instanceof PgFail ? e.err : toErr(e) };
    }
  }

  private makeAuth() {
    const gw = this.gw;
    const userOf = (id: string) => ({ id, email: gw.users.get(id)?.email ?? "", user_metadata: {} });
    const fail = (message: string, status = 400) => ({ data: { user: null, session: null }, error: { message, status } });
    return {
      getUser: async () => (this.sessionUid && gw.users.has(this.sessionUid) ? { data: { user: userOf(this.sessionUid) }, error: null } : { data: { user: null }, error: { message: "Auth session missing!" } }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const u = [...gw.users.values()].find((x) => x.email === email);
        if (!u || u.password !== password) return fail("Invalid login credentials");
        this.sessionUid = u.id;
        return { data: { user: userOf(u.id), session: { access_token: "t" } }, error: null };
      },
      signOut: async () => {
        this.sessionUid = null;
        return { error: null };
      },
      updateUser: async ({ password }: { password?: string }) => {
        const u = this.sessionUid ? gw.users.get(this.sessionUid) : undefined;
        if (!u) return { data: { user: null }, error: { message: "Auth session missing!" } };
        if (password !== undefined) {
          if (password.length < 6) return { data: { user: null }, error: { message: "Password should be at least 6 characters." } };
          if (password === u.password) return { data: { user: null }, error: { message: "New password should be different from the old password." } };
          u.password = password;
        }
        return { data: { user: userOf(u.id) }, error: null };
      },
      resetPasswordForEmail: async (email: string, opts?: { redirectTo?: string }) => {
        gw.sentResets.push({ email, redirectTo: opts?.redirectTo }); // Supabase answers success for unknown addresses too
        return { data: {}, error: null };
      },
      exchangeCodeForSession: async (code: string) => {
        const id = gw.recoveryTokens.get(code);
        if (!id) return fail("invalid flow state, no valid flow state found");
        this.sessionUid = id;
        return { data: { user: userOf(id), session: { access_token: "t" } }, error: null };
      },
      verifyOtp: async ({ token_hash }: { token_hash: string; type: string }) => {
        const id = gw.recoveryTokens.get(token_hash);
        if (!id) return fail("Email link is invalid or has expired");
        this.sessionUid = id;
        return { data: { user: userOf(id), session: { access_token: "t" } }, error: null };
      },
      admin: {
        createUser: async ({ email, password, user_metadata }: { email: string; password: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) => {
          if ([...gw.users.values()].some((u) => u.email === email)) return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
          const id = randomUUID();
          await gw.raw((x) => x("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email, JSON.stringify(user_metadata ?? {})]));
          gw.users.set(id, { id, email, password });
          return { data: { user: userOf(id) }, error: null };
        },
        getUserById: async (id: string) => (gw.users.has(id) ? { data: { user: userOf(id) }, error: null } : { data: { user: null }, error: { message: "User not found" } }),
        listUsers: async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) => ({
          data: { users: [...gw.users.values()].slice((page - 1) * perPage, page * perPage).map((u) => ({ id: u.id, email: u.email })) },
          error: null,
        }),
        updateUserById: async (id: string, patch: { password?: string }) => {
          const u = gw.users.get(id);
          if (!u) return { data: { user: null }, error: { message: "User not found" } };
          if (patch.password) u.password = patch.password;
          return { data: { user: userOf(id) }, error: null };
        },
        deleteUser: async (id: string) => {
          await gw.raw((x) => x("delete from auth.users where id = $1", [id]));
          gw.users.delete(id);
          return { data: {}, error: null };
        },
      },
    };
  }
}

/** registers an auth user (credentials + auth.users row, so the profile trigger runs) and returns its id */
export async function addUser(gw: PgGateway, email: string, password: string, id: string = randomUUID(), fullName = ""): Promise<string> {
  await gw.raw((x) => x("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email, JSON.stringify({ full_name: fullName })]));
  gw.users.set(id, { id, email, password });
  return id;
}
