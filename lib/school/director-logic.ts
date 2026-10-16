// Pure helpers for the director panel (client + server safe, no imports of server modules).
// Covered by tests/school-director.test.ts.
import type { ImportPreview, RiskFlag, ScheduleSlot, SchoolClass, Student } from "./types";

/* ------------------------------ dates ------------------------------ */
export const addDaysStr = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** 1 = Monday ... 7 = Sunday */
export const isoWeekday = (date: string): number => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
export type RangeView = "day" | "week" | "month";
/** inclusive [from, to] range of a day / Monday-Sunday week / calendar month around `date` */
export function rangeFor(view: RangeView, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: date };
  if (view === "week") {
    const from = addDaysStr(date, 1 - isoWeekday(date));
    return { from, to: addDaysStr(from, 6) };
  }
  const from = `${date.slice(0, 8)}01`;
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return { from, to: d.toISOString().slice(0, 10) };
}
/** moves the anchor date by one view unit */
export function shiftRange(view: RangeView, date: string, dir: -1 | 1): string {
  if (view === "day") return addDaysStr(date, dir);
  if (view === "week") return addDaysStr(date, 7 * dir);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir, 1);
  return d.toISOString().slice(0, 10);
}
export function datesBetween(from: string, to: string, skipSunday = true): string[] {
  const out: string[] = [];
  for (let d = from, i = 0; d <= to && i < 400; d = addDaysStr(d, 1), i++) if (!skipSunday || isoWeekday(d) !== 7) out.push(d);
  return out;
}

/* ------------------------------ numbers ------------------------------ */
export const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
export const mean = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
};

/* ------------------------------ schedule conflicts ------------------------------ */
export type ConflictKind = "class" | "teacher" | "room";
export interface SlotConflict {
  kind: ConflictKind;
  with: ScheduleSlot;
}
type SlotLike = Pick<ScheduleSlot, "class_id" | "teacher_id" | "lesson_no" | "room"> & { id?: string; weekday: number };

/** Conflicts of a candidate slot against the existing ones: same class cell, teacher double-booked, room used by another class. */
export function detectSlotConflicts(existing: ScheduleSlot[], cand: SlotLike): SlotConflict[] {
  const out: SlotConflict[] = [];
  const room = cand.room?.trim().toLowerCase() || null;
  for (const s of existing) {
    if (cand.id && s.id === cand.id) continue;
    if (s.weekday !== cand.weekday || s.lesson_no !== cand.lesson_no) continue;
    if (s.class_id === cand.class_id) out.push({ kind: "class", with: s });
    else {
      if (cand.teacher_id && s.teacher_id === cand.teacher_id) out.push({ kind: "teacher", with: s });
      if (room && s.room?.trim().toLowerCase() === room) out.push({ kind: "room", with: s });
    }
  }
  return out;
}

/** All clashes inside a full timetable (teacher or room used twice in one cell). Returns slot ids that are in conflict. */
export function findTimetableConflicts(slots: ScheduleSlot[]): { slot: ScheduleSlot; kind: ConflictKind; with: ScheduleSlot }[] {
  const out: { slot: ScheduleSlot; kind: ConflictKind; with: ScheduleSlot }[] = [];
  const byCell = new Map<string, ScheduleSlot[]>();
  for (const s of slots) {
    const k = `${s.weekday}:${s.lesson_no}`;
    (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(s);
  }
  for (const group of byCell.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.teacher_id && a.teacher_id === b.teacher_id) out.push({ slot: a, kind: "teacher", with: b });
        if (a.room && b.room && a.room.trim().toLowerCase() === b.room.trim().toLowerCase()) out.push({ slot: a, kind: "room", with: b });
        if (a.class_id === b.class_id) out.push({ slot: a, kind: "class", with: b });
      }
    }
  }
  return out;
}

/* ------------------------------ rollover ------------------------------ */
export interface RolloverItem {
  from_class_id: string;
  from_name: string;
  to_name: string | null;
  /** existing class in the target year, else it will be created */
  to_class_id: string | null;
  action: "promote" | "graduate";
  student_count: number;
}
/** Plan promoting every class N -> N+1 (same letter); the last grade graduates. */
export function planRollover(sourceClasses: SchoolClass[], targetClasses: SchoolClass[], students: Pick<Student, "class_id" | "status">[], maxGrade = 11): RolloverItem[] {
  return sourceClasses
    .slice()
    .sort((a, b) => a.grade - b.grade || a.letter.localeCompare(b.letter))
    .map((c) => {
      const count = students.filter((s) => s.class_id === c.id && s.status === "active").length;
      if (c.grade >= maxGrade) return { from_class_id: c.id, from_name: c.name, to_name: null, to_class_id: null, action: "graduate" as const, student_count: count };
      const toName = `${c.grade + 1}${c.letter}`;
      const hit = targetClasses.find((t) => t.grade === c.grade + 1 && t.letter === c.letter);
      return { from_class_id: c.id, from_name: c.name, to_name: toName, to_class_id: hit?.id ?? null, action: "promote" as const, student_count: count };
    });
}

