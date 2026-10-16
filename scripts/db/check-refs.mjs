// Static check of EVERY supabase-js reference in the project against the real schema (loaded into PGlite).
//   npm run db:refs            -> prints errors (exit 1) and a warning count
//   npm run db:refs -- --verbose   -> also prints every warning
//
// What is verified (lib/**, app/**, components/**, TypeScript AST + type checker):
//   * .from('t')            table exists (dynamic names are resolved through literal types / the CMS resource registry)
//   * .select('a,b,c(d)')   columns exist, embedded relations exist and are linked by a foreign key
//   * .insert/.update/.upsert({..})  keys are columns, literal values are legal enum / CHECK values, NOT NULL columns without default
//                           are present on inserts, upsert onConflict matches a real (non-partial) unique constraint/index
//   * .eq/.in/.order/.or/... columns (and literal values for enum/CHECK columns)
//   * .rpc('fn', {..})      function exists in schema public, argument names match pg_proc, required arguments present, executable
//   * typed layers          lib/supabase/database.types.ts (Tables.Row, Functions.Args, Enums) and lib/school/types.ts (TableRows)
//                           are compared with information_schema / pg_proc / pg_enum
//   * CMS resource registry (lib/admin/resources.ts + survey-resources.ts): table, fields, columns, sort and search names
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VERBOSE = process.argv.includes("--verbose");
const errors = [];
const warnings = [];
let checked = { from: 0, rpc: 0, cols: 0, typed: 0, registry: 0 };

/* ----------------------------- load the schema ----------------------------- */
const db = new PGlite();
await db.exec(readFileSync(join(root, "scripts/db/stubs.sql"), "utf8"));
await db.exec(readFileSync(join(root, "supabase/schema.sql"), "utf8"));
const q = async (sql, p) => (await db.query(sql, p)).rows;

