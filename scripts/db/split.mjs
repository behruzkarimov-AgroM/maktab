// Derives the files below from supabase/schema.sql (the combined, hand-edited source of truth):
//   supabase/migrations/0001_init.sql          full schema (everything before the SEED DATA marker)
//   supabase/migrations/0002_hardening.sql     the upgrade path for databases created from an OLDER 0001: the regions of
//                                              schema.sql wrapped in "-- @migration 0002 begin" / "-- @migration 0002 end"
//   supabase/seed.sql                          demo data (everything from the SEED DATA marker)
//   node scripts/db/split.mjs          -> writes the files
//   node scripts/db/split.mjs --check  -> exits 1 if they are out of date
//
// Why both 0001 and 0002 contain the hardening: 0001 is regenerated from the current schema (a brand-new project gets
// everything from it and 0002 then re-applies the same idempotent statements, a no-op). A project that already applied an
// older 0001 never re-runs it (the CLI tracks versions), so it receives the changes through 0002.
// To add 0003 later: wrap the new statements in "-- @migration 0003 begin/end" and add "0003" to MIGRATIONS below.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");

/** version tag -> file name + header */
export const MIGRATIONS = [
  {
    tag: "0002",
    file: "supabase/migrations/0002_hardening.sql",
    title: "0002_hardening: security, integrity and performance hardening for databases created from an older 0001_init.sql.",
    footer: "-- Policy helper is only needed while this file runs.\ndrop function if exists public._mk_policies(text, text, text);\n",
  },
  {
    tag: "0003",
    file: "supabase/migrations/0003_telegram_bot.sql",
    title: "0003_telegram_bot: Telegram account links + one-time link codes (server / service role only).",
    footer: "",
  },
  {
    tag: "0004",
    file: "supabase/migrations/0004_phone_codes.sql",
    title: "0004_phone_codes: phones shared with the Telegram bot + one-time codes sent through it (server / service role only).",
    footer: "",
  },
];

export function extractRegions(schemaPart, tag) {
  const re = new RegExp(`^-- @migration ${tag} begin\\n([\\s\\S]*?)^-- @migration ${tag} end\\n`, "gm");
  const out = [];
  let m;
  while ((m = re.exec(schemaPart))) out.push(m[1].trimEnd());
  if (!out.length) throw new Error(`no "-- @migration ${tag} begin/end" regions found in schema.sql`);
  const begins = (schemaPart.match(new RegExp(`^-- @migration ${tag} begin$`, "gm")) ?? []).length;
  const ends = (schemaPart.match(new RegExp(`^-- @migration ${tag} end$`, "gm")) ?? []).length;
  if (begins !== out.length || ends !== out.length) throw new Error(`unbalanced "-- @migration ${tag}" markers (${begins} begin / ${ends} end)`);
  return out;
}

export function split(schemaText) {
  const s = schemaText.replace(/\r\n/g, "\n");
  const marker = "-- =====================================================================\n-- SEED DATA";
  const at = s.indexOf(marker);
  if (at < 0) throw new Error("SEED DATA marker not found in schema.sql");
  const helperDrop = "drop function if exists public._mk_policies(text, text, text);\n";
  const schemaPart = s.slice(0, at);
  const seedPart = s.slice(at);
  if (!seedPart.includes(helperDrop)) throw new Error("_mk_policies cleanup not found");
  const migrations = {};
  for (const m of MIGRATIONS) {
    migrations[m.file] =
      `-- ${m.title}\n-- Generated from supabase/schema.sql by scripts/db/split.mjs (regions marked "@migration ${m.tag}"). Idempotent: safe to re-run.\n\n` +
      extractRegions(schemaPart, m.tag).join("\n\n") + "\n\n" + m.footer;
  }
  return {
    migration:
      "-- 0001_init: full schema (tables, RLS, RPCs, storage). Generated from supabase/schema.sql by scripts/db/split.mjs.\n" +
      schemaPart.trimEnd() + "\n\n-- Policy helper is only needed while this file runs.\n" + helperDrop,
    migrations,
    seed: "-- Seed data. Generated from supabase/schema.sql by scripts/db/split.mjs. Run after the migrations.\n" +
      seedPart.replace(helperDrop, "").trimEnd() + "\n",
  };
}

if (process.argv[1] && process.argv[1].endsWith("split.mjs")) {
  const { migration, migrations, seed } = split(rd("supabase/schema.sql"));
  const targets = [["supabase/migrations/0001_init.sql", migration], ...Object.entries(migrations), ["supabase/seed.sql", seed]];
  if (process.argv.includes("--check")) {
    const stale = targets.filter(([p, c]) => rd(p).replace(/\r\n/g, "\n") !== c);
    if (stale.length) {
      console.error("Out of date (run `npm run db:split`): " + stale.map(([p]) => p).join(", "));
      process.exit(1);
    }
    console.log("migrations + seed are up to date");
  } else {
    mkdirSync(join(root, "supabase/migrations"), { recursive: true });
    for (const [p, c] of targets) writeFileSync(join(root, p), c);
    console.log("wrote " + targets.map(([p]) => p).join(", "));
  }
}