/* ------------------------------ import ------------------------------ */
export const IMPORT_COLUMNS = ["last_name", "first_name", "middle_name", "birth_date", "gender", "class", "student_code", "phone", "address", "guardian_name", "guardian_phone"] as const;
export const IMPORT_TEMPLATE_ROWS: Record<string, string>[] = [
  { last_name: "Karimov", first_name: "Aziz", middle_name: "Olimovich", birth_date: "2014-05-12", gender: "m", class: "3A", student_code: "", phone: "+998901234567", address: "Termiz", guardian_name: "Karimova Dilfuza", guardian_phone: "+998901112233" },
  { last_name: "Rahimova", first_name: "Madina", middle_name: "", birth_date: "12.09.2013", gender: "f", class: "4A", student_code: "", phone: "", address: "", guardian_name: "", guardian_phone: "" },
];
export type ImportCommitRow = {
  first_name: string; last_name: string; middle_name?: string | null; birth_date?: string | null; gender?: "m" | "f" | null;
  class_name?: string | null; student_code?: string | null; phone?: string | null; address?: string | null; guardian_name?: string | null; guardian_phone?: string | null;
};
/** Rows to commit from a preview. Invalid rows never go; duplicates only when `includeDuplicates` (with on_duplicate=update). */
export function previewToCommitRows(preview: ImportPreview, opts: { includeDuplicates: boolean; excluded?: Set<number> }): ImportCommitRow[] {
  const out: ImportCommitRow[] = [];
  for (const r of preview.rows) {
    if (!r.ok || !r.data || opts.excluded?.has(r.row)) continue;
    if (r.duplicate !== "none" && !opts.includeDuplicates) continue;
    const d = r.data;
    out.push({
      first_name: d.first_name ?? "", last_name: d.last_name ?? "", middle_name: d.middle_name ?? null, birth_date: d.birth_date ?? null, gender: d.gender ?? null,
      class_name: d.class_name ?? null, student_code: d.student_code ?? null, phone: d.phone ?? null, address: d.address ?? null,
      guardian_name: d.guardian_name ?? null, guardian_phone: d.guardian_phone ?? null,
    });
  }
  return out;
}

/* ------------------------------ analytics ------------------------------ */
export interface RiskLike {
  flags: RiskFlag[];
  class_name: string | null;
  attendance_percent: number | null;
  average: number | null;
  streak: number;
}
export function filterRisk<T extends RiskLike>(rows: T[], f: { grade?: number | null; flag?: RiskFlag | ""; q?: string; nameOf?: (r: T) => string }): T[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.grade && parseInt(r.class_name ?? "", 10) !== f.grade) return false;
    if (f.flag && !r.flags.includes(f.flag)) return false;
    if (q && f.nameOf && !f.nameOf(r).toLowerCase().includes(q)) return false;
    return true;
  });
}
/** competition ranking (1,2,2,4) descending by value; nulls last and unranked */
export function rankDesc<T>(items: T[], value: (t: T) => number | null): { item: T; rank: number | null }[] {
  const sorted = [...items].sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1));
  let prev: number | null = null;
  let rank = 0;
  return sorted.map((item, i) => {
    const v = value(item);
    if (v === null) return { item, rank: null };
    if (v !== prev) {
      rank = i + 1;
      prev = v;
    }
    return { item, rank };
  });
}
/** attendance rows -> per class percent */
export function percentByKey<T extends { status: string }>(rows: T[], key: (r: T) => string): Map<string, number | null> {
  const acc = new Map<string, { ok: number; all: number }>();
  for (const r of rows) {
    const k = key(r);
    const a = acc.get(k) ?? acc.set(k, { ok: 0, all: 0 }).get(k)!;
    a.all++;
    if (r.status === "present" || r.status === "late") a.ok++;
  }
  return new Map([...acc].map(([k, v]) => [k, pct(v.ok, v.all)]));
}
/** normalises free-text absence reasons for grouping */
export function normalizeReason(note: string | null | undefined): string {
  return (note ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
}

/* ------------------------------ misc ------------------------------ */
export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const gradeOf = (className: string | null | undefined): number | null => {
  const n = parseInt(className ?? "", 10);
  return Number.isFinite(n) ? n : null;
};
