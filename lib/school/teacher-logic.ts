// Pure logic for the teacher portal (client-safe, no I/O): attendance status cycling + drafts, journal maths and keyboard navigation.
import { weightedAverage, roundHalfUp, addDays } from "./grading";
import type { AttendanceStatus, GradeKind, GradingRules } from "./types";
import { DEFAULT_RULES } from "./grading";

/* ------------------------------ attendance ------------------------------ */

export const STATUS_CYCLE: AttendanceStatus[] = ["present", "absent", "late", "excused", "sick"];

/** next (or previous) status in the one-tap cycle; an unmarked student counts as `present` */
export function cycleStatus(current: AttendanceStatus | null | undefined, dir: 1 | -1 = 1): AttendanceStatus {
  const i = STATUS_CYCLE.indexOf(current ?? "present");
  return STATUS_CYCLE[(i + dir + STATUS_CYCLE.length * 2) % STATUS_CYCLE.length];
}

export const STATUS_KEYS: Record<string, AttendanceStatus> = { p: "present", a: "absent", l: "late", e: "excused", s: "sick" };

export interface AttRow {
  status: AttendanceStatus;
  minutes_late: number;
  note: string;
}

/** minutes only make sense for `late` */
export function normalizeRow(r: AttRow): AttRow {
  return { status: r.status, minutes_late: r.status === "late" ? Math.min(240, Math.max(0, Math.round(r.minutes_late || 0))) : 0, note: r.note.trim().slice(0, 200) };
}

export const draftKey = (userId: string, classId: string, date: string, lessonNo: number | null) => `school-att-draft:${userId}:${classId}:${date}:${lessonNo ?? "day"}`;
export const DRAFT_PREFIX = "school-att-draft:";

export interface AttDraft {
  v: 1;
  class_id: string;
  date: string;
  lesson_no: number | null;
  savedAt: number;
  /** true when a save failed (offline) and must be retried */
  pending: boolean;
  rows: Record<string, AttRow>;
}

export function parseDraft(raw: string | null): AttDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<AttDraft>;
    if (!d || d.v !== 1 || typeof d.class_id !== "string" || typeof d.date !== "string" || !d.rows || typeof d.rows !== "object") return null;
    const rows: Record<string, AttRow> = {};
    for (const [id, r] of Object.entries(d.rows)) {
      if (r && STATUS_CYCLE.includes((r as AttRow).status)) {
        rows[id] = { status: (r as AttRow).status, minutes_late: Number((r as AttRow).minutes_late) || 0, note: String((r as AttRow).note ?? "") };
      }
    }
    return { v: 1, class_id: d.class_id, date: d.date, lesson_no: d.lesson_no ?? null, savedAt: Number(d.savedAt) || 0, pending: !!d.pending, rows };
  } catch {
    return null;
  }
}

export interface StorageLike {
  length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function saveDraft(st: StorageLike, key: string, d: AttDraft): boolean {
  try {
    st.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** every stored draft of this user that still waits for a successful save */
export function listPendingDrafts(st: StorageLike, userId: string): { key: string; draft: AttDraft }[] {
  const out: { key: string; draft: AttDraft }[] = [];
  const prefix = `${DRAFT_PREFIX}${userId}:`;
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    const d = parseDraft(st.getItem(k));
    if (d?.pending) out.push({ key: k, draft: d });
  }
  return out;
}

export interface ServerRow {
  student_id: string;
  status: AttendanceStatus | null;
  minutes_late: number;
  note: string | null;
}

/** working rows: server value, else `present` (unmarked default); a draft overrides both */
export function buildRows(server: ServerRow[], draft: AttDraft | null): { rows: Record<string, AttRow>; fromDraft: boolean } {
  const rows: Record<string, AttRow> = {};
  let fromDraft = false;
  for (const s of server) {
    const d = draft?.rows[s.student_id];
    if (d) {
      rows[s.student_id] = d;
      if (!s.status || d.status !== s.status || d.note !== (s.note ?? "") || d.minutes_late !== (s.minutes_late ?? 0)) fromDraft = true;
    } else {
      rows[s.student_id] = { status: s.status ?? "present", minutes_late: s.minutes_late ?? 0, note: s.note ?? "" };
    }
  }
  return { rows, fromDraft };
}

/**
 * Consecutive absent days directly before `date` for one student. `dates` are ascending sheet dates, `cells` the status per date (null = not marked,
 * ignored). Any non-absent mark ends the streak.
 */
export function priorAbsentStreak(dates: string[], cells: (AttendanceStatus | null)[], date: string): number {
  let n = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] >= date) continue;
    const c = cells[i];
    if (c === null || c === undefined) continue;
    if (c === "absent") n++;
    else break;
  }
  return n;
}

export const attendanceWindow = (today: string, days = 14) => ({ min: addDays(today, -days), max: today });

