"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, BellRing, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CloudOff, Loader2, RotateCcw, Save, WifiOff } from "lucide-react";
import { Badge, Button, cn, inputCls } from "@/components/school/ui/kit";
import { ATTENDANCE_LABEL } from "@/lib/school/i18n";
import { spost } from "@/lib/school/client";
import { addDays } from "@/lib/school/grading";
import {
  attendanceWindow, buildRows, cycleStatus, draftKey, isNetworkError, listPendingDrafts, normalizeRow, parseDraft, priorAbsentStreak, saveDraft, STATUS_CYCLE, STATUS_KEYS, tally,
  type AttDraft, type AttRow,
} from "@/lib/school/teacher-logic";
import type { AttendanceDay, AttendanceSheetRow, AttendanceStatus } from "@/lib/school/types";
import { EmptyState, ErrorState, Field, Gate, PageHead, PageSkeleton, readPref, selectCls, ToastHost, useApi, useBase, useToasts, writePref, fmtDate, type Base } from "./common";
import type { TClass } from "./types";
import { useTT } from "./use-tt";

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-700 text-white hover:bg-emerald-600",
  absent: "bg-red-600 text-white hover:bg-red-500",
  late: "bg-amber-500 text-slate-900 hover:bg-amber-400",
  excused: "bg-sky-600 text-white hover:bg-sky-500",
  sick: "bg-indigo-600 text-white hover:bg-indigo-500",
};
const STATUS_SOFT: Record<AttendanceStatus, string> = {
  present: "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  absent: "border-red-500 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  late: "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  excused: "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  sick: "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
};

export function AttendancePage() {
  const state = useBase();
  return <Gate state={state}>{(b) => <AttendanceInner b={b} />}</Gate>;
}

const serialize = (rows: Record<string, AttRow>) =>
  JSON.stringify(Object.keys(rows).sort().map((k) => [k, rows[k].status, rows[k].status === "late" ? rows[k].minutes_late : 0, rows[k].note.trim()]));

