// Validation of psych result scales (min/max score ranges): overlap and gap detection.
export interface ScaleLike {
  id: string | number;
  min_score: number;
  max_score: number;
}

export type ScaleIssue =
  | { kind: "bad"; a: ScaleLike }
  | { kind: "overlap"; a: ScaleLike; b: ScaleLike }
  | { kind: "gap"; from: number; to: number };

/** Possible total score range of a psych test: sum of min / max option score per question. */
export function scoreRange(questions: { options?: { score?: number }[] }[]): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  for (const q of questions) {
    const s = (q.options ?? []).map((o) => Number(o.score ?? 0));
    if (!s.length) continue;
    lo += Math.min(...s);
    hi += Math.max(...s);
  }
  return { lo, hi };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function checkScales(scales: ScaleLike[], range?: { lo: number; hi: number }): ScaleIssue[] {
  const issues: ScaleIssue[] = [];
  const valid = scales.filter((s) => {
    if (s.min_score > s.max_score) {
      issues.push({ kind: "bad", a: s });
      return false;
    }
    return true;
  });
  const sorted = [...valid].sort((x, y) => x.min_score - y.min_score || x.max_score - y.max_score);
  for (let i = 1; i < sorted.length; i++) {
    for (let j = 0; j < i; j++) {
      if (sorted[i].min_score <= sorted[j].max_score) {
        issues.push({ kind: "overlap", a: sorted[j], b: sorted[i] });
        break;
      }
    }
  }
  // gaps (integer scores): between consecutive scales and at the edges of the possible range
  // integer scales: adjacent when min == reach + 1; decimal scales: must touch (min <= reach)
  const allInt = sorted.every((s) => Number.isInteger(s.min_score) && Number.isInteger(s.max_score)) && (!range || (Number.isInteger(range.lo) && Number.isInteger(range.hi)));
  const unit = allInt ? 1 : 0.01; // decimal scores: assume 2-decimal granularity
  const start = range ? range.lo : sorted[0]?.min_score;
  let reach = start === undefined ? undefined : start - unit; // highest covered score so far
  for (const s of sorted) {
    if (reach !== undefined && s.min_score > reach + unit + 1e-9) issues.push({ kind: "gap", from: round2(reach + unit), to: round2(s.min_score - unit) });
    reach = Math.max(reach ?? s.max_score, s.max_score);
  }
  if (range && sorted.length && reach !== undefined && reach < range.hi) issues.push({ kind: "gap", from: round2(reach + unit), to: range.hi });
  if (range && !sorted.length && range.hi >= range.lo) issues.push({ kind: "gap", from: range.lo, to: range.hi });
  return issues;
}
