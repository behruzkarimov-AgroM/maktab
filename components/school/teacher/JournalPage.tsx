"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2, Lock, Plus, Save, Undo2 } from "lucide-react";
import { Badge, Button, cn, gradeTone, inputCls } from "@/components/school/ui/kit";
import { sget, spost } from "@/lib/school/client";
import { KIND_ORDER } from "@/lib/school/grading";
import {
  cellKey, isNetworkError, navReduce, parsePaste, parseScoreInput, pushUndo, rowAverage, sortCols,
  type JCell, type JCol, type NavState, type UndoOp,
} from "@/lib/school/teacher-logic";
import type { Gradebook, GradeKind } from "@/lib/school/types";
import { EmptyState, ErrorState, Field, fmtShort, Gate, PageHead, PageSkeleton, readPref, selectCls, Tabs, ToastHost, useApi, useBase, useToasts, writePref, type Base } from "./common";
import { LessonsPanel, TermPanel } from "./JournalPanels";
import { useTT } from "./use-tt";

const KINDS: GradeKind[] = ["daily", "homework", "quiz", "test", "exam"];
const toneCls: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  blue: "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  red: "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
  gray: "",
};

export function JournalPage() {
  const state = useBase();
  return <Gate state={state}>{(b) => <JournalInner b={b} />}</Gate>;
}

function JournalInner({ b }: { b: Base }) {
  const { tt, L, errText } = useTT();
  const params = useSearchParams();
  const toasts = useToasts();
  const pairs = b.ov.assignments;
  const classIds = [...new Set(pairs.map((a) => a.class_id))];
  const [classId, setClassId] = useState(() => {
    const q = params.get("class");
    const pref = readPref("j-class");
    return [q, pref].find((x) => x && classIds.includes(x)) ?? classIds[0] ?? "";
  });
  const subjectsOfClass = pairs.filter((a) => a.class_id === classId);
  const [subjectId, setSubjectId] = useState(() => {
    const q = params.get("subject") ?? readPref("j-subject");
    return subjectsOfClass.find((a) => a.subject_id === q)?.subject_id ?? subjectsOfClass[0]?.subject_id ?? "";
  });
  const [termId, setTermId] = useState(() => {
    const q = params.get("term");
    return b.me.terms.find((t) => t.id === q)?.id ?? b.me.term?.id ?? b.me.terms[0]?.id ?? "";
  });
  const [tab, setTab] = useState<"journal" | "term" | "lessons">((params.get("tab") as "term" | "lessons") || "journal");
  const subj = (id: string) => L(b.subjects.find((s) => s.id === id)?.name);

  if (!pairs.length) return <EmptyState text={tt("jr_noAssignments")} />;
  const validSubject = subjectsOfClass.some((a) => a.subject_id === subjectId) ? subjectId : subjectsOfClass[0]?.subject_id ?? "";

  return (
    <div>
      <PageHead title={tt("jr_title")} sub={tt("jr_sub")} />
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={tt("class")}>
          <select className={selectCls} value={classId} onChange={(e) => { setClassId(e.target.value); writePref("j-class", e.target.value); }}>
            {classIds.map((id) => <option key={id} value={id}>{pairs.find((a) => a.class_id === id)?.class_name}</option>)}
          </select>
        </Field>
        <Field label={tt("subject")}>
          <select className={selectCls} value={validSubject} onChange={(e) => { setSubjectId(e.target.value); writePref("j-subject", e.target.value); }}>
            {subjectsOfClass.map((a) => <option key={a.subject_id} value={a.subject_id}>{subj(a.subject_id)}</option>)}
          </select>
        </Field>
        <Field label={tt("term")}>
          <select className={selectCls} value={termId} onChange={(e) => setTermId(e.target.value)}>
            {b.me.terms.map((t) => <option key={t.id} value={t.id}>{t.number} · {t.name}{t.is_locked ? " 🔒" : ""}</option>)}
          </select>
        </Field>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <Tabs value={tab} onChange={setTab} items={[{ key: "journal", label: tt("jr_tabJournal") }, { key: "term", label: tt("jr_tabTerm") }, { key: "lessons", label: tt("jr_tabLessons") }]} />
        </div>
      </div>
      {tab === "journal" && <GridLoader key={`${classId}|${validSubject}|${termId}`} b={b} classId={classId} subjectId={validSubject} termId={termId} subjectName={subj(validSubject)} toasts={toasts} errText={errText} />}
      {tab === "term" && <TermPanel key={`t${classId}|${validSubject}|${termId}`} b={b} classId={classId} subjectId={validSubject} termId={termId} toasts={toasts} />}
      {tab === "lessons" && <LessonsPanel key={`l${classId}|${validSubject}`} b={b} classId={classId} subjectId={validSubject} toasts={toasts} />}
      <ToastHost items={toasts.items} dismiss={toasts.dismiss} />
    </div>
  );
}

