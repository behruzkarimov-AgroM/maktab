// Self-hosted mode on PGlite: supabase/local/bootstrap.sql + supabase/schema.sql (with seed), served through the PRODUCTION
// gateway (lib/localdb/gateway.ts). PGlite is a single connection, so connections are handed out one at a time.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LocalGateway, type Conn } from "@/lib/localdb/gateway";

export async function buildLocalDb(storageDir?: string): Promise<{ db: PGlite; gw: LocalGateway }> {
  const db = new PGlite();
  // psql variable :"app_user" -> the PGlite superuser (owner of everything, like the app user on a real server)
  await db.exec(readFileSync(join(process.cwd(), "supabase/local/bootstrap.sql"), "utf8").replaceAll(':"app_user"', "postgres"));
  await db.exec(readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8"));
  let lock: Promise<void> = Promise.resolve();
  const connect = async (): Promise<Conn> => {
    let release!: () => void;
    const prev = lock;
    lock = new Promise<void>((r) => (release = r));
    await prev;
    return { query: (sql, params) => db.query(sql, params) as Promise<{ rows: any[] }>, release }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  return { db, gw: new LocalGateway(connect, { storageDir, publicBuckets: ["school-media", "test-assets"] }) };
}
