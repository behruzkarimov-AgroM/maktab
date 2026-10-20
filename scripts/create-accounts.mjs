// Creates the initial logins (one per role) in the REAL Supabase project and writes them to HISOBLAR.local.md (git-ignored).
//   npm run accounts:create              new accounts only; existing ones are left untouched
//   npm run accounts:create -- --reset   also issues NEW passwords for accounts that already exist
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local) and supabase/schema.sql applied.
// Logins: admin@, direktor@, metodist@, psixolog@, oqituvchi@, oquvchi@, ota-ona@ + SCHOOL_EMAIL_DOMAIN (default childrensacademy.uz).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createInitialAccounts, credentialsMarkdown } from "./accounts/create-accounts-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const env = (k) => (process.env[k] ?? "").trim();
const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
const databaseUrl = env("DATABASE_URL");
if (!databaseUrl && (!url || !key)) {
  console.error(
    "Baza topilmadi.\n" +
      ".env.local fayliga DATABASE_URL (o'z PostgreSQL bazangiz, docs/SELF-HOSTED.md) yoki\n" +
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Supabase loyihasi) ni yozing, keyin: npm run accounts:create",
  );
  process.exit(1);
}
const rawDomain = env("SCHOOL_EMAIL_DOMAIN").toLowerCase().replace(/^@/, "");
const domain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(rawDomain) ? rawDomain : "childrensacademy.uz";
const site = (env("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000").replace(/\/+$/, "");
const reset = process.argv.includes("--reset");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());

// self-hosted PostgreSQL: the same gateway the app uses (run through tsx, which loads the TypeScript module)
let svc;
let pool = null;
if (databaseUrl) {
  const { LocalGateway } = await import("../lib/localdb/gateway.ts");
  const pg = (await import("pg")).default;
  pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  svc = new LocalGateway(() => pool.connect()).client("service_role");
} else {
  svc = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
let rows;
try {
  rows = await createInitialAccounts(svc, { domain, today, reset });
} catch (e) {
  console.error(`Xato: ${e instanceof Error ? e.message : String(e)}`);
  console.error("Bazada sxema (supabase/schema.sql) borligini va ulanish ma'lumotlari to'g'riligini tekshiring.");
  process.exit(1);
} finally {
  await pool?.end();
}

const file = join(root, "HISOBLAR.local.md");
const header =
  "# Children's Academy: kirish ma'lumotlari\n\n" +
  "> MAXFIY. Bu fayl gitga tushmaydi (.gitignore: *.local.md). Parollarni egalariga xavfsiz yo'l bilan yetkazing va faylni o'chiring\n" +
  "> yoki parol menejeriga o'tkazing. Maktab portaliga birinchi kirishda har bir foydalanuvchi o'z parolini o'rnatadi.\n" +
  "> \"Namuna\" o'qituvchi / o'quvchi / ota-ona yozuvlari sinov uchun: keraksiz bo'lsa direktor portalidan o'chiring.\n\n";
const previous = existsSync(file) ? readFileSync(file, "utf8").replace(/^[\s\S]*?(?=^## )/m, "") : "";
writeFileSync(file, header + credentialsMarkdown(rows, site, new Date()) + "\n" + previous, { encoding: "utf8", mode: 0o600 });

for (const r of rows) console.log(`${r.status.padEnd(7)} ${r.role.padEnd(13)} ${r.email}`);
console.log(`\nLoginlar va parollar: ${file}`);
