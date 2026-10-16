"use client";

/**
 * Tiny Web Audio sound engine.
 * - ONE shared, lazily created AudioContext (never one per sound).
 * - Resumed on user gesture via unlockAudio().
 * - Muted flag persisted in localStorage; subscribe()/getMuted() work with useSyncExternalStore.
 */

export type SoundKind = "tap" | "correct" | "wrong" | "combo" | "start" | "win" | "lose" | "tick";

const STORAGE_KEY = "maktab.sound.muted";

let ctx: AudioContext | null = null;
let muted: boolean | null = null; // null = not read yet
const listeners = new Set<() => void>();

function readMuted(): boolean {
  if (muted !== null) return muted;
  let value = false;
  try {
    value = typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    value = false;
  }
  muted = value;
  return value;
}

export function getMuted(): boolean {
  return readMuted();
}

export function getMutedServer(): boolean {
  return false;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable: keep in memory only */
  }
  listeners.forEach((l) => l());
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from a click/keydown handler so browsers allow audio. Safe to call repeatedly. */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") {
    void c.resume().catch(() => undefined);
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

const PATTERNS: Record<SoundKind, Array<[number, number, number, OscillatorType, number]>> = {
  // [freq, offset, duration, type, gain]
  tap: [[520, 0, 0.06, "sine", 0.08]],
  tick: [[900, 0, 0.03, "square", 0.03]],
  correct: [
    [660, 0, 0.1, "sine", 0.12],
    [880, 0.08, 0.14, "sine", 0.12],
  ],
  wrong: [
    [220, 0, 0.14, "sawtooth", 0.08],
    [165, 0.1, 0.2, "sawtooth", 0.08],
  ],
  combo: [
    [660, 0, 0.08, "triangle", 0.12],
    [880, 0.07, 0.08, "triangle", 0.12],
    [1175, 0.14, 0.16, "triangle", 0.12],
  ],
  start: [
    [440, 0, 0.1, "sine", 0.1],
    [660, 0.1, 0.16, "sine", 0.1],
  ],
  win: [
    [523, 0, 0.14, "triangle", 0.14],
    [659, 0.13, 0.14, "triangle", 0.14],
    [784, 0.26, 0.14, "triangle", 0.14],
    [1047, 0.39, 0.3, "triangle", 0.14],
  ],
  lose: [
    [392, 0, 0.18, "sine", 0.12],
    [330, 0.16, 0.18, "sine", 0.12],
    [262, 0.32, 0.3, "sine", 0.12],
  ],
};

export function playSound(kind: SoundKind): void {
  if (readMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => undefined);
  const now = c.currentTime;
  for (const [freq, offset, dur, type, gain] of PATTERNS[kind]) {
    tone(c, freq, now + offset, dur, type, gain);
  }
}
