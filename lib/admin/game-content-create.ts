// Server-only entry point for the Word/PDF importer: validates a GameContentDraft and stores it as a
// `game_content_sets` row (Supabase when configured, the in-memory demo store otherwise).
// Callers MUST have passed lib/admin/auth.guard() (role super_admin / methodist) first.
import { logAudit } from "./audit";
import { validateGameDraft, type GameContentDraft, type GameContentSetRow, type ItemIssue } from "./game-content-types";
import { RESOURCE_MAP } from "./resources";
import { createRow } from "./store";
import type { AdminSession } from "./types";

export class GameDraftError extends Error {
  override name = "GameDraftError";
  constructor(public issues: ItemIssue[]) {
    super(`Invalid game content draft: ${issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  }
}

/**
 * Creates a content set from a draft. Throws GameDraftError (with `issues`) when the draft is invalid.
 * Pass the admin `session` to record the creation in the audit log.
 */
export async function createGameSetFromDraft(draft: GameContentDraft, session?: AdminSession): Promise<GameContentSetRow> {
  const issues = validateGameDraft(draft);
  if (issues.length) throw new GameDraftError(issues);
  const res = RESOURCE_MAP.game_content_sets;
  const data = {
    game_type: draft.game_type,
    title: draft.title,
    description: draft.description ?? { uz: "", ru: "", en: "" },
    subject_key: draft.subject_key,
    grade: draft.grade ?? null,
    difficulty: draft.difficulty,
    items: draft.items,
    is_active: draft.is_active ?? false, // imported drafts start hidden until a methodist reviews them
    sort_order: draft.sort_order ?? 0,
  };
  const row = (await createRow(res, data)) as unknown as GameContentSetRow;
  if (session) await logAudit(session, "create", res.key, row.id, { game_type: draft.game_type, items: draft.items.length, source: "import" });
  return row;
}