/** counts per status of working rows */
export function tally(rows: Record<string, AttRow>): Record<AttendanceStatus, number> {
  const out: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0, sick: 0 };
  for (const r of Object.values(rows)) out[r.status]++;
  return out;
}

/** network failure (fetch rejected) rather than a server answer */
export const isNetworkError = (e: unknown): boolean => e instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);

/* ------------------------------ journal ------------------------------ */

export interface JCol {
  /** stable id of the column (does not change when kind/weight are edited) */
  id: string;
  date: string;
  kind: GradeKind;
  weight: number;
}
export interface JCell {
  entryId?: string;
  score: number | null;
  comment: string | null;
}

export const cellKey = (studentId: string, colId: string) => `${studentId}|${colId}`;

/** "4", "4,5", " 5 " -> number; "" -> null (clear); anything else / out of range -> "invalid" */
export function parseScoreInput(raw: string): number | null | "invalid" {
  const s = raw.trim().replace(",", ".");
  if (s === "" || s === "-" || s === "x") return null;
  if (!/^\d(\.\d)?$/.test(s)) return "invalid";
  const n = Number(s);
  return n >= 1 && n <= 5 ? n : "invalid";
}

/** weighted average (2 decimals) of a student's cells using the column weight and kind */
export function rowAverage(student: string, cols: JCol[], cells: Record<string, JCell>, rules: GradingRules = DEFAULT_RULES): number | null {
  const entries: { score: number; weight: number; kind: GradeKind }[] = [];
  for (const c of cols) {
    const cell = cells[cellKey(student, c.id)];
    if (cell && cell.score !== null) entries.push({ score: cell.score, weight: c.weight, kind: c.kind });
  }
  const a = weightedAverage(entries, rules);
  return a === null ? null : roundHalfUp(a, 2);
}

/** spreadsheet clipboard text (tab separated, newline separated) -> matrix of trimmed strings */
export function parsePaste(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l, i, a) => !(i === a.length - 1 && l === ""))
    .map((l) => l.split("\t").map((x) => x.trim()));
}

export interface NavState {
  r: number;
  c: number;
  editing: boolean;
}
export interface NavResult {
  state: NavState;
  /** the key was consumed (call preventDefault) */
  handled: boolean;
  /** an edit finished and its value must be committed */
  commit?: boolean;
  /** an edit was abandoned */
  cancel?: boolean;
}

/** Keyboard navigation of the journal grid (rows x cols). Pure so it can be tested. */
export function navReduce(state: NavState, key: string, shift: boolean, rows: number, cols: number): NavResult {
  const clampR = (r: number) => Math.min(Math.max(r, 0), Math.max(rows - 1, 0));
  const clampC = (c: number) => Math.min(Math.max(c, 0), Math.max(cols - 1, 0));
  const move = (r: number, c: number, extra: Partial<NavResult> = {}): NavResult => ({ state: { r: clampR(r), c: clampC(c), editing: false }, handled: true, ...extra });
  const { r, c, editing } = state;
  switch (key) {
    case "ArrowUp": return move(r - 1, c, editing ? { commit: true } : {});
    case "ArrowDown": return move(r + 1, c, editing ? { commit: true } : {});
    case "ArrowLeft": return editing ? { state, handled: false } : move(r, c - 1);
    case "ArrowRight": return editing ? { state, handled: false } : move(r, c + 1);
    case "Enter":
      return editing ? move(shift ? r - 1 : r + 1, c, { commit: true }) : { state: { r, c, editing: true }, handled: true };
    case "Tab": {
      let nr = r;
      let nc = c + (shift ? -1 : 1);
      if (nc >= cols) { nc = 0; nr = r + 1; }
      if (nc < 0) { nc = cols - 1; nr = r - 1; }
      if (nr < 0 || nr >= rows) return { state, handled: false, ...(editing ? { commit: true } : {}) };
      return move(nr, nc, editing ? { commit: true } : {});
    }
    case "Escape": return editing ? { state: { r, c, editing: false }, handled: true, cancel: true } : { state, handled: false };
    case "Home": return editing ? { state, handled: false } : move(r, 0);
    case "End": return editing ? { state, handled: false } : move(r, cols - 1);
    default: return { state, handled: false };
  }
}

export interface UndoOp {
  key: string;
  before: JCell | undefined;
}
/** bounded undo stack (newest last) */
export function pushUndo(stack: UndoOp[], op: UndoOp, max = 50): UndoOp[] {
  const next = [...stack, op];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** column ordering: by date, then by kind order */
export function sortCols(cols: JCol[], kindOrder: GradeKind[]): JCol[] {
  return [...cols].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)));
}

/** term grade a teacher would confirm by default: the suggestion */
export function needsReason(value: number | null, suggested: number | null): boolean {
  return value !== null && value !== suggested;
}
