/* eslint-disable @typescript-eslint/no-explicit-any */
// Self-hosted replacement for the Supabase services the app uses, on top of a plain PostgreSQL database (no Supabase project).
// It speaks the subset of the supabase-js API the code base calls, so lib/school/db-supabase.ts, lib/admin/store.ts, the public
// pages, RPCs, accounts and uploads run unchanged:
//   * from().select/insert/update/upsert/delete + filters / order / range / single / count (PostgREST semantics)
//   * rpc() with named arguments cast to the declared parameter types
//   * auth: password sign-in (scrypt hashes in auth.users), session via a SessionPort (signed cookie in lib/localdb/server.ts),
//     getUser / signOut / updateUser and admin.createUser / updateUserById / deleteUser / getUserById / listUsers
//   * storage: files on disk (UPLOAD_DIR), public URLs under /media/<bucket>/<path>
// Every request is ONE transaction with `set local role anon|authenticated|service_role` and the JWT claims set exactly like
// PostgREST does, so GRANTs, RLS policies, SECURITY DEFINER functions and auth.uid() in supabase/schema.sql behave as on Supabase.
// The same code runs on PGlite in the tests (tests/localdb.test.ts) and on node-postgres in production (lib/localdb/server.ts).
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export type Role = "anon" | "authenticated" | "service_role";
export interface PgErr { message: string; code: string; details: string | null; hint: string | null }
export interface Result<T = any> { data: T | null; error: PgErr | null; count?: number | null }

/** one database connection taken from a pool (node-postgres PoolClient, or a PGlite adapter in tests) */
export interface Conn {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  release(): void;
}
export type Connect = () => Promise<Conn>;

/** where the signed-in user lives between requests (a cookie in the app, a variable in tests) */
export interface SessionPort {
  get(): string | null;
  set(userId: string): void;
  clear(): void;
}

type Exec = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
const IDENT = /^[a-z_][a-z0-9_]*$/i;
const ident = (s: string) => {
  if (!IDENT.test(s)) throw new PgFail({ message: `bad identifier "${s}"`, code: "42602", details: null, hint: null });
  return `"${s}"`;
};
const toErr = (e: any): PgErr => ({ message: String(e?.message ?? e), code: String(e?.code ?? "XX000"), details: e?.detail ?? null, hint: e?.hint ?? null });

class PgFail extends Error {
  constructor(readonly err: PgErr) {
    super(err.message);
  }
}

interface FnMeta { names: string[]; types: string[]; set: boolean; nreq: number }

export interface GatewayOptions {
  /** directory for uploaded files (storage buckets); uploads fail when unset */
  storageDir?: string;
  /** buckets whose files are publicly readable under /media/<bucket>/... */
  publicBuckets?: string[];
}

export class LocalGateway {
  private colTypes = new Map<string, Map<string, string>>();
  private pks = new Map<string, string[]>();
  private fns = new Map<string, FnMeta>();
  private ready: Promise<void> | null = null;

  constructor(private connect: Connect, readonly opts: GatewayOptions = {}) {}

  /** catalog metadata (column types, primary keys, function signatures); loaded once, lazily */
  private init(): Promise<void> {
    this.ready ??= (async () => {
      const c = await this.connect();
      try {
        for (const r of (await c.query(`select c.relname t, a.attname col, format_type(a.atttypid, a.atttypmod) ty
            from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and c.relkind in ('r','v','m')`)).rows) {
          if (!this.colTypes.has(r.t)) this.colTypes.set(r.t, new Map());
          this.colTypes.get(r.t)!.set(r.col, r.ty);
        }
        for (const r of (await c.query(`select c.relname t, (select array_agg(a.attname order by k.o) from unnest(i.indkey) with ordinality k(n, o)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n) cols
            from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and i.indisprimary`)).rows) {
          this.pks.set(r.t, r.cols);
        }
        for (const r of (await c.query(`select p.proname n, p.proargnames an, p.proretset rs, p.pronargs na, p.pronargdefaults nd,
            (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) ty
            from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prokind = 'f'`)).rows) {
          this.fns.set(r.n, { names: r.an ?? [], types: r.ty ?? [], set: r.rs, nreq: r.na - r.nd });
        }
      } finally {
        c.release();
      }
    })().catch((e) => {
      this.ready = null; // retry on the next request (e.g. the database was not up yet)
      throw e;
    });
    return this.ready;
  }

