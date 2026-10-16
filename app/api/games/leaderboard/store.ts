import type { Difficulty } from "@/lib/types";
import type { LeaderboardEntry } from "@/components/games/types";

/** Demo-mode (no Supabase) in-memory store (rate limiting lives in lib/rate-limit.ts). Process-local, not persistent. */

const NAMES = ["Aziza", "Bekzod", "Malika", "Sardor", "Dilnoza", "Jasur", "Madina", "Timur"];
const SLUGS = ["schulte-table", "memory-matrix", "mental-math", "stroop-test", "logic-seq", "matching-pairs", "true-false", "quiz-race"];
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

type Row = LeaderboardEntry & { game_slug: string };

function seed(): Row[] {
  const rows: Row[] = [];
  let n = 0;
  for (const slug of SLUGS) {
    for (const d of DIFFS) {
      for (let i = 0; i < 3; i++) {
        n++;
        rows.push({
          id: `demo-${n}`,
          game_slug: slug,
          player_name: NAMES[(n * 3 + i) % NAMES.length],
          student_grade: 3 + ((n + i) % 8),
          difficulty: d,
          score: 400 + ((n * 137 + i * 71) % 900),
          completion_time_ms: 20000 + ((n * 911) % 40000),
          accuracy_percent: 80 + ((n * 7) % 20),
          created_at: new Date(Date.UTC(2026, 0, 1 + n)).toISOString(),
        });
      }
    }
  }
  return rows;
}

const g = globalThis as unknown as { __demoLb?: Row[] };
const rows: Row[] = (g.__demoLb ??= seed());

export function demoList(slug: string, difficulty: Difficulty | undefined, limit: number): LeaderboardEntry[] {
  return rows
    .filter((r) => r.game_slug === slug && (!difficulty || r.difficulty === difficulty))
    // deterministic: score desc, time asc, earliest first, id (mirrors get_leaderboard in schema.sql)
    .sort((a, b) => b.score - a.score || a.completion_time_ms - b.completion_time_ms || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit)
    .map((r) => ({ ...r }));
}

export function demoAdd(row: Omit<Row, "id" | "created_at">): void {
  rows.push({ ...row, id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, created_at: new Date().toISOString() });
  if (rows.length > 2000) rows.splice(0, rows.length - 2000);
}

const g2 = globalThis as unknown as { __lbHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g2.__lbHits ??= new Map());

/**
 * @deprecated Routes use `enforceRateLimit` from lib/rate-limit.ts. Kept (sync, in-memory sliding window)
 * because existing unit tests import it. Returns true when the request is allowed.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}
