"use client";

import { useMemo, useState } from "react";
import { Plus, Printer, Trash2, TriangleAlert } from "lucide-react";
import { ApiError, sdelete, spatch, spost } from "@/lib/school/client";
import { detectSlotConflicts, findTimetableConflicts, type SlotConflict } from "@/lib/school/director-logic";
import type { ScheduleSlot, TeachingAssignment } from "@/lib/school/types";
import { Badge, Button, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, ConfirmDialog, DirPage, Field, FilterSelect, Input, Modal, Select, escapeHtml, printHtml, useApi, useClasses, useErrText, useSubjectName, useSubjects, useToast,
} from "./common";
import type { TeacherRow } from "./TeachersPanel";

type Slot = ScheduleSlot & { class_name: string | null };
const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
const LESSONS = [1, 2, 3, 4, 5, 6, 7, 8];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** default bell schedule: 08:00 start, 45 min lessons, 10 min breaks */
export const defaultTimes = (no: number) => ({ start: hhmm(8 * 60 + (no - 1) * 55), end: hhmm(8 * 60 + (no - 1) * 55 + 45) });
const trim5 = (s: string) => s.slice(0, 5);

export function ScheduleBuilder() {
  const { t } = useSchool();
  const sn = useSubjectName();
  const { classes } = useClasses();
  const { subjects } = useSubjects();
  const teachers = useApi<{ teachers: TeacherRow[] }>("/teachers");
  const sched = useApi<{ slots: Slot[] }>("/schedule");
  const [mode, setMode] = useState<"class" | "teacher">("class");
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [edit, setEdit] = useState<{ slot: Slot | null; weekday: number; lesson_no: number } | null>(null);

  const slots = useMemo(() => sched.data?.slots ?? [], [sched.data]);
  const curClass = classId || classes[0]?.id || "";
  const curTeacher = teacherId || teachers.data?.teachers[0]?.id || "";
  const clashes = useMemo(() => findTimetableConflicts(slots), [slots]);
  const clashIds = useMemo(() => new Set(clashes.flatMap((c) => [c.slot.id, c.with.id])), [clashes]);
  const visible = slots.filter((s) => (mode === "class" ? s.class_id === curClass : s.teacher_id === curTeacher));
  const cell = (wd: number, no: number) => visible.filter((s) => s.weekday === wd && s.lesson_no === no);
  const maxNo = Math.max(6, ...visible.map((s) => s.lesson_no));
  const title = mode === "class" ? classes.find((c) => c.id === curClass)?.name : teachers.data?.teachers.find((x) => x.id === curTeacher)?.full_name;

  function print() {
    const head = `<tr><th></th>${WEEKDAYS.map((d) => `<th>${escapeHtml(t(`d_wd${d}` as "d_wd1"))}</th>`).join("")}</tr>`;
    const body = LESSONS.filter((n) => n <= maxNo).map((n) => `<tr><th class="c">${n}<br><span class="muted">${trim5(defaultTimes(n).start)}</span></th>${WEEKDAYS.map((d) => `<td>${cell(d, n).map((s) => `<b>${escapeHtml(sn(subjects.find((x) => x.id === s.subject_id)))}</b><br><span class="muted">${escapeHtml(mode === "class" ? teachers.data?.teachers.find((x) => x.id === s.teacher_id)?.full_name ?? "" : s.class_name)} ${escapeHtml(s.room ?? "")}</span>`).join("<hr>")}</td>`).join("")}</tr>`).join("");
    printHtml(`${t("navSchedule")} ${title ?? ""}`, `<div class="hdr"><div><h1>${escapeHtml(t("navSchedule"))}: ${escapeHtml(title)}</h1></div></div><table>${head}${body}</table>`, true);
  }

  return (
    <DirPage
      title={t("navSchedule")}
      actions={<Button onClick={print}><Printer className="size-4" /> {t("d_print")}</Button>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("d_view_mode")} className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
          {(["class", "teacher"] as const).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium max-sm:min-h-11", mode === m ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300")}>
              {m === "class" ? t("d_by_class") : t("d_by_teacher")}
            </button>
          ))}
        </div>
        {mode === "class" ? (
          <FilterSelect label={t("class")} value={curClass} onChange={setClassId}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</FilterSelect>
        ) : (
          <FilterSelect label={t("d_teacher")} value={curTeacher} onChange={setTeacherId} className="min-w-56">{teachers.data?.teachers.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</FilterSelect>
        )}
        {clashes.length > 0 && <Badge tone="red"><TriangleAlert className="mr-1 size-3" />{clashes.length} {t("d_conflicts")}</Badge>}
      </div>

      <Async state={sched} rows={8}>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-14 border-b border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-800/50">#</th>
                {WEEKDAYS.map((d) => <th key={d} className="border-b border-l border-slate-200 bg-slate-50 p-2 text-xs font-semibold uppercase dark:border-slate-800 dark:bg-slate-800/50">{t(`d_wd${d}` as "d_wd1")}</th>)}
              </tr>
            </thead>
            <tbody>
              {LESSONS.filter((n) => n <= maxNo + 1).map((n) => (
                <tr key={n}>
                  <th className="border-b border-slate-200 bg-slate-50 p-1 text-center text-xs font-semibold dark:border-slate-800 dark:bg-slate-800/50">{n}<br /><span className="font-normal text-slate-500 dark:text-slate-400">{defaultTimes(n).start}</span></th>
                  {WEEKDAYS.map((d) => {
                    const items = cell(d, n);
                    return (
                      <td key={d} className="h-16 border-b border-l border-slate-200 p-1 align-top dark:border-slate-800">
                        {items.map((s) => (
                          <button
                            key={s.id} onClick={() => setEdit({ slot: s, weekday: d, lesson_no: n })}
                            className={cn("mb-1 w-full rounded-lg px-2 py-1 text-left text-xs max-sm:min-h-11 transition hover:ring-2 hover:ring-indigo-400", clashIds.has(s.id) ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100" : "bg-indigo-50 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-100")}
                          >
                            <b className="block truncate">{sn(subjects.find((x) => x.id === s.subject_id))}</b>
                            <span className="block truncate opacity-75">{mode === "class" ? teachers.data?.teachers.find((x) => x.id === s.teacher_id)?.full_name ?? "-" : s.class_name} {s.room ? `· ${s.room}` : ""}</span>
                          </button>
                        ))}
                        {items.length === 0 && (
                          <button aria-label={`${t("add")} ${t(`d_wd${d}` as "d_wd1")} ${n}`} onClick={() => setEdit({ slot: null, weekday: d, lesson_no: n })} className="flex h-full min-h-12 w-full items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-700 dark:hover:bg-slate-800">
                            <Plus className="size-4" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Async>
      {edit && (
        <SlotDialog
          key={`${edit.slot?.id ?? "new"}${edit.weekday}${edit.lesson_no}`}
          init={edit} all={slots} classId={mode === "class" ? curClass : ""} teacherId={mode === "teacher" ? curTeacher : ""}
          teachers={teachers.data?.teachers ?? []} onClose={() => setEdit(null)} onSaved={sched.reload}
        />
      )}
    </DirPage>
  );
}

function SlotDialog({ init, all, classId, teacherId, teachers, onClose, onSaved }: {
  init: { slot: Slot | null; weekday: number; lesson_no: number }; all: Slot[]; classId: string; teacherId: string; teachers: TeacherRow[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const sn = useSubjectName();
  const { classes } = useClasses();
  const { subjects } = useSubjects();
  const asg = useApi<{ assignments: TeachingAssignment[] }>("/assignments");
  const s = init.slot;
  const [f, setF] = useState({
    class_id: s?.class_id ?? classId, subject_id: s?.subject_id ?? "", teacher_id: s?.teacher_id ?? teacherId, weekday: init.weekday as number, lesson_no: init.lesson_no,
    start: trim5(s?.start_time ?? defaultTimes(init.lesson_no).start), end: trim5(s?.end_time ?? defaultTimes(init.lesson_no).end), room: s?.room ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const conflicts: SlotConflict[] = useMemo(
    () => (f.class_id ? detectSlotConflicts(all, { id: s?.id, class_id: f.class_id, teacher_id: f.teacher_id || null, weekday: f.weekday, lesson_no: f.lesson_no, room: f.room }) : []),
    [all, f, s?.id],
  );
  const msg = (c: SlotConflict) => {
    const w = c.with as Slot;
    return t(`d_conflict_${c.kind}` as "d_conflict_class").replace("{who}", teachers.find((x) => x.id === w.teacher_id)?.full_name ?? "").replace("{class}", w.class_name ?? "");
  };
  const classAsg = (asg.data?.assignments ?? []).filter((a) => a.class_id === f.class_id);

  function pickSubject(subject_id: string) {
    const a = classAsg.find((x) => x.subject_id === subject_id);
    setF((p) => ({ ...p, subject_id, teacher_id: a && !p.teacher_id ? a.teacher_id : p.teacher_id }));
  }
  async function save() {
    setBusy(true);
    setSaveErr(null);
    const body = { class_id: f.class_id, subject_id: f.subject_id, teacher_id: f.teacher_id || null, weekday: f.weekday, lesson_no: f.lesson_no, start_time: f.start, end_time: f.end, room: f.room };
    try {
      if (s) await spatch(`/schedule/${s.id}`, body);
      else await spost("/schedule", body);
      toast("ok", t("d_saved"));
      onSaved();
      onClose();
    } catch (e) {
      // 409 conflict = class cell / teacher taken, 409 room_busy = room taken by another class (server rules, DB indexes)
      const text = e instanceof ApiError && e.code === "conflict" ? t("a_err_conflict_schedule") : errText(e);
      setSaveErr(text);
      toast("err", text);
    } finally {
      setBusy(false);
    }
  }
  const valid = f.class_id && f.subject_id && f.end > f.start && conflicts.length === 0;
  return (
    <Modal
      open onClose={onClose} size="md" title={`${s ? t("edit") : t("add")} · ${t(`d_wd${f.weekday}` as "d_wd1")}, ${f.lesson_no}`}
      footer={
        <>
          {s && <Button variant="danger" className="mr-auto" onClick={() => setDel(true)}><Trash2 className="size-4" /> {t("delete")}</Button>}
          <Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={save}>{t("save")}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("class")} required><Select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}><option value="">-</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label={t("subject")} required>
          <Select value={f.subject_id} onChange={(e) => pickSubject(e.target.value)}>
            <option value="">-</option>
            {(classAsg.length ? classAsg.map((a) => subjects.find((x) => x.id === a.subject_id)!).filter(Boolean) : subjects).map((x) => <option key={x.id} value={x.id}>{sn(x)}</option>)}
          </Select>
        </Field>
        <Field label={t("d_teacher")} className="sm:col-span-2"><Select value={f.teacher_id} onChange={(e) => setF({ ...f, teacher_id: e.target.value })}><option value="">{t("d_none")}</option>{teachers.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</Select></Field>
        <Field label={t("d_weekday")}><Select value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d) => <option key={d} value={d}>{t(`d_wd${d}` as "d_wd1")}</option>)}</Select></Field>
        <Field label={t("d_lesson_no")}><Select value={f.lesson_no} onChange={(e) => { const n = Number(e.target.value); const tm = defaultTimes(n); setF({ ...f, lesson_no: n, start: tm.start, end: tm.end }); }}>{LESSONS.map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        <Field label={t("d_start")}><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label={t("d_end")} error={f.end <= f.start ? t("d_err_time") : null}><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <Field label={t("d_room")} className="sm:col-span-2"><Input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
      </div>
      {saveErr && <p role="alert" data-testid="schedule-save-error" className="mt-3 flex gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{saveErr}</p>}
      {conflicts.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {conflicts.map((c, i) => <li key={i} className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{msg(c)}</li>)}
        </ul>
      )}
      <ConfirmDialog
        open={del} danger title={t("delete")} onClose={() => setDel(false)}
        onConfirm={async () => {
          try { await sdelete(`/schedule/${s!.id}`); toast("ok", t("d_deleted")); onSaved(); onClose(); } catch (e) { toast("err", errText(e)); }
          setDel(false);
        }}
      />
    </Modal>
  );
}