function GridLoader(p: { b: Base; classId: string; subjectId: string; termId: string; subjectName: string; toasts: ReturnType<typeof useToasts>; errText: (e: unknown) => string }) {
  const { tt } = useTT();
  const api = useApi<{ gradebook: Gradebook }>(`/grades/gradebook?class_id=${p.classId}&subject_id=${p.subjectId}&term_id=${p.termId}`);
  if (api.error && !api.data) return <ErrorState message={p.errText(api.error)} onRetry={api.reload} />;
  if (!api.data) return <PageSkeleton label={tt("loading")} />;
  return <Grid {...p} gb={api.data.gradebook} />;
}

function build(gb: Gradebook, weights: Record<GradeKind, number>) {
  const colMap = new Map<string, JCol>();
  const cells: Record<string, JCell> = {};
  for (const r of gb.rows)
    for (const e of r.entries) {
      if (e.kind === "term" || e.kind === "year") continue;
      const id = `${e.date}|${e.kind}`;
      if (!colMap.has(id)) colMap.set(id, { id, date: e.date, kind: e.kind, weight: e.weight || weights[e.kind] || 1 });
      cells[cellKey(r.student_id, id)] = { entryId: e.id, score: e.score, comment: e.comment };
    }
  return { cols: sortCols([...colMap.values()], KIND_ORDER), cells };
}

