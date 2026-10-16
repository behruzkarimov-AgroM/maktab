// Names/scores only, stored in the visitor's own browser. Never sent anywhere.
export const RECENT_KEY = "assessment.recent.v1";

export interface RecentResult {
  kind: "academic" | "psychology";
  title: string;
  /** Percent for academic tests; optional label (e.g. profile name) for psychology. */
  score?: number;
  label?: string;
  at: number;
}

export function readRecent(): RecentResult[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => r && (r.kind === "academic" || r.kind === "psychology") && typeof r.title === "string" && typeof r.at === "number")
      .slice(0, 5)
      .map((r) => ({
        kind: r.kind,
        title: String(r.title).slice(0, 120),
        score: typeof r.score === "number" ? r.score : undefined,
        label: typeof r.label === "string" ? r.label.slice(0, 80) : undefined,
        at: r.at,
      }));
  } catch {
    return [];
  }
}

/** Optional helper the quiz/psych result screens may call after a server-confirmed result. */
export function recordRecent(r: Omit<RecentResult, "at">): void {
  try {
    const next = [{ ...r, at: Date.now() }, ...readRecent()].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
