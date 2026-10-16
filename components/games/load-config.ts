import { GAME_DEFAULTS, isGameSlug, sanitizeConfig } from "./defaults";
import { getDb } from "./server-db";
import type { GameMeta } from "./types";
import type { LocalizedText } from "@/lib/types";

/** Built-in defaults overlaid with active rows from brain_games (admin-editable). */
export async function loadGames(): Promise<GameMeta[]> {
  const db = await getDb();
  if (!db) return GAME_DEFAULTS;
  try {
    const { data, error } = await db.from("brain_games").select("*").order("sort_order", { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) return GAME_DEFAULTS;
    const merged: GameMeta[] = [];
    const loc = (v: unknown, d: LocalizedText): LocalizedText => {
      const o = (v && typeof v === "object" ? v : {}) as Partial<LocalizedText>;
      return { uz: o.uz || d.uz, ru: o.ru || d.ru, en: o.en || d.en };
    };
    for (const row of data as Array<Record<string, unknown>>) {
      const slug = String(row.game_slug ?? "");
      if (!isGameSlug(slug) || row.is_active === false) continue;
      const d = GAME_DEFAULTS.find((g) => g.slug === slug)!;
      merged.push({
        slug,
        icon: d.icon,
        title: loc(row.title, d.title),
        description: loc(row.description, d.description),
        howTo: loc(row.how_to_play, d.howTo),
        skill: loc(row.cognitive_skill, d.skill),
        config: sanitizeConfig(row.config, d.config, slug === "mental-math" || slug === "stroop-test" ? 10 : 0),
      });
    }
    // if DB has rows but none usable, show defaults
    return merged.length ? merged : GAME_DEFAULTS;
  } catch {
    return GAME_DEFAULTS;
  }
}
