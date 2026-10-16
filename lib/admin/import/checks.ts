// Draft consistency checks that must also run in the browser (preview dialog re-checks after the user edits).
import { checkScales, scoreRange } from "@/lib/admin/scales";
import type { QuestionDraft, ScaleDraft, Warning, WarningCode } from "./types";

export const warn = (code: WarningCode, level: Warning["level"] = "warn", params?: Warning["params"]): Warning => ({ code, level, ...(params ? { params } : {}) });

/** Overlap / gap warnings for a scale set against the possible score range of the (selected) questions. */
export function scaleWarnings(scales: ScaleDraft[], questions: QuestionDraft[]): Warning[] {
  if (!scales.length) return [warn("no_scales")];
  const list = scales.map((s, i) => ({ id: i, min_score: s.min, max_score: s.max }));
  const range = scoreRange(questions.map((q) => ({ options: q.options.map((o) => ({ score: o.score })) })));
  const issues = checkScales(list, questions.length ? range : undefined);
  const out: Warning[] = [];
  for (const it of issues) {
    if (it.kind === "overlap") out.push(warn("scale_overlap", "error", { a: `${it.a.min_score}-${it.a.max_score}`, b: `${it.b.min_score}-${it.b.max_score}` }));
    else if (it.kind === "gap") out.push(warn("scale_gap", "warn", { from: it.from, to: it.to }));
    else out.push(warn("scale_overlap", "error", { a: `${it.a.min_score}-${it.a.max_score}`, b: "min>max" }));
  }
  return out;
}