const cols = new Map(); // table -> Map(col -> info)
for (const r of await q(`select table_name t, column_name c, data_type dt, udt_name u, is_nullable nl, column_default d, is_identity idn, is_generated gen
                         from information_schema.columns where table_schema='public' order by table_name, ordinal_position`)) {
  if (!cols.has(r.t)) cols.set(r.t, new Map());
  cols.get(r.t).set(r.c, r);
}
const enumVals = new Map(); // udt name -> Set
for (const r of await q(`select t.typname n, e.enumlabel l from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace s on s.oid=t.typnamespace where s.nspname='public'`)) {
  if (!enumVals.has(r.n)) enumVals.set(r.n, new Set());
  enumVals.get(r.n).add(r.l);
}
// simple CHECK (col IN (...)) -> allowed values
const checkVals = new Map(); // "table.col" -> Set
for (const r of await q(`select c.conrelid::regclass::text t, pg_get_constraintdef(c.oid) d from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='c' and n.nspname='public'`)) {
  const m = /^CHECK \(\(?\(?"?(\w+)"?\)?(?:::\w+)?\s*=\s*ANY\s*\(\(?ARRAY\[([^\]]*)\]/.exec(r.d);
  if (!m) continue;
  const vals = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
  if (vals.length) checkVals.set(`${r.t.replace(/^public\./, "")}.${m[1]}`, new Set(vals));
}
const fks = await q(`select c.conrelid::regclass::text a, c.confrelid::regclass::text b, c.conname n,
                            (select array_agg(attname) from pg_attribute where attrelid=c.conrelid and attnum = any(c.conkey)) cols
                     from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname='public'`);
const uniq = new Map(); // table -> array of sorted col lists (non-partial, non-expression unique indexes)
for (const r of await q(`select i.indrelid::regclass::text t, i.indisunique u, (i.indpred is null) np, (i.indexprs is null) ne,
                                (select array_agg(attname order by attname) from pg_attribute where attrelid=i.indrelid and attnum = any(i.indkey)) cols
                         from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and i.indisunique`)) {
  if (!r.np || !r.ne) continue;
  const t = r.t.replace(/^public\./, "");
  if (!uniq.has(t)) uniq.set(t, []);
  uniq.get(t).push(r.cols);
}
const funcs = new Map(); // name -> overloads [{names:[], types:[], nreq, anon, auth, svc}]
for (const r of await q(`select p.oid, p.proname n, p.pronargs na, p.pronargdefaults nd, p.proargnames an,
                                (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) ty,
                                has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth,
                                has_function_privilege('service_role', p.oid, 'execute') svc
                         from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.prokind='f'`)) {
  if (!funcs.has(r.n)) funcs.set(r.n, []);
  funcs.get(r.n).push({ names: r.an ?? [], types: r.ty ?? [], nreq: r.na - r.nd, anon: r.anon, auth: r.auth, svc: r.svc });
}
const relOf = (t) => t.replace(/^public\./, "");
const hasFk = (a, b) => fks.some((f) => (relOf(f.a) === a && relOf(f.b) === b) || (relOf(f.a) === b && relOf(f.b) === a));

/* ----------------------------- load the project ----------------------------- */
const cfgPath = join(root, "tsconfig.json");
const cfg = ts.getParsedCommandLineOfConfigFile(cfgPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const program = ts.createProgram({ rootNames: cfg.fileNames.filter((f) => !f.includes(".next")), options: { ...cfg.options, noEmit: true } });
const checker = program.getTypeChecker();
const rel = (f) => relative(root, f).replace(/\\/g, "/");
const SCAN = /^(lib|app|components)\//;
const files = program.getSourceFiles().filter((f) => !f.isDeclarationFile && SCAN.test(rel(f.fileName)));

const loc = (node) => {
  const sf = node.getSourceFile();
  return `${rel(sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
};
const err = (node, msg) => errors.push(`${typeof node === "string" ? node : loc(node)}  ${msg}`);
const warn = (node, msg) => warnings.push(`${typeof node === "string" ? node : loc(node)}  ${msg}`);

/* ----------------------------- AST helpers ----------------------------- */
const strip = (n) => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression?.(n))) n = n.expression;
  return n;
};
/** all possible string values of an expression (literal, concatenation, or a union of literal types), or null */
function strs(node) {
  node = strip(node);
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = strs(node.left);
    const b = strs(node.right);
    return a && b ? a.flatMap((x) => b.map((y) => x + y)) : null;
  }
  let t = checker.getTypeAtLocation(node);
  if (t.flags & ts.TypeFlags.TypeParameter) t = checker.getBaseConstraintOfType(t) ?? t;
  const lits = (t.isUnion() ? t.types : [t]).map((x) => (x.isStringLiteral() ? x.value : null));
  return lits.length && lits.every((x) => x !== null) ? lits : null;
}
const catsOfType = (t) => {
  const out = new Set();
  const walk = (x) => {
    if (x.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter | ts.TypeFlags.Never)) out.add("any");
    else if (x.isUnion()) x.types.forEach(walk);
    else if (x.flags & ts.TypeFlags.StringLike) out.add("string");
    else if (x.flags & ts.TypeFlags.NumberLike) out.add("number");
    else if (x.flags & ts.TypeFlags.BooleanLike) out.add("boolean");
    else if (x.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) out.add("null");
    else out.add("object");
  };
  walk(t);
  return out;
};
const DB_CAT = (c) => {
  if (c.dt === "boolean") return "boolean";
  if (["integer", "smallint", "bigint", "numeric", "real", "double precision"].includes(c.dt)) return "number";
  if (c.dt === "jsonb" || c.dt === "json") return "any";
  if (c.dt === "ARRAY") return "object";
  return "string";
};
const needsValue = (c) => c.nl === "NO" && c.d === null && c.idn !== "YES" && c.gen === "NEVER";

/** property names of an object-ish expression: literal keys, or from its type. returns { keys:Set, complete:bool, values:Map(name->node) } */
function objectKeys(node) {
  node = strip(node);
  const keys = new Set();
  const values = new Map();
  let complete = true;
  if (node && ts.isObjectLiteralExpression(node)) {
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
        const nm = p.name;
        if (ts.isComputedPropertyName(nm)) {
          const s = strs(nm.expression);
          if (s) s.forEach((k) => keys.add(k));
          else complete = false;
        } else {
          const k = ts.isIdentifier(nm) || ts.isStringLiteralLike(nm) ? nm.text : nm.getText();
          keys.add(k);
          if (ts.isPropertyAssignment(p)) values.set(k, p.initializer);
        }
      } else if (ts.isSpreadAssignment(p)) {
        const t = checker.getTypeAtLocation(p.expression);
        const props = t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never) || checker.getIndexInfosOfType(t).length ? null : t.getProperties();
        if (props && props.length) props.forEach((s) => keys.add(s.name));
        else complete = false;
        complete = false; // keys are possible, not guaranteed
      } else complete = false;
    }
    return { keys, complete, values, literal: true };
  }
  if (!node) return { keys, complete: false, values, literal: false };
  let t = checker.getTypeAtLocation(node);
  if (checker.isArrayType(t)) t = checker.getTypeArguments(t)[0] ?? t;
  if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter) || checker.getIndexInfosOfType(t).length) return { keys, complete: false, values, literal: false, opaque: true };
  const props = (t.isUnion() ? t.types : [t]).flatMap((x) => (x.getProperties ? x.getProperties() : []));
  if (!props.length) return { keys, complete: false, values, literal: false, opaque: true };
  props.forEach((s) => keys.add(s.name));
  return { keys, complete: false, values, literal: false };
}

/* ----------------------------- column / value validation ----------------------------- */
function legalValues(table, col) {
  const c = cols.get(table)?.get(col);
  if (!c) return null;
  if (c.dt === "USER-DEFINED" && enumVals.has(c.u)) return enumVals.get(c.u);
  return checkVals.get(`${table}.${col}`) ?? null;
}
function checkValue(node, table, col, valueNode) {
  const vals = legalValues(table, col);
  if (!vals || !valueNode) return;
  const lits = [];
  const v = strip(valueNode);
  if (v && ts.isArrayLiteralExpression(v)) v.elements.forEach((e) => lits.push(...(strs(e) ?? [])));
  else if (v) lits.push(...(strs(v) ?? []));
  for (const l of lits) if (!vals.has(l)) err(node, `${table}.${col}: value '${l}' is not allowed (${[...vals].join(" | ")})`);
}
function colExists(node, tables, name, what) {
  checked.cols++;
  name = name.split("->")[0].split("::")[0].trim();
  if (!name || name === "*" || name.includes(".") || name.endsWith("()")) return;
  for (const t of tables) if (!cols.get(t)?.has(name)) err(node, `${what}: column '${name}' does not exist in '${t}'`);
}

function parseSelect(s) {
  // returns [{name, rel?:bool, inner?:[...]}]
  let i = 0;
  const parseList = () => {
    const out = [];
    while (i < s.length) {
      let tok = "";
      let depth = 0;
      while (i < s.length) {
        const ch = s[i];
        if (ch === "(") {
          // embedded resource: parse inner list
          const head = tok.trim();
          i++;
          const inner = parseList();
          out.push({ head, inner });
          tok = "";
          // after ')' maybe ',' or ')'
          while (i < s.length && s[i] === " ") i++;
          if (s[i] === ",") i++;
          depth = -1;
          break;
        }
        if (ch === ")") {
          if (tok.trim()) out.push({ head: tok.trim() });
          i++;
          return out;
        }
        if (ch === ",") {
          i++;
          break;
        }
        tok += ch;
        i++;
      }
      if (depth === -1) continue;
      if (tok.trim()) out.push({ head: tok.trim() });
    }
    return out;
  };
  return parseList();
}
function checkSelect(node, table, sel) {
  let items;
  try {
    items = parseSelect(sel);
  } catch {
    return warn(node, `select string not parseable: ${sel}`);
  }
  const visit = (tbl, list) => {
    for (const it of list) {
      let head = it.head.replace(/\s+/g, "");
      if (!head) continue;
      if (it.inner) {
        const noAlias = head.includes(":") && !head.includes("::") ? head.split(":").pop() : head;
        const [relName, ...hints] = noAlias.split("!");
        const hint = hints.find((h) => h !== "inner" && h !== "left");
        const target = cols.has(relName) ? relName : null;
        if (target) {
          if (!hasFk(tbl, target)) err(node, `select: no foreign key between '${tbl}' and '${target}' for embedded '${relName}(...)'`);
          visit(target, it.inner);
        } else if (hint && cols.has(hint)) {
          visit(hint, it.inner);
        } else if (cols.get(tbl)?.has(hint ?? relName)) {
          // embedded through a FK column name: target unknown -> columns not verified
          warn(node, `select: embedded '${head}' resolved through column, inner columns not verified`);
        } else err(node, `select: embedded resource '${relName}' is not a table or relationship of '${tbl}'`);
        continue;
      }
      const nm = head.includes(":") && !head.includes("::") ? head.split(":").pop() : head;
      colExists(node, [tbl], nm.split("!")[0], "select");
    }
  };
  for (const t of table) visit(t, items);
}

/* ----------------------------- chain walking ----------------------------- */
const MUT = new Set(["insert", "update", "upsert"]);
const FILTER_COL = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy", "overlaps", "textSearch", "order", "not", "filter", "rangeGt", "rangeGte", "rangeLt", "rangeLte", "rangeAdjacent", "likeAllOf", "likeAnyOf", "ilikeAllOf", "ilikeAnyOf"]);
const START = new Set(["select", "insert", "update", "upsert", "delete"]);
const BUILTIN_RECV = new Set(["Array", "Buffer", "Uint8Array", "Int8Array", "Int16Array", "Int32Array", "Uint16Array", "Uint32Array", "Float32Array", "Float64Array", "Object", "Map", "Set", "String", "Number", "Promise", "BigInt", "Symbol", "JSON", "URL", "Date"]);

/** call nodes that continue the builder chain after `call`, following `q = q.eq(...)` style reassignments */
function followChain(call, out = [], seen = new Set()) {
  let cur = call;
  for (;;) {
    const p = cur.parent;
    if (p && ts.isPropertyAccessExpression(p) && p.expression === cur && p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p) {
      out.push({ name: p.name.text, call: p.parent });
      cur = p.parent;
      continue;
    }
    // chain value assigned to a variable -> follow later uses of that variable
    let sym = null;
    if (p && ts.isVariableDeclaration(p) && p.initializer === cur && ts.isIdentifier(p.name)) sym = checker.getSymbolAtLocation(p.name);
    else if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right === cur && ts.isIdentifier(p.left)) sym = checker.getSymbolAtLocation(p.left);
    else if (p && (ts.isAwaitExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p))) {
      cur = p;
      continue;
    }
    if (sym && !seen.has(sym)) {
      seen.add(sym);
      let fn = cur;
      while (fn && !ts.isFunctionLike(fn) && !ts.isSourceFile(fn)) fn = fn.parent;
      const visit = (n) => {
        if (ts.isIdentifier(n) && checker.getSymbolAtLocation(n) === sym) {
          const pp = n.parent;
          if (pp && ts.isPropertyAccessExpression(pp) && pp.expression === n && pp.parent && ts.isCallExpression(pp.parent) && pp.parent.expression === pp) {
            out.push({ name: pp.name.text, call: pp.parent });
            followChain(pp.parent, out, seen);
          }
        }
        ts.forEachChild(n, visit);
      };
      if (fn) ts.forEachChild(fn, visit);
    }
    return out;
  }
}

/* registry tables for dynamic names such as res.table */
const registryTables = new Set();
const registryFiles = ["lib/admin/resources.ts", "lib/admin/survey-resources.ts", "lib/admin/game-content-types.ts"];
function identInit(id) {
  const s = checker.getSymbolAtLocation(id);
  const d = s?.valueDeclaration;
  return d && ts.isVariableDeclaration(d) ? d.initializer : null;
}
function propOf(obj, name) {
  const p = obj.properties.find((x) => ts.isPropertyAssignment(x) && (ts.isIdentifier(x.name) || ts.isStringLiteralLike(x.name)) && x.name.text === name);
  return p ? p.initializer : null;
}
function fieldNames(arr, node, out = []) {
  if (!arr || !ts.isArrayLiteralExpression(arr)) return out;
  for (let el of arr.elements) {
    el = strip(el);
    if (ts.isIdentifier(el)) el = strip(identInit(el) ?? el);
    if (ts.isObjectLiteralExpression(el)) {
      const nm = propOf(el, "name");
      if (nm && strs(nm)) out.push({ name: strs(nm)[0], node: el });
    } else if (ts.isCallExpression(el) && el.arguments[0]) {
      const s = strs(el.arguments[0]);
      if (s && s.length === 1) out.push({ name: s[0], node: el });
    }
  }
  return out;
}
// computed by the CMS server code, not stored on the table (lib/admin/store.ts adds `email` to the user list, createProfile consumes both)
const VIRTUAL = { profiles: new Set(["email", "password"]) };
function scanRegistry(sf) {
  const visit = (n) => {
    if (ts.isObjectLiteralExpression(n)) {
      const tbl = propOf(n, "table");
      const key = propOf(n, "key");
      const flds = propOf(n, "fields");
      if (tbl && key && flds && strs(tbl)?.length === 1) {
        const t = strs(tbl)[0];
        checked.registry++;
        registryTables.add(t);
        if (!cols.has(t)) err(tbl, `registry '${strs(key)?.[0]}': table '${t}' does not exist`);
        else {
          const virt = VIRTUAL[t] ?? new Set();
          for (const f of fieldNames(flds, n)) if (!cols.get(t).has(f.name) && !virt.has(f.name)) err(f.node, `registry '${strs(key)[0]}': field '${f.name}' is not a column of '${t}'`);
          for (const f of fieldNames(propOf(n, "columns"), n)) if (!cols.get(t).has(f.name) && !virt.has(f.name)) err(f.node, `registry '${strs(key)[0]}': list column '${f.name}' is not a column of '${t}'`);
          const sort = propOf(n, "sort");
          const sf2 = sort && ts.isObjectLiteralExpression(strip(sort)) ? propOf(strip(sort), "field") : null;
          if (sf2 && strs(sf2) && !cols.get(t).has(strs(sf2)[0])) err(sf2, `registry '${strs(key)[0]}': sort field '${strs(sf2)[0]}' is not a column of '${t}'`);
          const tf = propOf(n, "titleField");
          if (tf && strs(tf) && !cols.get(t).has(strs(tf)[0])) warn(tf, `registry '${strs(key)[0]}': titleField '${strs(tf)[0]}' is not a column of '${t}'`);
          const search = propOf(n, "search");
          if (search && ts.isArrayLiteralExpression(search)) for (const e of search.elements) if (strs(e) && !cols.get(t).has(strs(e)[0].split(".")[0])) err(e, `registry '${strs(key)[0]}': search field '${strs(e)[0]}' is not a column of '${t}'`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
for (const f of registryFiles) {
  const sf = program.getSourceFile(join(root, f));
  if (sf) scanRegistry(sf);
}

/* ----------------------------- main scan ----------------------------- */
function resolveTables(arg) {
  const direct = strs(arg);
  if (direct) return { tables: direct, dynamic: false };
  // property of a registry object (res.table)?
  const a = strip(arg);
  if (a && ts.isPropertyAccessExpression(a) && a.name.text === "table" && registryTables.size) return { tables: [...registryTables], dynamic: true, registry: true };
  return { tables: null };
}

function handleFrom(call) {
  const recv = call.expression.expression;
  if (ts.isIdentifier(recv) && BUILTIN_RECV.has(recv.text)) return;
  const chain = followChain(call);
  if (!chain.length || !START.has(chain[0].name)) return;
  // bucket access (client.storage.from(...)) is not a table
  if (ts.isPropertyAccessExpression(recv) && recv.name.text === "storage") return;
  checked.from++;
  const { tables, registry } = resolveTables(call.arguments[0]);
  if (!tables) {
    if (!viaWrapper(call, chain)) warn(call, "dynamic table name could not be resolved (columns not verified)");
    return;
  }
  runChain(call, chain, tables, registry);
}

/** `function query(table, fallback, build) { db.from(table)... }`: validate every call site's literal table and the `build` callbacks */
function viaWrapper(call, chain) {
  const a = strip(call.arguments[0]);
  if (!a || !ts.isIdentifier(a)) return false;
  const sym = checker.getSymbolAtLocation(a);
  const param = sym?.valueDeclaration;
  if (!param || !ts.isParameter(param)) return false;
  const fn = param.parent;
  const idx = fn.parameters.indexOf(param);
  let fnSym = fn.name ? checker.getSymbolAtLocation(fn.name) : null;
  if (!fnSym && fn.parent && ts.isVariableDeclaration(fn.parent)) fnSym = checker.getSymbolAtLocation(fn.parent.name);
  if (!fnSym) return false;
  let any = false;
  for (const sf of files) {
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && checker.getSymbolAtLocation(n.expression) === fnSym && n.arguments[idx]) {
        const t = strs(n.arguments[idx]);
        if (t) {
          any = true;
          runChain(n, chain, t, false);
          for (const arg of n.arguments) {
            const f = strip(arg);
            if (f && (ts.isArrowFunction(f) || ts.isFunctionExpression(f)) && f.parameters[0] && ts.isIdentifier(f.parameters[0].name)) {
              const ps = checker.getSymbolAtLocation(f.parameters[0].name);
              const walk = (m) => {
                if (ts.isIdentifier(m) && m !== f.parameters[0].name && checker.getSymbolAtLocation(m) === ps) {
                  const pp = m.parent;
                  if (pp && ts.isPropertyAccessExpression(pp) && pp.expression === m && pp.parent && ts.isCallExpression(pp.parent) && pp.parent.expression === pp) {
                    const ch = [{ name: pp.name.text, call: pp.parent }];
                    followChain(pp.parent, ch);
                    runChain(n, ch, t, false, true);
                  }
                }
                ts.forEachChild(m, walk);
              };
              walk(f.body);
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return any;
}

function runChain(call, chain, tables, registry, partial = false) {
  const known = tables.filter((t) => cols.has(t));
  if (!partial) for (const t of tables) if (!cols.has(t)) err(call, `table '${t}' does not exist in the schema`);
  for (const t of tables) if (!cols.has(t)) err(call, `table '${t}' does not exist in the schema`);
  if (!known.length) return;
  // for dynamic (registry/union) names a column must exist in EVERY candidate, except generic code is not column-checked
  const isUnion = known.length > 1;
  for (const link of chain) {
    const args = link.call.arguments;
    const n = link.name;
    if (n === "select" && args[0]) {
      const s = strs(args[0]);
      if (s && s.length === 1) {
        if (!isUnion || registry) checkSelect(link.call, known, s[0].trim());
        else if (s[0].trim() !== "*") checkSelect(link.call, known, s[0].trim());
      }
    } else if (MUT.has(n) && args[0]) {
      const ok = objectKeys(args[0]);
      const rows = [];
      const a0 = strip(args[0]);
      if (a0 && ts.isArrayLiteralExpression(a0)) a0.elements.forEach((e) => rows.push(objectKeys(e)));
      else rows.push(ok);
      for (const info of rows) {
        if (info.opaque) {
          warn(link.call, `${n} payload type is opaque (keys not verified)`);
          continue;
        }
        for (const k of info.keys) {
          if (isUnion && registry) continue; // generic CMS payload: keys come from the registry (verified above)
          colExists(link.call, known, k, n);
          for (const t of known) checkValue(link.call, t, k, info.values.get(k));
        }
        if ((n === "insert" || n === "upsert") && info.literal && info.complete && !isUnion)
          for (const [c, ci] of cols.get(known[0])) if (needsValue(ci) && !info.keys.has(c)) err(link.call, `${n} into '${known[0]}' is missing required column '${c}' (NOT NULL, no default)`);
      }
      if (n === "upsert" && args[1]) {
        const oc = objectKeys(args[1]);
        const v = oc.values.get("onConflict");
        const s = v ? strs(v) : null;
        if (s && s.length === 1 && !isUnion) {
          const want = s[0].split(",").map((x) => x.trim()).sort();
          want.forEach((c) => colExists(link.call, known, c, "onConflict"));
          const have = uniq.get(known[0]) ?? [];
          if (!have.some((u) => u.length === want.length && u.every((x, i) => x === want[i]))) err(link.call, `upsert onConflict '${s[0]}' does not match any non-partial unique constraint/index of '${known[0]}'`);
        }
      }
    } else if (n === "match" && args[0]) {
      for (const k of objectKeys(args[0]).keys) colExists(link.call, known, k, "match");
    } else if (n === "or" && args[0]) {
      const s = strs(args[0]);
      if (s && s.length === 1) {
        let depth = 0;
        let cur = "";
        const parts = [];
        for (const ch of s[0]) {
          if (ch === "(") depth++;
          if (ch === ")") depth--;
          if (ch === "," && depth === 0) {
            parts.push(cur);
            cur = "";
          } else cur += ch;
        }
        parts.push(cur);
        for (const p of parts) {
          const c = p.split(".")[0];
          if (c && !/^(and|or|not)\(?$/.test(c) && !p.startsWith("and(") && !p.startsWith("or(")) colExists(link.call, known, c, "or");
        }
      }
    } else if (FILTER_COL.has(n) && args[0]) {
      const s = strs(args[0]);
      if (s) {
        s.forEach((c) => colExists(link.call, known, c, n));
        if ((n === "eq" || n === "neq" || n === "in") && s.length === 1 && !isUnion) checkValue(link.call, known[0], s[0], args[1]);
      } else if (!registry) warn(link.call, `.${n}(<dynamic column>) not verified`);
    }
  }
}

function handleRpc(call) {
  const a0 = call.arguments[0];
  const names = a0 ? strs(a0) : null;
  if (!names) return warn(call, "rpc name is dynamic (not verified)");
  checked.rpc++;
  for (const name of names) {
    const ov = funcs.get(name);
    if (!ov) {
      err(call, `rpc('${name}'): function does not exist in schema public`);
      continue;
    }
    const info = call.arguments[1] ? objectKeys(call.arguments[1]) : { keys: new Set(), complete: true, values: new Map(), literal: true };
    if (info.opaque) {
      warn(call, `rpc('${name}') args are opaque (not verified)`);
      continue;
    }
    // some overload must accept all given keys and have all required ones
    let best = null;
    const problems = [];
    for (const o of ov) {
      const unknown = [...info.keys].filter((k) => !o.names.includes(k));
      const missing = info.complete ? o.names.slice(0, o.nreq).filter((k) => !info.keys.has(k)) : [];
      if (!unknown.length && !missing.length) {
        best = o;
        break;
      }
      problems.push({ o, unknown, missing });
    }
    if (!best) {
      const p = problems[0];
      err(call, `rpc('${name}'): ${p.unknown.length ? `unknown argument(s) ${p.unknown.map((x) => `'${x}'`).join(", ")}` : ""}${p.unknown.length && p.missing.length ? "; " : ""}${p.missing.length ? `missing required argument(s) ${p.missing.map((x) => `'${x}'`).join(", ")}` : ""} (function takes: ${p.o.names.join(", ") || "none"})`);
      continue;
    }
    if (!best.anon && !best.auth && !best.svc) err(call, `rpc('${name}'): not executable by anon, authenticated or service_role`);
    // light type check of literal-typed values
    best.names.forEach((pn, i) => {
      const v = info.values.get(pn);
      if (!v) return;
      const ty = best.types[i] ?? "";
      const cs = catsOfType(checker.getTypeAtLocation(v));
      cs.delete("null");
      if (cs.has("any") || !cs.size || /json/.test(ty)) return;
      const isArr = /\[\]$/.test(ty);
      const want = isArr ? "object" : ty === "boolean" ? "boolean" : /^(integer|smallint|bigint|numeric|real|double precision)$/.test(ty) ? "number" : "string";
      const bad = [...cs].filter((c) => c !== want && !(want === "number" && c === "string") && !(want === "string" && c === "number"));
      if (bad.length) err(call, `rpc('${name}'): argument '${pn}' is ${ty} but the code passes ${bad.join("/")}`);
    });
  }
}

/* ---- SchoolDb call sites: c.db.select("t", { eq:{col}, in:{col}, gte, lte, order:[[col,dir]] }), update/remove/insert/upsert ---- */
/** column names inside a Q-style object (`eq: {a: 1}`), following identifiers, spreads and later `obj.key = v` assignments */
function recordKeys(node, depth = 0) {
  const out = new Set();
  node = strip(node);
  if (!node || depth > 4) return out;
  if (ts.isObjectLiteralExpression(node)) {
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
        const nm = p.name;
        if (ts.isComputedPropertyName(nm)) strs(nm.expression)?.forEach((k) => out.add(k));
        else out.add(ts.isIdentifier(nm) || ts.isStringLiteralLike(nm) ? nm.text : nm.getText());
      } else if (ts.isSpreadAssignment(p)) recordKeys(p.expression, depth + 1).forEach((k) => out.add(k));
    }
  } else if (ts.isIdentifier(node)) {
    const init = identInit(node);
    if (init) recordKeys(init, depth + 1).forEach((k) => out.add(k));
    const sym = checker.getSymbolAtLocation(node);
    let fn = node;
    while (fn && !ts.isFunctionLike(fn) && !ts.isSourceFile(fn)) fn = fn.parent;
    const visit = (n) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const l = n.left;
        if ((ts.isPropertyAccessExpression(l) || ts.isElementAccessExpression(l)) && ts.isIdentifier(l.expression) && checker.getSymbolAtLocation(l.expression) === sym) {
          if (ts.isPropertyAccessExpression(l)) out.add(l.name.text);
          else strs(l.argumentExpression)?.forEach((k) => out.add(k));
        }
      }
      ts.forEachChild(n, visit);
    };
    if (fn && sym) ts.forEachChild(fn, visit);
  }
  return out;
}
const Q_KEYS = ["eq", "in", "gte", "lte"];
function handleSchoolDb(call, method) {
  const t0 = call.arguments[0] && strs(call.arguments[0]);
  if (!t0 || t0.length !== 1 || !cols.has(t0[0])) return;
  const table = t0[0];
  checked.from++;
  const qNode = (method === "select" || method === "remove" ? call.arguments[1] : method === "update" ? call.arguments[1] : null);
  if (qNode) {
    const resolved = ts.isIdentifier(strip(qNode)) ? strip(identInit(strip(qNode)) ?? qNode) : strip(qNode);
    const visitQ = (o, depth = 0) => {
      if (!o || !ts.isObjectLiteralExpression(o) || depth > 3) return;
      for (const p of o.properties) {
        if (ts.isSpreadAssignment(p)) {
          const e = strip(p.expression);
          visitQ(ts.isIdentifier(e) ? strip(identInit(e) ?? e) : e, depth + 1);
          continue;
        }
        if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) continue;
        const key = p.name.getText();
        const val = ts.isPropertyAssignment(p) ? p.initializer : p.name;
        if (Q_KEYS.includes(key)) {
          for (const c of recordKeys(val)) {
            colExists(call, [table], c, `db.${method}.${key}`);
            if (key === "eq") {
              const ov = ts.isObjectLiteralExpression(strip(val)) ? strip(val).properties.find((x) => ts.isPropertyAssignment(x) && x.name.getText().replace(/['"]/g, "") === c) : null;
              if (ov) checkValue(call, table, c, ov.initializer);
            }
          }
        } else if (key === "order") {
          const arr = strip(val);
          if (arr && ts.isArrayLiteralExpression(arr)) for (const e of arr.elements) {
            const pair = strip(e);
            if (ts.isArrayLiteralExpression(pair) && pair.elements[0]) strs(pair.elements[0])?.forEach((c) => colExists(call, [table], c, `db.${method}.order`));
          }
        }
      }
    };
    visitQ(resolved);
  }
  const payload = method === "insert" || method === "upsert" ? call.arguments[1] : method === "update" ? call.arguments[2] : null;
  if (method === "insert" || method === "upsert") {
    // rows: insert(table, rows) / upsert(table, rows, onConflict)
    const rowsNode = call.arguments[1];
    const a = rowsNode && strip(rowsNode);
    const lists = a && ts.isArrayLiteralExpression(a) ? a.elements.map((e) => objectKeys(e)) : rowsNode ? [objectKeys(rowsNode)] : [];
    for (const info of lists) {
      if (info.opaque) continue;
      for (const k of info.keys) {
        colExists(call, [table], k, `db.${method}`);
        checkValue(call, table, k, info.values.get(k));
      }
      if (method === "insert" && info.literal && info.complete)
        for (const [c, ci] of cols.get(table)) if (needsValue(ci) && !info.keys.has(c)) err(call, `db.insert into '${table}' is missing required column '${c}' (NOT NULL, no default)`);
    }
    if (method === "upsert" && call.arguments[2]) {
      const arr = strip(call.arguments[2]);
      const names = arr && ts.isArrayLiteralExpression(arr) ? arr.elements.flatMap((e) => strs(e) ?? []) : [];
      if (names.length) {
        const want = [...names].sort();
        names.forEach((c) => colExists(call, [table], c, "db.upsert onConflict"));
        if (!(uniq.get(table) ?? []).some((u) => u.length === want.length && u.every((x, i) => x === want[i]))) err(call, `db.upsert onConflict [${names}] does not match any non-partial unique constraint/index of '${table}'`);
      }
    }
  } else if (method === "update" && payload) {
    const info = objectKeys(payload);
    if (!info.opaque) {
      for (const k of info.keys) {
        colExists(call, [table], k, "db.update");
        checkValue(call, table, k, info.values.get(k));
      }
    }
  }
}
const DB_METHODS = new Set(["select", "insert", "update", "upsert", "remove"]);

for (const sf of files) {
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const nm = n.expression.name.text;
      if (nm === "from") handleFrom(n);
      else if (nm === "rpc") handleRpc(n);
      else if (DB_METHODS.has(nm) && /(^|\.)db$/.test(n.expression.expression.getText())) handleSchoolDb(n, nm);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/* ----------------------------- typed layers ----------------------------- */
function compareRow(label, tsType, table, node) {
  const tc = cols.get(table);
  if (!tc) return err(node, `${label}: table '${table}' does not exist in the schema`);
  checked.typed++;
  for (const prop of checker.getPropertiesOfType(tsType)) {
    const c = tc.get(prop.name);
    if (!c) {
      err(node, `${label}: field '${prop.name}' has no column in '${table}'`);
      continue;
    }
    const pt = checker.getTypeOfSymbolAtLocation(prop, node);
    const cs = catsOfType(pt);
    cs.delete("null");
    const dc = DB_CAT(c);
    if (!cs.has("any") && dc !== "any") {
      const bad = [...cs].filter((x) => x !== dc);
      if (bad.length) err(node, `${label}: '${table}.${prop.name}' is ${c.dt} (${dc}) in the DB but typed ${[...cs].join("|")}`);
    }
    // literal unions must be subsets of the legal values
    const vals = legalValues(table, prop.name);
    if (vals) {
      let lt = pt;
      const members = (lt.isUnion() ? lt.types : [lt]).filter((m) => m.isStringLiteral()).map((m) => m.value);
      for (const m of members) if (!vals.has(m)) err(node, `${label}: '${table}.${prop.name}' allows '${m}' in TypeScript but the DB does not (${[...vals].join(" | ")})`);
      for (const v of vals) if (members.length && !members.includes(v) && !(lt.flags & ts.TypeFlags.String)) warn(node, `${label}: '${table}.${prop.name}' DB value '${v}' is missing from the TypeScript union`);
    }
  }
}
function findAlias(file, name) {
  const sf = program.getSourceFile(join(root, file));
  let found = null;
  const visit = (n) => {
    if ((ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name.text === name) found = n;
    ts.forEachChild(n, visit);
  };
  if (sf) visit(sf);
  return found;
}
// lib/school/types.ts TableRows
{
  const decl = findAlias("lib/school/types.ts", "TableRows");
  if (decl) {
    const t = checker.getTypeAtLocation(decl.name);
    for (const prop of checker.getPropertiesOfType(t)) compareRow("TableRows", checker.getTypeOfSymbolAtLocation(prop, decl), prop.name, decl);
  }
}
// lib/supabase/database.types.ts Database
{
  const decl = findAlias("lib/supabase/database.types.ts", "Database");
  if (decl) {
    const dbT = checker.getTypeAtLocation(decl.name);
    const pub = checker.getTypeOfSymbolAtLocation(dbT.getProperty("public"), decl);
    const tables = checker.getTypeOfSymbolAtLocation(pub.getProperty("Tables"), decl);
    for (const tp of checker.getPropertiesOfType(tables)) {
      const tt = checker.getTypeOfSymbolAtLocation(tp, decl);
      const row = checker.getTypeOfSymbolAtLocation(tt.getProperty("Row"), decl);
      compareRow("Database.Tables", row, tp.name, decl);
      // every NOT NULL column without default should be present in Row
      const rowKeys = new Set(checker.getPropertiesOfType(row).map((x) => x.name));
      for (const [c, ci] of cols.get(tp.name) ?? []) if (!rowKeys.has(c) && needsValue(ci)) err(decl, `Database.Tables.${tp.name}.Row is missing required column '${c}'`);
    }
    const fnT = checker.getTypeOfSymbolAtLocation(pub.getProperty("Functions"), decl);
    for (const fp of checker.getPropertiesOfType(fnT)) {
      const ft = checker.getTypeOfSymbolAtLocation(fp, decl);
      const ov = funcs.get(fp.name);
      if (!ov) {
        err(decl, `Database.Functions.${fp.name}: function does not exist in the schema`);
        continue;
      }
      const args = checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(ft.getProperty("Args"), decl)).map((x) => x.name);
      if (!ov.some((o) => args.every((a) => o.names.includes(a)) && o.names.slice(0, o.nreq).every((a) => args.includes(a)))) err(decl, `Database.Functions.${fp.name}.Args [${args}] do not match pg_proc [${ov[0].names}] (required ${ov[0].nreq})`);
      checked.typed++;
    }
    const enT = checker.getTypeOfSymbolAtLocation(pub.getProperty("Enums"), decl);
    for (const ep of checker.getPropertiesOfType(enT)) {
      const vals = enumVals.get(ep.name);
      if (!vals) {
        err(decl, `Database.Enums.${ep.name}: enum type does not exist`);
        continue;
      }
      const members = (checker.getTypeOfSymbolAtLocation(ep, decl).isUnion() ? checker.getTypeOfSymbolAtLocation(ep, decl).types : [checker.getTypeOfSymbolAtLocation(ep, decl)]).map((m) => m.value);
      for (const v of vals) if (!members.includes(v)) err(decl, `Database.Enums.${ep.name} is missing DB value '${v}'`);
      for (const m of members) if (!vals.has(m)) err(decl, `Database.Enums.${ep.name} has '${m}' which is not a DB enum value`);
    }
  }
}

/* ----------------------------- report ----------------------------- */
const uniqSorted = (a) => [...new Set(a)].sort();
console.log(`db:refs scanned ${files.length} files: ${checked.from} table chains, ${checked.rpc} rpc calls, ${checked.cols} column refs, ${checked.registry} CMS resources, ${checked.typed} typed rows/functions`);
console.log(`schema: ${cols.size} tables/views, ${funcs.size} functions, ${enumVals.size} enums`);
if (warnings.length) {
  console.log(`\n${uniqSorted(warnings).length} warning(s)${VERBOSE ? ":" : " (use --verbose to list)"}`);
  if (VERBOSE) for (const w of uniqSorted(warnings)) console.log("  warn  " + w);
}
if (errors.length) {
  console.log(`\n${uniqSorted(errors).length} ERROR(s):`);
  for (const e of uniqSorted(errors)) console.log("  FAIL  " + e);
  process.exit(1);
}
console.log("\nall supabase references match the schema");
