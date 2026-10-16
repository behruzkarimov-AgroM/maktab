"use client";

import { useState } from "react";
import { spost } from "@/lib/school/client";
import type { Guardian, StudentDetail } from "@/lib/school/types";
import { Button, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { Field, Input, Modal, Select, useApi, useDebounced, useErrText, useToast, studentName } from "./common";
import { TempPasswordBox } from "./TempPassword";

interface InviteResult {
  invite: { guardian: Guardian; account: { email: string; temp_password: string | null; demo: boolean; must_change_password?: boolean } | null; linked: number };
}
interface StudentHit { id: string; last_name: string; first_name: string; class_name: string | null }

/** Invite / create a parent account (POST /guardians/invite): creates or reuses the guardian, links the children, shows the temporary password once. */
export function InviteGuardianDialog({ student, guardian, open, onClose, onDone }: { student: StudentDetail; guardian?: Guardian | null; open: boolean; onClose: () => void; onDone: () => void }) {
  if (!open) return null;
  return <Inner key={guardian?.id ?? "new"} student={student} guardian={guardian ?? null} onClose={onClose} onDone={onDone} />;
}

function Inner({ student, guardian, onClose, onDone }: { student: StudentDetail; guardian: Guardian | null; onClose: () => void; onDone: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const [f, setF] = useState<{ full_name: string; relation: string; phone: string; email: string }>({ full_name: guardian?.full_name ?? "", relation: guardian?.relation ?? "mother", phone: guardian?.phone ?? "", email: guardian?.email ?? "" });
  const [children, setChildren] = useState<StudentHit[]>([{ id: student.id, last_name: student.last_name, first_name: student.first_name, class_name: student.class_name ?? null }]);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const hits = useApi<{ students: StudentHit[] }>(dq.length >= 2 ? `/students?q=${encodeURIComponent(dq)}&limit=6` : null);
  const [isPrimary, setIsPrimary] = useState(student.guardians.length === 0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult["invite"] | null>(null);
  const valid = (guardian ? true : f.full_name.trim().length >= 2) && f.email.includes("@") && children.length >= 1;

  async function submit() {
    setBusy(true);
    try {
      const body = {
        ...(guardian ? { guardian_id: guardian.id } : { full_name: f.full_name.trim(), relation: f.relation, phone: f.phone || undefined }),
        email: f.email.trim(), student_ids: children.map((c) => c.id), is_primary: isPrimary,
      };
      const r = await spost<InviteResult>("/guardians/invite", body);
      setResult(r.invite);
      onDone();
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} size="md" title={t("a_inv_title")}
      footer={result ? <Button variant="primary" className="min-h-11" onClick={onClose}>{t("close")}</Button> : <><Button className="min-h-11" onClick={onClose}>{t("cancel")}</Button><Button variant="primary" className="min-h-11" loading={busy} disabled={!valid} onClick={() => void submit()}>{t("a_inv_submit")}</Button></>}
    >
      {result ? (
        <div className="space-y-3">
          <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t("a_inv_done")}: {result.guardian.full_name}</p>
          {result.account ? (
            <TempPasswordBox email={result.account.email} password={result.account.temp_password} demo={result.account.demo} name={result.guardian.full_name} />
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("a_inv_linked_only")}</p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {!guardian && (
            <>
              <Field label={t("a_inv_name")} required className="sm:col-span-2"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoComplete="off" /></Field>
              <Field label={t("a_inv_relation")}>
                <Select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
                  {["mother", "father", "guardian", "parent", "other"].map((r) => <option key={r} value={r}>{t(`a_rel_${r}` as "a_rel_mother")}</option>)}
                </Select>
              </Field>
              <Field label={t("a_inv_phone")}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" /></Field>
            </>
          )}
          <Field label={t("a_inv_email")} required className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" /></Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("a_inv_children")}</legend>
            <ul className="mb-2 flex flex-wrap gap-2">
              {children.map((c) => (
                <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-100 py-1 pl-3 pr-1 text-xs font-medium text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-100">
                  {studentName(c)}{c.class_name ? ` (${c.class_name})` : ""}
                  {c.id !== student.id && <button type="button" aria-label={`${t("delete")}: ${studentName(c)}`} onClick={() => setChildren(children.filter((x) => x.id !== c.id))} className="grid size-7 place-items-center rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800">×</button>}
                </li>
              ))}
            </ul>
            <Input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
            {hits.data && hits.data.students.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                {hits.data.students.filter((h) => !children.some((c) => c.id === h.id)).map((h) => (
                  <li key={h.id}>
                    <button type="button" disabled={children.length >= 10} onClick={() => { setChildren([...children, h]); setQ(""); }} className={cn("flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800")}>
                      {studentName(h)}<span className="text-xs text-slate-600 dark:text-slate-400">{h.class_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-5 accent-indigo-600" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />{t("a_inv_primary")}</label>
        </div>
      )}
    </Modal>
  );
}
