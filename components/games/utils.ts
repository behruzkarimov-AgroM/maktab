export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function shuffle<T>(input: readonly T[]): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fraction of the time budget already used, tolerant of Infinity (no limit). */
export function timeProgress(elapsedMs: number, remainingMs: number): number {
  if (!Number.isFinite(remainingMs)) return 0;
  const total = elapsedMs + Math.max(0, remainingMs);
  return total <= 0 ? 0 : Math.min(1, elapsedMs / total);
}
