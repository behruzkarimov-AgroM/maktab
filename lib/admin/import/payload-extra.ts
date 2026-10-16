// Survey / game-content drafts -> payloads for POST /api/admin/import/create. Client-safe, pure.
import type { GameContentDraft } from "../game-content-types";
import type { SurveyDraft } from "../survey-types";
import { withUz } from "./payload";
import type { GameImportDraft, LText, SurveyImportDraft } from "./types";
import { LOCALES } from "./types";

const optionalL = (v: LText | null | undefined): LText | null => (v && LOCALES.some((l) => v[l]?.trim()) ? withUz(v) : null);

/** Survey draft (server: createSurveyFromDraft). Always created INACTIVE; activation is a separate step. */
export function surveyDraftPayload(d: SurveyImportDraft, sel: boolean[]): SurveyDraft {
  return {
    title: withUz(d.title, "So'rovnoma"),
    description: optionalL(d.description) ?? "",
    audience: d.audience,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    isActive: false,
    isAnonymous: d.isAnonymous,
    allowMultipleResponses: d.allowMultiple,
    questions: d.questions
      .filter((_, i) => sel[i])
      .map((q) => ({
        type: q.type,
        text: withUz(q.text, "?"),
        options: q.options.map((o) => ({ id: o.id, text: withUz(o.text, o.id) })),
        scaleMin: q.scaleMin,
        scaleMax: q.scaleMax,
        scaleMinLabel: optionalL(q.scaleMinLabel) ?? "",
        scaleMaxLabel: optionalL(q.scaleMaxLabel) ?? "",
        required: q.required,
      })),
  };
}

/** Game content set (server: createGameSetFromDraft). Always created INACTIVE. */
export function gameDraftPayload(d: GameImportDraft, sel: boolean[]): GameContentDraft {
  const base = {
    title: withUz(d.title, "Set"),
    description: withUz(d.description),
    subject_key: /^[a-z0-9_-]{1,40}$/.test(d.subject_key) ? d.subject_key : "general",
    grade: d.grade,
    difficulty: d.difficulty,
    is_active: false,
  };
  const pick = <T,>(a: T[]) => a.filter((_, i) => sel[i]);
  if (d.gameType === "matching") {
    return { ...base, game_type: "matching", items: pick(d.pairs).map((p, i) => ({ id: `p${i + 1}`, left: withUz(p.left, "-"), right: withUz(p.right, "-") })) };
  }
  if (d.gameType === "true_false") {
    return {
      ...base,
      game_type: "true_false",
      items: pick(d.statements).map((s, i) => ({ id: `s${i + 1}`, statement: withUz(s.text, "-"), is_true: s.isTrue === true, explanation: optionalL(s.explanation) })),
    };
  }
  return {
    ...base,
    game_type: "quiz_race",
    items: pick(d.questions).map((q, i) => ({
      id: `q${i + 1}`,
      question: withUz(q.text, "?"),
      options: q.options.map((o) => ({ id: o.id, text: withUz(o.text, o.id) })),
      correct_option_id: q.correct ?? "A",
      explanation: optionalL(q.explanation),
    })),
  };
}
