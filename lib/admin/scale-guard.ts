// Server-side psych scale validation used by the admin API (overlaps / internal gaps on save, full coverage on activation).
import { RESOURCE_MAP } from "./resources";
import { checkScales, scoreRange, type ScaleIssue } from "./scales";
import { listRows } from "./store";

async function loadScales(testId: string) {
  const out = await listRows(RESOURCE_MAP.psych_result_scales, { all: true, filters: { psych_test_id: testId } });
  return out.rows.map((r) => ({ id: r.id, min_score: Number(r.min_score), max_score: Number(r.max_score) }));
}

/** Issues the scale set would have after saving `change` (ends of the range may stay open while the editor is building it). */
export async function scaleIssuesOnSave(testId: string, change: { id?: string | number; min: number; max: number }): Promise<ScaleIssue[]> {
  const scales = (await loadScales(testId)).filter((s) => String(s.id) !== String(change.id));
  scales.push({ id: change.id ?? "new", min_score: change.min, max_score: change.max });
  return checkScales(scales);
}

/** Full coverage check (including both ends of the possible score range) required to activate a test. */
export async function scaleIssuesForActivation(testId: string): Promise<ScaleIssue[]> {
  const scales = await loadScales(testId);
  const qs = await listRows(RESOURCE_MAP.psych_questions, { all: true, filters: { psych_test_id: testId } });
  const range = scoreRange(qs.rows as { options?: { score?: number }[] }[]);
  const issues = checkScales(scales, qs.rows.length ? range : undefined);
  if (!scales.length && !issues.length) issues.push({ kind: "gap", from: range.lo, to: range.hi });
  return issues;
}