  /** one PostgREST-like request: own transaction, role + JWT claims applied with SET LOCAL */
  async run<T>(role: Role, uid: string | null, fn: (x: Exec) => Promise<T>): Promise<T> {
    await this.init();
    const c = await this.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${role}`);
      const claims = JSON.stringify(uid ? { sub: uid, role } : { role });
      await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)", [claims, uid ?? "", role]);
      const out = await fn((sql, params) => c.query(sql, params));
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback").catch(() => null);
      throw e;
    } finally {
      c.release();
    }
  }

  /** the connection's own role (database owner): auth.users bookkeeping only */
  async raw<T>(fn: (x: Exec) => Promise<T>): Promise<T> {
    const c = await this.connect();
    try {
      return await fn((sql, params) => c.query(sql, params));
    } finally {
      c.release();
    }
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
  async fn(name: string): Promise<FnMeta | undefined> {
    await this.init();
    return this.fns.get(name);
  }

  client(role: Role, session?: SessionPort): LocalClient {
    return new LocalClient(this, role, session);
  }
}

/* --------------------------------- query builder --------------------------------- */

interface Ctx2 { params: unknown[]; table: string; gw: LocalGateway }
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
  if (!OPS[op]) throw new PgFail({ message: `operator ${op} is not supported`, code: "PGRST100", details: null, hint: null });
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
  private orders: [string, boolean, boolean | undefined][] = [];
  private lim: number | null = null;
  private off = 0;
  private mode: "many" | "single" | "maybe" = "many";
  private wantCount = false;
  private head = false;

  constructor(private gw: LocalGateway, private role: Role, private uid: string | null, private table: string) {}

  select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (/[()]/.test(cols)) throw new Error(`localdb: embedded resources are not supported (${cols})`);
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
  order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) { this.orders.push([c, o.ascending !== false, o.nullsFirst]); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.off = a; this.lim = b - a + 1; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  abortSignal() { return this; }
  returns() { return this; }

  private where(cx: Ctx2): string {
    return this.conds.length ? ` where ${this.conds.map((c) => c(cx)).join(" and ")}` : "";
  }
  private colList(): string[] {
    return this.cols.split(",").map((c) => c.split(":").pop()!.split("::")[0]);
  }
  private projection(rows: any[]): any[] {
    if (this.cols === "*") return rows;
    const keys = this.colList();
    return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
  }

  private async exec(x: Exec): Promise<Result> {
    const t = `public.${ident(this.table)}`;
    const cx: Ctx2 = { params: [], table: this.table, gw: this.gw };
    if (this.op === "select") {
      const w = this.where(cx);
      const ord = this.orders.length
        ? ` order by ${this.orders.map(([c, a, nf]) => `${ident(c)} ${a ? "asc" : "desc"}${nf === undefined ? "" : nf ? " nulls first" : " nulls last"}`).join(", ")}`
        : "";
      const page = `${this.lim !== null ? ` limit ${Number(this.lim)}` : ""}${this.off ? ` offset ${Number(this.off)}` : ""}`;
      const cols = this.cols === "*" ? "*" : this.colList().map(ident).join(", ");
      let count: number | null = null;
      if (this.wantCount) {
        const n = await x(`select count(*)::int c from ${t}${w}`, cx.params);
        count = n.rows[0].c;
      }
      if (this.head) return { data: null, error: null, count };
      const r = await x(`select coalesce(json_agg(q), '[]'::json) j from (select ${cols} from ${t}${w}${ord}${page}) q`, cx.params);
      return this.shape(r.rows[0].j, count);
    }
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

/* --------------------------------- passwords --------------------------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scrypt = (pw: string, salt: Buffer, len: number, o: ScryptOptions) =>
  new Promise<Buffer>((ok, bad) => scryptCb(pw, salt, len, o, (e, k) => (e ? bad(e) : ok(k))));

/** "scrypt$N$r$p$<salt b64>$<hash b64>" */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  // unknown user / malformed hash: still spend the same time, so the response time does not reveal which e-mails exist
  const ok = parts.length === 6 && parts[0] === "scrypt";
  const salt = ok ? Buffer.from(parts[4], "base64") : Buffer.alloc(16);
  const want = ok ? Buffer.from(parts[5], "base64") : Buffer.alloc(64);
  const opts = ok ? { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), maxmem: SCRYPT.maxmem } : SCRYPT;
  const got = await scrypt(pw, salt, want.length || 64, opts);
  return ok && got.length === want.length && timingSafeEqual(got, want);
}

/* --------------------------------- client --------------------------------- */

const userOf = (r: { id: string; email: string | null; raw_user_meta_data?: any }) => ({ id: r.id, email: r.email ?? "", user_metadata: r.raw_user_meta_data ?? {} });
const fail = (message: string, status = 400, code?: string) => ({ data: { user: null, session: null }, error: { message, status, code } });

export class LocalClient {
  auth: any;
  storage: { from(bucket: string): any };

  constructor(private gw: LocalGateway, private role: Role, private session?: SessionPort) {
    this.auth = this.makeAuth();
    this.storage = { from: (bucket: string) => this.bucket(bucket) };
  }

  /** the signed-in user for a user-bound client (null = anonymous) */
  private uid(): string | null {
    return this.role === "service_role" ? null : this.session?.get() ?? null;
  }
  private effectiveRole(): Role {
    return this.role === "service_role" ? "service_role" : this.uid() ? "authenticated" : "anon";
  }

  from(table: string) {
    return new Builder(this.gw, this.effectiveRole(), this.uid(), table);
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<Result> {
    const meta = await this.gw.fn(name).catch(() => undefined);
    if (!meta) return { data: null, error: { message: `Could not find the function public.${name} in the schema cache`, code: "PGRST202", details: null, hint: null } };
    const keys = Object.keys(args).filter((k) => args[k] !== undefined);
    const unknown = keys.filter((k) => !meta.names.includes(k));
    if (unknown.length) return { data: null, error: { message: `Could not find the function public.${name}(${keys.join(", ")}) in the schema cache`, code: "PGRST202", details: null, hint: `unknown argument(s): ${unknown.join(", ")}` } };
    const params: unknown[] = [];
    const named = keys.map((k) => {
      const ty = meta.types[meta.names.indexOf(k)];
      const v = args[k];
      params.push(/^jsonb?$/.test(ty) && v !== null ? JSON.stringify(v) : v);
      return `${ident(k)} => $${params.length}::${ty}`;
    });
    try {
      return await this.gw.run(this.effectiveRole(), this.uid(), async (x) => {
        const call = `public.${ident(name)}(${named.join(", ")})`;
        const r = meta.set ? await x(`select coalesce(json_agg(f), '[]'::json) j from ${call} f`, params) : await x(`select to_json(${call}) j`, params);
        return { data: r.rows[0].j, error: null } as Result;
      });
    } catch (e: any) {
      return { data: null, error: e instanceof PgFail ? e.err : toErr(e) };
    }
  }

  // ------------------------------------------------------------------ storage (files on disk)
  private bucket(bucket: string) {
    const root = this.gw.opts.storageDir;
    const safe = (path: string) => {
      if (!root) throw new Error("UPLOAD_DIR is not configured");
      if (!/^[a-z0-9-]+$/.test(bucket) || !/^[\w./-]+$/.test(path) || path.split("/").some((s) => s === ".." || s === "")) throw new Error("invalid path");
      const full = resolve(root, bucket, path);
      if (!full.startsWith(resolve(root) + sep)) throw new Error("invalid path");
      return full;
    };
    return {
      upload: async (path: string, bytes: Uint8Array | Buffer, opts: { upsert?: boolean } = {}) => {
        try {
          const full = safe(path);
          if (!opts.upsert && (await stat(full).then(() => true, () => false))) return { data: null, error: { message: "The resource already exists" } };
          await mkdir(dirname(full), { recursive: true });
          await writeFile(full, bytes);
          return { data: { path, id: randomUUID(), fullPath: join(bucket, path) }, error: null };
        } catch (e: any) {
          return { data: null, error: { message: String(e?.message ?? e) } };
        }
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `/media/${bucket}/${path}` } }),
    };
  }

  // ------------------------------------------------------------------ auth
  private makeAuth() {
    const gw = this.gw;
    const findByEmail = (x: Exec, email: string) =>
      x("select id, email, raw_user_meta_data, encrypted_password from auth.users where lower(email) = lower($1) limit 1", [email.trim()]).then((r) => r.rows[0]);
    const findById = (x: Exec, id: string) =>
      x("select id, email, raw_user_meta_data, encrypted_password from auth.users where id = $1", [id]).then((r) => r.rows[0]);
    const uuidOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

    return {
      getUser: async () => {
        const uid = this.uid();
        if (!uid || !uuidOk(uid)) return { data: { user: null }, error: { message: "Auth session missing!" } };
        const u = await gw.raw((x) => findById(x, uid)).catch(() => undefined);
        return u ? { data: { user: userOf(u) }, error: null } : { data: { user: null }, error: { message: "User not found" } };
      },
      getSession: async () => ({ data: { session: this.uid() ? { user: { id: this.uid() } } : null }, error: null }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const u = await gw.raw((x) => findByEmail(x, String(email ?? "")));
        const ok = await verifyPassword(String(password ?? ""), u?.encrypted_password ?? null);
        if (!u || !ok) return fail("Invalid login credentials", 400, "invalid_credentials");
        this.session?.set(u.id);
        return { data: { user: userOf(u), session: { access_token: "local" } }, error: null };
      },
      signOut: async () => {
        this.session?.clear();
        return { error: null };
      },
      updateUser: async ({ password }: { password?: string }) => {
        const uid = this.uid();
        if (!uid) return { data: { user: null }, error: { message: "Auth session missing!" } };
        const u = await gw.raw((x) => findById(x, uid));
        if (!u) return { data: { user: null }, error: { message: "User not found" } };
        if (password !== undefined) {
          if (password.length < 6) return { data: { user: null }, error: { message: "Password should be at least 6 characters." } };
          if (await verifyPassword(password, u.encrypted_password)) return { data: { user: null }, error: { message: "New password should be different from the old password." } };
          const h = await hashPassword(password);
          await gw.raw((x) => x("update auth.users set encrypted_password = $2, updated_at = now() where id = $1", [uid, h]));
        }
        return { data: { user: userOf(u) }, error: null };
      },
      // no mail server: the "forgot password" request is accepted silently (never reveals whether the address exists);
      // passwords are reset by the director / admin (provision.resetPassword)
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      exchangeCodeForSession: async () => fail("Password reset links are not available on this server", 400),
      verifyOtp: async () => fail("Password reset links are not available on this server", 400),
      admin: {
        createUser: async ({ email, password, user_metadata }: { email: string; password: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) => {
          const e = String(email ?? "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { data: { user: null }, error: { message: "Unable to validate email address: invalid format" } };
          const h = await hashPassword(String(password ?? ""));
          try {
            const r = await gw.raw((x) =>
              x("insert into auth.users (id, email, raw_user_meta_data, encrypted_password) values ($1, $2, $3, $4) returning id, email, raw_user_meta_data",
                [randomUUID(), e, JSON.stringify(user_metadata ?? {}), h]),
            );
            return { data: { user: userOf(r.rows[0]) }, error: null };
          } catch (err: any) {
            if (err?.code === "23505") return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
            return { data: { user: null }, error: { message: String(err?.message ?? err) } };
          }
        },
        updateUserById: async (id: string, patch: { password?: string; email?: string }) => {
          if (!uuidOk(id)) return { data: { user: null }, error: { message: "User not found" } };
          const u = await gw.raw((x) => findById(x, id));
          if (!u) return { data: { user: null }, error: { message: "User not found" } };
          if (patch.password) {
            const h = await hashPassword(patch.password);
            await gw.raw((x) => x("update auth.users set encrypted_password = $2, updated_at = now() where id = $1", [id, h]));
          }
          return { data: { user: userOf(u) }, error: null };
        },
        deleteUser: async (id: string) => {
          if (uuidOk(id)) await gw.raw((x) => x("delete from auth.users where id = $1", [id]));
          return { data: {}, error: null };
        },
        getUserById: async (id: string) => {
          const u = uuidOk(id) ? await gw.raw((x) => findById(x, id)) : undefined;
          return u ? { data: { user: userOf(u) }, error: null } : { data: { user: null }, error: { message: "User not found" } };
        },
        listUsers: async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) => {
          const r = await gw.raw((x) => x("select id, email, raw_user_meta_data from auth.users order by created_at, id limit $1 offset $2", [perPage, (page - 1) * perPage]));
          return { data: { users: r.rows.map(userOf) }, error: null };
        },
      },
    };
  }
}