function Grid({ b, classId, subjectId, termId, subjectName, toasts, errText, gb }: { b: Base; classId: string; subjectId: string; termId: string; subjectName: string; toasts: ReturnType<typeof useToasts>; errText: (e: unknown) => string; gb: Gradebook }) {
  const { tt } = useTT();
  const rules = b.me.rules;
  const term = b.me.terms.find((t) => t.id === termId)!;
  const today = b.me.today;
  const init = useMemo(() => build(gb, rules.defaultWeights), [gb, rules.defaultWeights]);
  const [cols, setCols] = useState<JCol[]>(init.cols);
  const [origCols] = useState<Record<string, string>>(() => Object.fromEntries(init.cols.map((c) => [c.id, `${c.kind}|${c.weight}`])));
  const [cells, setCells] = useState<Record<string, JCell>>(init.cells);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [dirtyCols, setDirtyCols] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<UndoOp[]>([]);
  const [nav, setNav] = useState<NavState>({ r: 0, c: 0, editing: false });
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState(today < term.start_date ? term.start_date : today > term.end_date ? term.end_date : today);
  const [newKind, setNewKind] = useState<GradeKind>("daily");
  const edited = useRef<Set<string>>(new Set());
  const canEdit = gb.can_edit;
  const rows = gb.rows;
  const hasDirty = dirty.size > 0 || dirtyCols.size > 0;

  const setCell = useCallback((key: string, cell: JCell | undefined, track = true) => {
    setCells((c) => {
      if (track) setUndo((u) => pushUndo(u, { key, before: c[key] }));
      const n = { ...c };
      if (cell) n[key] = cell;
      else delete n[key];
      return n;
    });
    setDirty((d) => new Set(d).add(key));
    edited.current.add(key);
  }, []);

  const commit = useCallback(
    (r: number, c: number, raw: string): boolean => {
      const col = cols[c];
      const row = rows[r];
      if (!col || !row) return true;
      const v = parseScoreInput(raw);
      if (v === "invalid") {
        toasts.push("error", tt("jr_invalidScore"));
        return false;
      }
      const key = cellKey(row.student_id, col.id);
      const cur = cells[key];
      if ((cur?.score ?? null) === v) return true;
      if (v === null && !cur) return true;
      setCell(key, { entryId: cur?.entryId, score: v, comment: cur?.comment ?? null });
      return true;
    },
    [cols, rows, cells, setCell, toasts, tt],
  );

  const doUndo = useCallback(() => {
    const op = undo[undo.length - 1];
    if (!op) return;
    setUndo((u) => u.slice(0, -1));
    setCells((c) => {
      const n = { ...c };
      if (op.before) n[op.key] = op.before;
      else delete n[op.key];
      return n;
    });
    setDirty((d) => new Set(d).add(op.key));
    edited.current.add(op.key);
  }, [undo]);

  const save = useCallback(async () => {
    if (saving || !canEdit || !hasDirty) return;
    const entries: Record<string, unknown>[] = [];
    const sent = new Set<string>();
    for (const r of rows)
      for (const col of cols) {
        const key = cellKey(r.student_id, col.id);
        const cell = cells[key];
        const colChanged = dirtyCols.has(col.id);
        if (cell && cell.score !== null && (dirty.has(key) || colChanged)) {
          entries.push({ ...(cell.entryId ? { id: cell.entryId } : {}), student_id: r.student_id, date: col.date, kind: col.kind, score: cell.score, weight: col.weight, comment: cell.comment });
          sent.add(key);
        } else if (dirty.has(key) && cell?.entryId && cell.score === null) {
          entries.push({ id: cell.entryId, delete: true });
          sent.add(key);
        } else if (dirty.has(key) && !cell) {
          // an undone insert: nothing to send
          sent.add(key);
        }
      }
    if (!entries.length) {
      setDirty(new Set());
      setDirtyCols(new Set());
      return;
    }
    // deleted cells carry the entry id in `before`; find them through the undo-less path: cells with score null keep entryId
    setSaving(true);
    edited.current = new Set();
    try {
      await spost("/grades/bulk", { class_id: classId, subject_id: subjectId, term_id: termId, entries: entries.slice(0, 300) });
      const fresh = await sget<{ gradebook: Gradebook }>(`/grades/gradebook?class_id=${classId}&subject_id=${subjectId}&term_id=${termId}`);
      const rb = build(fresh.gradebook, rules.defaultWeights);
      setCells(() => {
        const n = { ...rb.cells };
        for (const k of edited.current) {
          const c = cells[k];
          if (c) n[k] = { ...c, entryId: rb.cells[k]?.entryId ?? c.entryId };
        }
        return n;
      });
      setCols((old) => {
        const ids = new Set(old.map((c) => c.id));
        const extra = rb.cols.filter((c) => !ids.has(c.id));
        return sortCols([...old, ...extra], KIND_ORDER);
      });
      setDirty(new Set(edited.current));
      setDirtyCols((d) => new Set([...d].filter(() => false)));
      setUndo([]);
      toasts.push("ok", tt("jr_saved", { n: entries.length }));
    } catch (e) {
      toasts.push("error", isNetworkError(e) ? tt("err_network") : errText(e));
    } finally {
      setSaving(false);
    }
  }, [saving, canEdit, hasDirty, rows, cols, cells, dirty, dirtyCols, classId, subjectId, termId, rules.defaultWeights, toasts, tt, errText]);

  /* autosave 2.5 s after the last edit */
  useEffect(() => {
    if (!hasDirty || !canEdit) return;
    const h = window.setTimeout(() => void save(), 2500);
    return () => window.clearTimeout(h);
  }, [hasDirty, canEdit, save, cells, cols]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);
  useEffect(() => {
    if (!hasDirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasDirty]);

  const gridRef = useRef<HTMLTableElement>(null);
  useEffect(() => {
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${nav.r}-${nav.c}"]`)?.focus({ preventScroll: false });
  }, [nav.r, nav.c, nav.editing]);

  const onGridKey = (e: React.KeyboardEvent) => {
    if (!rows.length || !cols.length) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      doUndo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!nav.editing && canEdit && (/^[1-5]$/.test(e.key) || e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      if (e.key === "Delete" || e.key === "Backspace") commit(nav.r, nav.c, "");
      else {
        setEditVal(e.key);
        setNav({ ...nav, editing: true });
      }
      return;
    }
    const res = navReduce(nav, e.key, e.shiftKey, rows.length, cols.length);
    if (!res.handled && !res.commit) return;
    if (res.handled) e.preventDefault();
    if (res.commit && !commit(nav.r, nav.c, editVal)) return;
    if (res.state.editing && !nav.editing) {
      if (!canEdit) return;
      setEditVal(cells[cellKey(rows[nav.r].student_id, cols[nav.c].id)]?.score?.toString() ?? "");
    }
    setNav(res.state);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (!canEdit || nav.editing) return;
    const text = e.clipboardData.getData("text");
    const m = parsePaste(text);
    if (!m.length || (m.length === 1 && m[0].length === 1 && !text.includes("\t") && !text.includes("\n") && !text.trim())) return;
    e.preventDefault();
    let bad = 0;
    let n = 0;
    m.forEach((line, i) =>
      line.forEach((raw, j) => {
        const r = nav.r + i;
        const c = nav.c + j;
        if (r >= rows.length || c >= cols.length) return;
        const v = parseScoreInput(raw);
        if (v === "invalid") {
          bad++;
          return;
        }
        const key = cellKey(rows[r].student_id, cols[c].id);
        const cur = cells[key];
        if ((cur?.score ?? null) === v || (v === null && !cur)) return;
        setCell(key, { entryId: cur?.entryId, score: v, comment: cur?.comment ?? null });
        n++;
      }),
    );
    toasts.push(bad ? "error" : "ok", tt("jr_pasted", { n, bad }));
  };

  const addColumn = () => {
    const id = `${newDate}|${newKind}`;
    if (cols.some((c) => c.id === id)) {
      toasts.push("error", tt("jr_colExists"));
      return;
    }
    if (newDate < term.start_date || newDate > term.end_date || newDate > today) {
      toasts.push("error", tt("err_date_out_of_term"));
      return;
    }
    setCols((c) => sortCols([...c, { id, date: newDate, kind: newKind, weight: rules.defaultWeights[newKind] ?? 1 }], KIND_ORDER));
  };
  const patchCol = (id: string, patch: Partial<JCol>) => {
    setCols((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const next = { ...cols.find((c) => c.id === id)!, ...patch };
    setDirtyCols((d) => {
      const n = new Set(d);
      if (origCols[id] === `${next.kind}|${next.weight}`) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const head = [tt("student"), ...cols.map((c) => `${fmtShort(c.date)} ${tt(`kind_${c.kind}` as never)}`), tt("jr_avg")];
    const data = rows.map((r) => [`${r.last_name} ${r.first_name}`, ...cols.map((c) => cells[cellKey(r.student_id, c.id)]?.score ?? ""), rowAverage(r.student_id, cols, cells, rules) ?? ""]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, subjectName.slice(0, 28) || "Journal");
    XLSX.writeFile(wb, `journal-${gb.class_id.slice(0, 4)}-${term.number}.xlsx`);
  };

  const activeRow = rows[nav.r];
  const activeCol = cols[nav.c];
  const activeKey = activeRow && activeCol ? cellKey(activeRow.student_id, activeCol.id) : "";
  const activeCell = activeKey ? cells[activeKey] : undefined;

  return (
    <div>
      {!canEdit && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="size-4" />
          {gb.term_locked ? tt("jr_locked") : tt("jr_readonly")}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {canEdit && (
          <>
            <Field label={tt("jr_newColumn")}>
              <div className="flex gap-1.5">
                <input type="date" className={cn(inputCls, "min-h-11 w-40")} value={newDate} min={term.start_date} max={today < term.end_date ? today : term.end_date} onChange={(e) => e.target.value && setNewDate(e.target.value)} />
                <select className={selectCls} value={newKind} onChange={(e) => setNewKind(e.target.value as GradeKind)} aria-label={tt("jr_kind")}>
                  {KINDS.map((k) => <option key={k} value={k}>{tt(`kind_${k}` as never)}</option>)}
                </select>
                <Button onClick={addColumn} className="min-h-11"><Plus className="size-4" />{tt("add")}</Button>
              </div>
            </Field>
            <Button onClick={doUndo} disabled={!undo.length} className="min-h-11"><Undo2 className="size-4" />{tt("jr_undo")}</Button>
            <Button variant="primary" onClick={() => void save()} disabled={!hasDirty} loading={saving} className="min-h-11"><Save className="size-4" />{tt("save")}</Button>
          </>
        )}
        <Button onClick={() => void exportXlsx()} className="min-h-11"><Download className="size-4" />xlsx</Button>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {hasDirty ? <Badge tone="amber">{tt("att_stateUnsaved")}</Badge> : <Badge tone="green">{tt("att_stateSaved")}</Badge>}
          {tt("jr_classAvg")}: <b>{gb.class_average?.toFixed(2) ?? "–"}</b>
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState text={tt("att_noStudents")} />
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" onPaste={onPaste}>
          <table ref={gridRef} role="grid" aria-label={tt("jr_title")} aria-rowcount={rows.length + 1} aria-colcount={cols.length + 2} onKeyDown={onGridKey} className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr role="row">
                <th scope="col" className="sticky left-0 top-0 z-20 min-w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">{tt("student")}</th>
                {cols.map((c) => (
                  <th key={c.id} scope="col" role="columnheader" className="sticky top-0 z-10 min-w-20 sm:min-w-16 border-b border-slate-200 bg-slate-50 px-1 py-1 text-center text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-800">
                    <div>{fmtShort(c.date)}</div>
                    {canEdit ? (
                      <>
                        <select aria-label={tt("jr_kind")} value={c.kind} onChange={(e) => patchCol(c.id, { kind: e.target.value as GradeKind, weight: rules.defaultWeights[e.target.value as GradeKind] ?? 1 })} className="w-full rounded border border-slate-300 bg-white px-0.5 text-[10px] max-sm:min-h-11 max-sm:text-xs dark:border-slate-600 dark:bg-slate-900">
                          {KINDS.map((k) => <option key={k} value={k}>{tt(`kind_${k}` as never)}</option>)}
                        </select>
                        <input aria-label={tt("jr_weight")} type="number" step="0.5" min="0.5" max="10" value={c.weight} onChange={(e) => Number(e.target.value) > 0 && patchCol(c.id, { weight: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-0.5 text-center text-[10px] max-sm:min-h-11 max-sm:text-xs dark:border-slate-600 dark:bg-slate-900" />
                      </>
                    ) : (
                      <div className="font-normal text-slate-500 dark:text-slate-400">{tt(`kind_${c.kind}` as never)} ×{c.weight}</div>
                    )}
                  </th>
                ))}
                <th scope="col" className="sticky right-0 top-0 z-20 min-w-16 border-b border-l border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">{tt("jr_avg")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const avg = rowAverage(r.student_id, cols, cells, rules);
                return (
                  <tr key={r.student_id} role="row" aria-rowindex={ri + 2}>
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-1 text-left text-sm font-medium dark:border-slate-800 dark:bg-slate-900">
                      {r.last_name} {r.first_name}
                    </th>
                    {cols.map((col, ci) => {
                      const key = cellKey(r.student_id, col.id);
                      const cell = cells[key];
                      const active = nav.r === ri && nav.c === ci;
                      const editing = active && nav.editing && canEdit;
                      return (
                        <td
                          key={col.id} role="gridcell" aria-colindex={ci + 2} aria-selected={active} data-cell={`${ri}-${ci}`}
                          tabIndex={active ? 0 : -1}
                          onClick={() => { if (!(active && nav.editing)) setNav({ r: ri, c: ci, editing: false }); }}
                          onDoubleClick={() => { if (canEdit) { setEditVal(cell?.score?.toString() ?? ""); setNav({ r: ri, c: ci, editing: true }); } }}
                          className={cn(
                            "h-11 min-w-16 cursor-cell border-b border-slate-100 p-0 text-center align-middle outline-none dark:border-slate-800",
                            cell?.score != null && toneCls[gradeTone(cell.score)],
                            dirty.has(key) && "ring-1 ring-inset ring-amber-400",
                            active && "z-[1] ring-2 ring-inset ring-indigo-500",
                          )}
                        >
                          {editing ? (
                            <input
                              autoFocus aria-label={`${r.last_name} ${fmtShort(col.date)}`} inputMode="decimal" value={editVal} maxLength={3}
                              onChange={(e) => setEditVal(e.target.value)} onFocus={(e) => e.currentTarget.select()}
                              onBlur={() => { if (nav.editing) { commit(ri, ci, editVal); setNav((n) => ({ ...n, editing: false })); } }}
                              className="h-full w-full bg-white text-center font-bold text-slate-900 outline-none dark:bg-slate-950 dark:text-white"
                            />
                          ) : (
                            <span className="inline-flex h-full w-full items-center justify-center font-bold tabular-nums">
                              {cell?.score ?? ""}
                              {cell?.comment ? <span className="ml-0.5 text-[9px] text-indigo-700 dark:text-indigo-300" role="img" aria-label={tt("jr_comment")}>•</span> : null}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className={cn("sticky right-0 z-10 border-b border-l border-slate-100 bg-white px-2 text-center font-bold tabular-nums dark:border-slate-800 dark:bg-slate-900", avg !== null && toneCls[gradeTone(avg)])}>{avg?.toFixed(2) ?? "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && cols.length === 0 && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{tt("jr_noColumns")}</p>}
      {canEdit && activeCol && activeRow && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-slate-500 dark:text-slate-400">{activeRow.last_name} · {fmtShort(activeCol.date)}</span>
          <input
            aria-label={tt("jr_comment")} placeholder={tt("jr_comment")} maxLength={300} disabled={!activeCell || activeCell.score === null}
            className={cn(inputCls, "min-h-11 max-w-md flex-1")} value={activeCell?.comment ?? ""}
            onChange={(e) => activeCell && setCell(activeKey, { ...activeCell, comment: e.target.value || null }, false)}
          />
          <span className="hidden text-xs text-slate-500 dark:text-slate-400 md:inline">{tt("jr_keys")}</span>
        </div>
      )}
    </div>
  );
}
