import { describe, expect, it } from "vitest";
import {
  buildRows, cellKey, cycleStatus, draftKey, listPendingDrafts, navReduce, needsReason, parseDraft, parsePaste, parseScoreInput, priorAbsentStreak, pushUndo, rowAverage,
  saveDraft, sortCols, tally, type AttDraft, type JCell, type JCol, type StorageLike,
} from "@/lib/school/teacher-logic";
import { KIND_ORDER } from "@/lib/school/grading";

class MemStorage implements StorageLike {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe("attendance status cycling", () => {
  it("cycles present -> absent -> late -> excused -> sick -> present", () => {
    expect(cycleStatus("present")).toBe("absent");
    expect(cycleStatus("absent")).toBe("late");
    expect(cycleStatus("late")).toBe("excused");
    expect(cycleStatus("excused")).toBe("sick");
    expect(cycleStatus("sick")).toBe("present");
  });
  it("goes backwards and treats unmarked as present", () => {
    expect(cycleStatus("present", -1)).toBe("sick");
    expect(cycleStatus(null)).toBe("absent");
  });
  it("tallies rows", () => {
    const r = { a: { status: "absent" as const, minutes_late: 0, note: "" }, b: { status: "present" as const, minutes_late: 0, note: "" } };
    expect(tally(r)).toMatchObject({ present: 1, absent: 1, late: 0 });
  });
  it("counts absent streak before a date, ignoring unmarked days", () => {
    const dates = ["2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13"];
    expect(priorAbsentStreak(dates, ["present", "absent", null, "absent"], "2026-10-14")).toBe(2);
    expect(priorAbsentStreak(dates, ["absent", "sick", "absent", "absent"], "2026-10-14")).toBe(2);
    expect(priorAbsentStreak(dates, ["absent", "absent", "absent", "absent"], "2026-10-13")).toBe(3);
  });
});

describe("attendance drafts", () => {
  const draft = (pending: boolean): AttDraft => ({ v: 1, class_id: "c1", date: "2026-10-15", lesson_no: null, savedAt: 1, pending, rows: { s1: { status: "absent", minutes_late: 0, note: "flu" } } });
  it("round-trips and rejects garbage", () => {
    const st = new MemStorage();
    const k = draftKey("u1", "c1", "2026-10-15", null);
    expect(saveDraft(st, k, draft(true))).toBe(true);
    expect(parseDraft(st.getItem(k))?.rows.s1.note).toBe("flu");
    expect(parseDraft("{bad")).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 2 }))).toBeNull();
  });
  it("lists only pending drafts of the user", () => {
    const st = new MemStorage();
    saveDraft(st, draftKey("u1", "c1", "2026-10-15", null), draft(true));
    saveDraft(st, draftKey("u1", "c2", "2026-10-15", 2), draft(false));
    saveDraft(st, draftKey("u2", "c1", "2026-10-15", null), draft(true));
    expect(listPendingDrafts(st, "u1")).toHaveLength(1);
  });
  it("builds rows from server + draft and flags a restored draft", () => {
    const server = [{ student_id: "s1", status: null, minutes_late: 0, note: null }, { student_id: "s2", status: "late" as const, minutes_late: 7, note: null }];
    const plain = buildRows(server, null);
    expect(plain.rows.s1.status).toBe("present");
    expect(plain.rows.s2.minutes_late).toBe(7);
    expect(plain.fromDraft).toBe(false);
    const withDraft = buildRows(server, draft(false));
    expect(withDraft.rows.s1.status).toBe("absent");
    expect(withDraft.fromDraft).toBe(true);
  });
});

describe("journal maths", () => {
  const cols: JCol[] = [
    { id: "a", date: "2026-10-01", kind: "daily", weight: 1 },
    { id: "b", date: "2026-10-02", kind: "test", weight: 2 },
    { id: "c", date: "2026-10-03", kind: "term", weight: 1 },
  ];
  const cells: Record<string, JCell> = {
    [cellKey("s", "a")]: { score: 5, comment: null },
    [cellKey("s", "b")]: { score: 3, comment: null },
    [cellKey("s", "c")]: { score: 1, comment: null },
  };
  it("computes the weighted average and ignores term entries", () => {
    expect(rowAverage("s", cols, cells)).toBe(3.67);
    expect(rowAverage("nobody", cols, cells)).toBeNull();
  });
  it("parses score input", () => {
    expect(parseScoreInput("4")).toBe(4);
    expect(parseScoreInput("4,5")).toBe(4.5);
    expect(parseScoreInput("")).toBeNull();
    expect(parseScoreInput("6")).toBe("invalid");
    expect(parseScoreInput("0")).toBe("invalid");
    expect(parseScoreInput("abc")).toBe("invalid");
  });
  it("parses spreadsheet paste", () => {
    expect(parsePaste("5\t4\r\n3\t\t2\n")).toEqual([["5", "4"], ["3", "", "2"]]);
  });
  it("sorts columns by date then kind order and bounds the undo stack", () => {
    const s = sortCols([{ id: "x", date: "2026-10-02", kind: "test", weight: 2 }, { id: "y", date: "2026-10-02", kind: "daily", weight: 1 }, { id: "z", date: "2026-10-01", kind: "exam", weight: 3 }], KIND_ORDER);
    expect(s.map((c) => c.id)).toEqual(["z", "y", "x"]);
    let u: ReturnType<typeof pushUndo> = [];
    for (let i = 0; i < 60; i++) u = pushUndo(u, { key: String(i), before: undefined });
    expect(u).toHaveLength(50);
    expect(u[49].key).toBe("59");
  });
  it("needs a reason only when the value differs from the suggestion", () => {
    expect(needsReason(4, 4)).toBe(false);
    expect(needsReason(5, 4)).toBe(true);
    expect(needsReason(null, 4)).toBe(false);
  });
});

describe("keyboard navigation reducer", () => {
  const S = (r: number, c: number, editing = false) => ({ r, c, editing });
  it("moves with arrows and clamps", () => {
    expect(navReduce(S(0, 0), "ArrowDown", false, 3, 3).state).toEqual(S(1, 0));
    expect(navReduce(S(0, 0), "ArrowUp", false, 3, 3).state).toEqual(S(0, 0));
    expect(navReduce(S(2, 2), "ArrowRight", false, 3, 3).state).toEqual(S(2, 2));
  });
  it("Enter starts editing, a second Enter commits and goes down", () => {
    const a = navReduce(S(1, 1), "Enter", false, 3, 3);
    expect(a.state.editing).toBe(true);
    const b = navReduce(a.state, "Enter", false, 3, 3);
    expect(b.commit).toBe(true);
    expect(b.state).toEqual(S(2, 1));
  });
  it("Tab wraps to the next row; Shift+Tab goes back", () => {
    expect(navReduce(S(0, 2), "Tab", false, 3, 3).state).toEqual(S(1, 0));
    expect(navReduce(S(1, 0), "Tab", true, 3, 3).state).toEqual(S(0, 2));
    expect(navReduce(S(2, 2), "Tab", false, 3, 3).handled).toBe(false);
  });
  it("Escape cancels an edit; arrows left/right belong to the input while editing", () => {
    expect(navReduce(S(1, 1, true), "Escape", false, 3, 3).cancel).toBe(true);
    expect(navReduce(S(1, 1, true), "ArrowLeft", false, 3, 3).handled).toBe(false);
    expect(navReduce(S(1, 1, true), "ArrowDown", false, 3, 3).commit).toBe(true);
  });
});