function AttendanceInner({ b }: { b: Base }) {
  const { tt, session, errText } = useTT();
  const params = useSearchParams();
  const classes = b.ov.classes;
  const today = b.me.today;
  const [classId, setClassId] = useState<string>(() => {
    const q = params.get("class");
    const pref = readPref("att-class");
    return [q, pref].find((x) => x && classes.some((c) => c.id === x)) ?? classes.find((c) => !c.marked_today)?.id ?? classes[0]?.id ?? "";
  });
  const [date, setDate] = useState(() => {
    const q = params.get("date");
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= today ? q : today;
  });
  const [mode, setMode] = useState<"day" | "lesson">(params.get("lesson") ? "lesson" : "day");
  const [lessonNo, setLessonNo] = useState<number>(Number(params.get("lesson")) || 1);
  const [ver, setVer] = useState(0);
  const toasts = useToasts();
  const lesson = mode === "lesson" ? lessonNo : null;
  const win = attendanceWindow(today);

  const dayPath = classId ? `/attendance?class_id=${classId}&date=${date}${lesson ? `&lesson_no=${lesson}` : ""}` : null;
  const day = useApi<{ day: AttendanceDay }>(dayPath);
  const sheet = useApi<{ sheet: { dates: string[]; students: { student_id: string; cells: (AttendanceStatus | null)[] }[] } }>(
    classId ? `/attendance/sheet?class_id=${classId}&from=${addDays(date, -40)}&to=${addDays(date, -1)}` : null,
  );

  const pick = (id: string) => {
    setClassId(id);
    writePref("att-class", id);
  };

  /* retry drafts that failed to save while offline */
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || !session) return;
    flushing.current = true;
    try {
      for (const { key, draft } of listPendingDrafts(localStorage, session.id)) {
        try {
          const records = Object.entries(draft.rows).map(([student_id, r]) => ({ student_id, ...normalizeRow(r) }));
          await spost("/attendance/bulk", { class_id: draft.class_id, date: draft.date, lesson_no: draft.lesson_no, records });
          localStorage.removeItem(key);
          toasts.push("ok", tt("att_synced", { date: fmtDate(draft.date) }));
          if (draft.class_id === classId && draft.date === date && draft.lesson_no === lesson) {
            day.reload();
            setVer((v) => v + 1);
          }
          b.reloadOverview();
        } catch (e) {
          if (isNetworkError(e)) break;
          localStorage.removeItem(key); // the server refused it for good (locked day, removed student): do not retry forever
          toasts.push("error", errText(e));
        }
      }
    } finally {
      flushing.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, classId, date, lesson]);
  useEffect(() => {
    const on = () => void flush();
    window.addEventListener("online", on);
    if (navigator.onLine) void flush();
    return () => window.removeEventListener("online", on);
  }, [flush]);

  if (!classes.length) return <EmptyState text={tt("noClasses")} />;
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  const ready = day.data && day.data.day.class_id === classId && day.data.day.date === date && (day.data.day.lesson_no ?? null) === lesson;

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <PageHead title={tt("att_title")} sub={tt("att_sub")} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={tt("class")} className="col-span-1">
          <select className={selectCls} value={classId} onChange={(e) => pick(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.marked_today ? "✓" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tt("date")} className="col-span-1">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="secondary" aria-label={tt("prevDay")} disabled={date <= win.min} onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <input type="date" className={cn(inputCls, "min-h-11 min-w-0 flex-1 px-2")} value={date} min={win.min} max={win.max} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} />
            <Button size="icon" variant="secondary" aria-label={tt("nextDay")} disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </Field>
        <Field label={tt("att_mode")} className="col-span-1">
          <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700" role="group">
            {(["day", "lesson"] as const).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={cn("min-h-11 flex-1 rounded-md px-2 text-sm font-medium", mode === m ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300")}>
                {m === "day" ? tt("att_wholeDay") : tt("att_perLesson")}
              </button>
            ))}
          </div>
        </Field>
        {mode === "lesson" && (
          <Field label={tt("lesson")} className="col-span-1">
            <select className={selectCls} value={lessonNo} onChange={(e) => setLessonNo(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {day.error && !ready ? (
        <ErrorState message={errText(day.error)} onRetry={day.reload} />
      ) : !ready ? (
        <PageSkeleton label={tt("loading")} />
      ) : (
        <Sheet
          key={`${classId}|${date}|${lesson}|${ver}`}
          cls={cls} day={day.data!.day} date={date} lesson={lesson} userId={session?.id ?? ""}
          sheet={sheet.data?.sheet ?? null} toasts={toasts} onSaved={() => b.reloadOverview()}
        />
      )}
      <ToastHost items={toasts.items} dismiss={toasts.dismiss} />
    </div>
  );
}

function Sheet({
  cls, day, date, lesson, userId, sheet, toasts, onSaved,
}: {
  cls: TClass;
  day: AttendanceDay;
  date: string;
  lesson: number | null;
  userId: string;
  sheet: { dates: string[]; students: { student_id: string; cells: (AttendanceStatus | null)[] }[] } | null;
  toasts: ReturnType<typeof useToasts>;
  onSaved: () => void;
}) {
  const { tt, t, errText } = useTT();
  const key = draftKey(userId, cls.id, date, lesson);
  const baseServer = useMemo(() => buildRows(day.rows, null).rows, [day.rows]);
  const [init] = useState(() => buildRows(day.rows, parseDraft(typeof localStorage === "undefined" ? null : localStorage.getItem(key))));
  const [rows, setRows] = useState<Record<string, AttRow>>(init.rows);
  const [baseline, setBaseline] = useState(() => serialize(baseServer));
  const [wasMarked, setWasMarked] = useState(() => day.rows.length > 0 && day.rows.every((r) => r.status !== null));
  const [restored, setRestored] = useState(init.fromDraft);
  const [saving, setSaving] = useState(false);
  const [offlinePending, setOfflinePending] = useState(() => {
    try {
      return !!parseDraft(localStorage.getItem(key))?.pending;
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const locked = day.locked_for_you;
  const dirty = serialize(rows) !== baseline;
  const needsSave = !locked && (dirty || !wasMarked);

  /* keep a draft on this device while there is something unsaved */
  useEffect(() => {
    if (locked) return;
    try {
      if (dirty || !wasMarked) {
        const d: AttDraft = { v: 1, class_id: cls.id, date, lesson_no: lesson, savedAt: Date.now(), pending: offlinePending, rows };
        if (dirty) saveDraft(localStorage, key, d);
      } else localStorage.removeItem(key);
    } catch {
      /* storage unavailable: the draft is a convenience only */
    }
  }, [rows, dirty, wasMarked, offlinePending, locked, key, cls.id, date, lesson]);

  const streaks = useMemo(() => {
    const m = new Map<string, number>();
    if (sheet) for (const s of sheet.students) m.set(s.student_id, priorAbsentStreak(sheet.dates, s.cells, date));
    return m;
  }, [sheet, date]);

  const setRow = useCallback((id: string, patch: Partial<AttRow>) => {
    setRows((r) => {
      const cur = r[id];
      if (!cur) return r;
      const next = { ...cur, ...patch };
      if (patch.status === "late" && !next.minutes_late) next.minutes_late = 5;
      return { ...r, [id]: next };
    });
  }, []);

  const allPresent = () => setRows((r) => Object.fromEntries(Object.entries(r).map(([id, x]) => [id, { ...x, status: "present" as const, minutes_late: 0 }])));
  const resetToServer = () => {
    setRows(baseServer);
    setRestored(false);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  const save = useCallback(async () => {
    if (saving || locked || !day.rows.length) return;
    setSaving(true);
    const records = Object.entries(rows).map(([student_id, r]) => ({ student_id, ...normalizeRow(r) }));
    try {
      const res = await spost<{ saved: number; newly_absent: unknown[] }>("/attendance/bulk", { class_id: cls.id, date, lesson_no: lesson, records });
      toasts.push("ok", tt("att_saved", { n: res.saved }) + (res.newly_absent.length ? ` ${tt("att_notified", { n: res.newly_absent.length })}` : ""));
      setBaseline(serialize(rows));
      setWasMarked(true);
      setRestored(false);
      setOfflinePending(false);
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      onSaved();
    } catch (e) {
      if (isNetworkError(e)) {
        saveDraft(localStorage, key, { v: 1, class_id: cls.id, date, lesson_no: lesson, savedAt: Date.now(), pending: true, rows });
        setOfflinePending(true);
        toasts.push("info", tt("att_offlineSaved"));
      } else toasts.push("error", errText(e));
    } finally {
      setSaving(false);
    }
  }, [saving, locked, day.rows.length, rows, cls.id, date, lesson, key, toasts, tt, errText, onSaved]);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = tally(rows);
  const streakWarn = day.rows.filter((r) => (streaks.get(r.student_id) ?? 0) + (rows[r.student_id]?.status === "absent" ? 1 : 0) >= 3);
  const markedAt = day.rows.map((r) => r.marked_at).filter(Boolean).sort().pop();

  const focusRow = (i: number) => listRef.current?.querySelector<HTMLElement>(`[data-row="${i}"]`)?.focus();

  return (
    <div className="pb-40 sm:pb-28">
      {locked && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {tt("att_locked")}
        </div>
      )}
      {restored && !locked && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <CloudOff className="size-4" />
          <span className="min-w-0 flex-1">{tt("att_draftRestored")}</span>
          <Button size="sm" onClick={resetToServer}>
            <RotateCcw className="size-3.5" />
            {tt("att_discardDraft")}
          </Button>
        </div>
      )}
      {offlinePending && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <WifiOff className="size-4" />
          {tt("att_waitingOnline")}
        </div>
      )}
      {streakWarn.length > 0 && (
        <div role="status" className="mb-3 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>{tt("att_streakTitle", { n: streakWarn.length })}</b>{" "}
            {streakWarn.map((r) => `${r.last_name} ${r.first_name}`).join(", ")}
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={wasMarked && !dirty ? "green" : "amber"}>
          {wasMarked && !dirty ? `${tt("att_stateSaved")}${markedAt ? ` ${new Date(markedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}` : dirty ? tt("att_stateUnsaved") : tt("att_stateNotMarked")}
        </Badge>
        <span className="text-slate-600 dark:text-slate-400">{tt("att_hint")}</span>
      </div>

      {day.rows.length === 0 ? (
        <EmptyState text={tt("att_noStudents")} />
      ) : (
        <ul ref={listRef} onFocusCapture={(e) => setTyping(e.target instanceof HTMLInputElement && e.target.type !== "checkbox")} onBlurCapture={() => setTyping(false)} className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900" aria-label={tt("att_title")}>
          {day.rows.map((s, i) => (
            <AttRowView
              key={s.student_id} idx={i} s={s} row={rows[s.student_id]} disabled={locked} expanded={open === s.student_id}
              streak={(streaks.get(s.student_id) ?? 0) + (rows[s.student_id]?.status === "absent" ? 1 : 0)}
              onToggle={() => setOpen((o) => (o === s.student_id ? null : s.student_id))}
              onChange={setRow} onFocusRow={focusRow} total={day.rows.length} label={(st) => t(ATTENDANCE_LABEL[st])}
              tt={tt}
            />
          ))}
        </ul>
      )}

      <div className={cn("fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:left-64", typing && "max-sm:hidden")}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          <div role="group" className="flex min-w-0 basis-full flex-nowrap gap-1.5 overflow-x-auto text-xs font-semibold sm:basis-0 sm:flex-1 sm:flex-wrap" aria-label={tt("att_summary")}>
            {STATUS_CYCLE.map((st) => (
              <span key={st} className={cn("shrink-0 whitespace-nowrap rounded-full border px-2 py-1", STATUS_SOFT[st], counts[st] === 0 && "opacity-40")}>
                {t(ATTENDANCE_LABEL[st])} {counts[st]}
              </span>
            ))}
          </div>
          <Button disabled={locked || !day.rows.length} onClick={allPresent} className="min-h-11">
            <CheckCheck className="size-4" />
            {tt("att_allPresent")}
          </Button>
          <Button variant="primary" className="min-h-11 min-w-28" disabled={!needsSave || !day.rows.length} loading={saving} onClick={() => void save()}>
            {!saving && <Save className="size-4" />}
            {tt("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  idx: number;
  total: number;
  s: AttendanceSheetRow;
  row: AttRow | undefined;
  disabled: boolean;
  expanded: boolean;
  streak: number;
  onToggle: () => void;
  onChange: (id: string, patch: Partial<AttRow>) => void;
  onFocusRow: (i: number) => void;
  label: (s: AttendanceStatus) => string;
  tt: ReturnType<typeof useTT>["tt"];
}

const AttRowView = memo(function AttRowView({ idx, total, s, row, disabled, expanded, streak, onToggle, onChange, onFocusRow, label, tt }: RowProps) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  if (!row) return null;
  const id = s.student_id;
  const set = (status: AttendanceStatus) => onChange(id, { status });
  return (
    <li
      data-row={idx}
      tabIndex={0}
      aria-label={`${s.last_name} ${s.first_name}: ${label(row.status)}`}
      className={cn("touch-pan-y outline-none focus-visible:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:focus-visible:bg-indigo-950/30", row.status !== "present" && "bg-slate-50/70 dark:bg-slate-800/30")}
      onTouchStart={(e) => {
        const p = e.touches[0];
        touch.current = { x: p.clientX, y: p.clientY };
      }}
      onTouchEnd={(e) => {
        if (disabled || !touch.current) return;
        const p = e.changedTouches[0];
        const dx = p.clientX - touch.current.x;
        const dy = p.clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 35) set(dx > 0 ? "present" : "absent");
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "ArrowDown") { e.preventDefault(); onFocusRow(Math.min(idx + 1, total - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); onFocusRow(Math.max(idx - 1, 0)); }
        else if (disabled) return;
        else if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(id, { status: cycleStatus(row.status, e.shiftKey ? -1 : 1) }); }
        else if (STATUS_KEYS[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); set(STATUS_KEYS[e.key.toLowerCase()]); }
        else if (e.key.toLowerCase() === "n") { e.preventDefault(); onToggle(); }
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400">{idx + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {s.last_name} {s.first_name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {streak >= 3 && <Badge tone="red">{tt("att_streakBadge", { n: streak })}</Badge>}
            {row.status === "late" && row.minutes_late > 0 && <span className="text-xs text-amber-700 dark:text-amber-300">+{row.minutes_late} {tt("min")}</span>}
            {row.note && <span className="max-w-40 truncate text-xs text-slate-600 dark:text-slate-400">“{row.note}”</span>}
          </div>
        </div>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => onChange(id, { status: cycleStatus(row.status) })}
          aria-label={`${s.last_name} ${s.first_name}: ${label(row.status)}`}
          className={cn("min-h-11 min-w-28 rounded-xl px-3 text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-60", STATUS_STYLE[row.status])}
        >
          {label(row.status)}
        </button>
        <button type="button" tabIndex={-1} aria-expanded={expanded} aria-label={tt("att_details")} onClick={onToggle} className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <ChevronDown className={cn("size-5 transition", expanded && "rotate-180")} />
        </button>
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={tt("att_status")}>
            {STATUS_CYCLE.map((st) => (
              <button key={st} type="button" disabled={disabled} aria-pressed={row.status === st} onClick={() => set(st)} className={cn("min-h-11 rounded-lg border px-3 text-sm font-semibold", row.status === st ? STATUS_SOFT[st] : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300")}>
                {label(st)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {row.status === "late" && (
              <Field label={tt("att_minutes")} className="w-28">
                <input type="number" inputMode="numeric" min={0} max={240} disabled={disabled} className={cn(inputCls, "min-h-11")} value={row.minutes_late} onChange={(e) => onChange(id, { minutes_late: Number(e.target.value) || 0 })} />
              </Field>
            )}
            <Field label={tt("att_note")} className="min-w-48 flex-1">
              <input type="text" maxLength={200} disabled={disabled} className={cn(inputCls, "min-h-11")} value={row.note} placeholder={tt("att_notePh")} onChange={(e) => onChange(id, { note: e.target.value })} />
            </Field>
          </div>
          {row.status === "absent" && (
            <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <BellRing className="size-3.5" />
              {tt("att_parentNote")}
            </p>
          )}
        </div>
      )}
    </li>
  );
});

/* tiny helper kept for the dashboard: status of a class today */
export function loaderIcon() {
  return <Loader2 className="size-4 animate-spin" />;
}
