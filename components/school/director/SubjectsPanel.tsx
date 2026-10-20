"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { sdelete, spatch, spost } from "@/lib/school/client";
import type { Subject } from "@/lib/school/types";
import { Button } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { Async, ConfirmDialog, DirPage, Field, Input, Modal, TableWrap, tableCls, tdCls, thCls, useErrText, useSubjects, useToast } from "./common";

function SubjectForm({ subject, onClose, onSaved }: { subject: Subject | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const [f, setF] = useState({ uz: subject?.name.uz ?? "", ru: subject?.name.ru ?? "", en: subject?.name.en ?? "", short: subject?.short ?? "", sort_order: subject?.sort_order ?? 0 });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const missing = (v: string) => (tried && !v.trim() ? t("d_err_validation") : null);
  async function save() {
    setTried(true);
    if (!f.uz.trim() || !f.ru.trim() || !f.en.trim()) return;
    setBusy(true);
    try {
      const body = { name: { uz: f.uz, ru: f.ru, en: f.en }, short: f.short, sort_order: f.sort_order };
      if (subject) await spatch(`/subjects/${subject.id}`, body);
      else await spost("/subjects", body);
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
    <Modal open onClose={onClose} size="sm" title={subject ? t("edit") : t("d_new_subject")} footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("save")}</Button></>}>
      <div className="space-y-3">
        <Field label="O'zbekcha" required error={missing(f.uz)}><Input value={f.uz} onChange={(e) => setF({ ...f, uz: e.target.value })} /></Field>
        <Field label="Русский" required error={missing(f.ru)}><Input value={f.ru} onChange={(e) => setF({ ...f, ru: e.target.value })} /></Field>
        <Field label="English" required error={missing(f.en)}><Input value={f.en} onChange={(e) => setF({ ...f, en: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("d_short")}><Input maxLength={12} value={f.short} onChange={(e) => setF({ ...f, short: e.target.value })} /></Field>
          <Field label={t("d_sort")}><Input type="number" min={0} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) || 0 })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

export function SubjectsPanel() {
  const { t, L } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const res = useSubjects();
  const [form, setForm] = useState<Subject | null | "new">(null);
  const [del, setDel] = useState<Subject | null>(null);
  return (
    <DirPage title={t("navSubjects")} actions={<Button variant="primary" onClick={() => setForm("new")}><Plus className="size-4" /> {t("d_new_subject")}</Button>}>
      <Async state={res} empty={!!res.data && res.subjects.length === 0}>
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>{t("d_sort")}</th><th className={thCls}>{t("d_name")}</th><th className={thCls}>{t("d_short")}</th><th className={`${thCls} hidden md:table-cell`}>UZ / RU / EN</th><th className={`${thCls} relative`}><span className="sr-only">{t("d_actions")}</span></th></tr></thead>
            <tbody>
              {res.subjects.map((s) => (
                <tr key={s.id}>
                  <td className={tdCls}>{s.sort_order}</td><td className={`${tdCls} font-semibold`}>{L(s.name)}</td><td className={tdCls}>{s.short}</td>
                  <td className={`${tdCls} hidden text-xs text-slate-500 dark:text-slate-400 md:table-cell`}>{s.name.uz} / {s.name.ru} / {s.name.en}</td>
                  <td className={`${tdCls} text-right`}>
                    <Button size="icon" variant="ghost" aria-label={t("edit")} onClick={() => setForm(s)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={t("delete")} onClick={() => setDel(s)}><Trash2 className="size-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Async>
      {form && <SubjectForm subject={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={res.reload} />}
      <ConfirmDialog
        open={!!del} danger title={t("delete")} text={<>{del && L(del.name)}<br />{t("d_delete_subject_hint")}</>} onClose={() => setDel(null)}
        onConfirm={async () => {
          try { await sdelete(`/subjects/${del!.id}`); toast("ok", t("d_deleted")); res.reload(); } catch (e) { toast("err", errText(e)); }
          setDel(null);
        }}
      />
    </DirPage>
  );
}
