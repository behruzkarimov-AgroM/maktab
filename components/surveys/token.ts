// Browser-side anonymous respondent token. A random UUID kept in localStorage; the server only ever stores a hash
// (salted with the survey id, so the same browser cannot be correlated across surveys).
const TOKEN_KEY = "ca:survey-token";
const DONE_KEY = "ca:survey-done";

let memoryToken: string | null = null;

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  const b = new Uint8Array(16);
  (globalThis.crypto ?? ({ getRandomValues: (a: Uint8Array) => a } as Crypto)).getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function getRespondentToken(): string {
  try {
    const cur = window.localStorage.getItem(TOKEN_KEY);
    if (cur && /^[A-Za-z0-9_-]{16,64}$/.test(cur)) return cur;
    const next = uuid();
    window.localStorage.setItem(TOKEN_KEY, next);
    return next;
  } catch {
    return (memoryToken ??= uuid());
  }
}

function readDone(): string[] {
  try {
    const raw = window.localStorage.getItem(DONE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function isSurveyDone(id: string): boolean {
  return readDone().includes(id);
}

export function markSurveyDone(id: string): void {
  try {
    const list = readDone();
    if (!list.includes(id)) window.localStorage.setItem(DONE_KEY, JSON.stringify([...list, id].slice(-100)));
  } catch {
    /* storage unavailable: server-side token check still applies */
  }
}
