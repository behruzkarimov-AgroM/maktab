"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Pencil, Plus, Trash2, Users } from "lucide-react";
import { sdelete, spatch, spost } from "@/lib/school/client";
import type { RolloverItem } from "@/lib/school/director-logic";
import type { SchoolYear, StudentListItem } from "@/lib/school/types";
import { Badge, Button } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, ConfirmDialog, DirPage, EmptyState, Field, Input, Modal, SectionCard, Select, TableWrap, studentName, tableCls, tdCls, thCls,
  useApi, useClasses, useErrText, useToast, type ClassRow,
} from "./common";
import type { TeacherRow } from "./TeachersPanel";

function ClassForm({ cls, onClose, onSaved }: { cls: ClassRow | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const teachers = useApi<{ teachers: TeacherRow[] }>("/teachers");
  const [f, setF] = useState({ grade: cls?.grade ?? 1, letter: cls?.letter ?? "A", homeroom_teacher_id: cls?.homeroom_teacher_id ?? "", room: cls?.room ?? "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = { ...f, homeroom_teacher_id: f.homeroom_teacher_id || null };
      if (cls) await spatch(`/classes/${cls.id}`, body);
      else await spost("/classes", body);
      toast("ok", t("d_saved"));
      onSaved();
      onClose();
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} size="sm" title={cls ? t("d_edit_class") : t("d_new_class")} footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={!f.letter.trim()} onClick={save}>{t("save")}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("d_grade")}><Input type="number" min={1} max={11} value={f.grade} onChange={(e) => setF({ ...f, grade: Math.min(11, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
        <Field label={t("d_letter")}><Input maxLength={3} value={f.letter} onChange={(e) => setF({ ...f, letter: e.target.value.toUpperCase() })} /></Field>
        <Field label={t("d_homeroom")} className="col-span-2">
          <Select value={f.homeroom_teacher_id} onChange={(e) => setF({ ...f, homeroom_teacher_id: e.target.value })}>
            <option value="">{t("d_none")}</option>
            {(teachers.data?.teachers ?? []).filter((x) => x.status === "active").map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
          </Select>
        </Field>
        <Field label={t("d_room")} className="col-span-2"><Input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function Roster({ cls, classes, onClose, onChanged }: { cls: ClassRow; classes: ClassRow[]; onClose: () => void; onChanged: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const res = useApi<{ students: StudentListItem[] }>(`/students?class_id=${cls.id}&status=active&limit=200`);
  async function move(id: string, to: string) {
    const prev = res.data;
    res.setData((d) => ({ ...d, students: d.students.filter((s) => s.id !== id) })); // optimistic
    try {
      await spatch(`/students/${id}`, { class_id: to || null });
      toast("ok", t("d_saved"));
      onChanged();
    } catch (e) {
      if (prev) res.setData(() => prev);
      toast("err", errText(e));
    }
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`${t("d_roster")}: ${cls.name}`}>
      <Async state={res} rows={5} empty={!!res.data && res.data.students.length === 0}>
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>#</th><th className={thCls}>{t("d_full_name")}</th><th className={thCls}>{t("d_move_to")}</th></tr></thead>
            <tbody>
              {res.data?.students.map((s, i) => (
                <tr key={s.id}>
                  <td className={tdCls}>{i + 1}</td>
                  <td className={tdCls}><Link className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center hover:underline" href={`/school/director/students/${s.id}`}>{studentName(s)}</Link></td>
                  <td className={tdCls}>
                    <select aria-label={`${t("d_move_to")} ${studentName(s)}`} value="" onChange={(e) => e.target.value && move(s.id, e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm max-sm:min-h-11 dark:border-slate-700 dark:bg-slate-900">
                      <option value="">{t("d_move_to")}…</option>
                      {classes.filter((c) => c.id !== cls.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Async>
    </Modal>
  );
}

function Rollover() {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const yt = useApi<{ years: SchoolYear[]; current_year_id: string }>("/years-terms");
  const [target, setTarget] = useState("");
  const [plan, setPlan] = useState<RolloverItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const targets = (yt.data?.years ?? []).filter((y) => y.id !== yt.data?.current_year_id);
  async function preview() {
    setBusy(true);
    try {
      setPlan((await spost<{ plan: RolloverItem[] }>("/director/rollover", { target_year_id: target, commit: false })).plan);
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard title={t("d_rollover")}>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t("d_rollover_hint")}</p>
      {targets.length === 0 ? <p className="text-sm text-amber-600">{t("d_rollover_no_year")}</p> : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("d_target_year")}><Select value={target} onChange={(e) => { setTarget(e.target.value); setPlan(null); }}><option value="">-</option>{targets.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
          <Button disabled={!target} loading={busy} onClick={preview}>{t("d_preview")}</Button>
        </div>
      )}
      {plan && (
        <div className="mt-4 space-y-3">
          <TableWrap>
            <table className={tableCls}>
              <thead><tr><th className={thCls}>{t("class")}</th><th className={thCls}>{t("d_action")}</th><th className={thCls}>{t("d_students_count")}</th></tr></thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.from_class_id}>
                    <td className={tdCls}>{p.from_name}</td>
                    <td className={tdCls}>{p.action === "graduate" ? <Badge tone="navy">{t("d_st_graduated")}</Badge> : <>{"→ "}<b>{p.to_name}</b> {!p.to_class_id && <Badge tone="amber">{t("d_will_create")}</Badge>}</>}</td>
                    <td className={tdCls}>{p.student_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Button variant="primary" onClick={() => setConfirm(true)}>{t("d_rollover_commit")}</Button>
        </div>
      )}
      <ConfirmDialog
        open={confirm} title={t("d_rollover_commit")} text={t("d_rollover_confirm")} onClose={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            const r = await spost<{ moved: number; graduated: number }>("/director/rollover", { target_year_id: target, commit: true });
            toast("ok", `${t("d_saved")}: ${r.moved} → / ${r.graduated} ${t("d_st_graduated")}`);
            setPlan(null);
          } catch (e) {
            toast("err", errText(e));
          }
          setConfirm(false);
        }}
      />
    </SectionCard>
  );
}

export function ClassesPanel() {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const cl = useClasses();
  const [form, setForm] = useState<ClassRow | null | "new">(null);
  const [roster, setRoster] = useState<ClassRow | null>(null);
  const [del, setDel] = useState<ClassRow | null>(null);
  return (
    <DirPage title={t("navClasses")} subtitle={cl.data ? String(cl.classes.length) : undefined} actions={<Button variant="primary" onClick={() => setForm("new")}><Plus className="size-4" /> {t("d_new_class")}</Button>}>
      <Async state={cl} empty={!!cl.data && cl.classes.length === 0}>
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>{t("class")}</th><th className={thCls}>{t("d_homeroom")}</th><th className={thCls}>{t("d_room")}</th><th className={thCls}>{t("d_students_count")}</th><th className={thCls}><span className="sr-only">{t("d_actions")}</span></th></tr></thead>
            <tbody>
              {cl.classes.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className={`${tdCls} font-bold`}>{c.name}</td>
                  <td className={tdCls}>{c.homeroom_teacher_name ?? "-"}</td>
                  <td className={tdCls}>{c.room ?? "-"}</td>
                  <td className={tdCls}>{c.student_count ?? 0}</td>
                  <td className={`${tdCls} whitespace-nowrap text-right`}>
                    <Button size="sm" onClick={() => setRoster(c)}><Users className="size-3.5" /> {t("d_roster")}</Button>
                    <Button size="icon" variant="ghost" aria-label={t("edit")} onClick={() => setForm(c)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={t("delete")} onClick={() => setDel(c)}><Trash2 className="size-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {cl.classes.length === 0 && <EmptyState icon={<ArrowRightLeft className="size-8 opacity-60" />} />}
      </Async>
      <Rollover />
      {form && <ClassForm cls={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={cl.reload} />}
      {roster && <Roster cls={roster} classes={cl.classes} onClose={() => setRoster(null)} onChanged={cl.reload} />}
      <ConfirmDialog
        open={!!del} danger title={t("delete")} text={<>{del?.name}<br />{t("d_delete_class_hint")}</>} onClose={() => setDel(null)}
        onConfirm={async () => {
          try { await sdelete(`/classes/${del!.id}`); toast("ok", t("d_deleted")); cl.reload(); } catch (e) { toast("err", errText(e)); }
          setDel(null);
        }}
      />
    </DirPage>
  );
}
