// Demo-mode (no Supabase) seed for content sets. Single source: content-seed.json, which is also the source of
// the seed rows appended to supabase/schema.sql. The admin demo store (lib/admin/demo-store.ts) copies these
// rows into its in-memory `game_content_sets` table, so sets created in the admin are playable immediately.
import type { GameContentSetRow } from "@/lib/admin/game-content-types";
import seed from "./content-seed.json";

export const SEED_CONTENT_SETS = seed as unknown as GameContentSetRow[];

/** Fresh deep copies (the admin demo store mutates its rows). */
export function seedContentSets(): GameContentSetRow[] {
  return JSON.parse(JSON.stringify(SEED_CONTENT_SETS)) as GameContentSetRow[];
}
