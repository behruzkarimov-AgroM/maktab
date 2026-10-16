"use client";

import { useState } from "react";
import { spatch, spost, ApiError } from "@/lib/school/client";
import type { Gender, Student } from "@/lib/school/types";
import { Button } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { Field, Input, Modal, Select, Textarea, useClasses, useErrText, useToast } from "./common";

interface FormState {
  last_name: string; first_name: string; middle_name: string; birth_date: string; gender: "" | Gender; class_id: string; student_code: string;
  phone: string; address: string; photo_url: string; enrolled_at: string; notes: string;
  g_name: string; g_phone: string; g_relation: string;
}
const empty: FormState = {
  last_name: "", first_name: "", middle_name: "", birth_date: "", gender: "", class_id: "", student_code: "", phone: "", address: "", photo_url: "", enrolled_at: "", notes: "",
  g_name: "", g_phone: "", g_relation: "mother",
};
const fromStudent = (s: Student): FormState => ({
  ...empty, last_name: s.last_name, first_name: s.first_name, middle_name: s.middle_name ?? "", birth_date: s.birth_date ?? "", gender: s.gender ?? "", class_id: s.class_id ?? "",
  student_code: s.student_code, phone: s.phone ?? "", address: s.address ?? "", photo_url: s.photo_url ?? "", enrolled_at: s.enrolled_at ?? "", notes: s.notes ?? "",
});

/** create / edit student dialog. On create, an optional first guardian is created and linked. */
export function StudentForm({ open, student, onClose, onSaved }: { open: boolean; student?: Student | null; onClose: () => void; onSaved: (s: Student) => void }) {
  if (!open) return null;
  return <StudentFormInner student={student} onClose={onClose} onSaved={onSaved} />;
}

function StudentFormInner({ student, onClose, onSaved }: { student?: Student | null; onClose: () => void; onSaved: (s: Student) => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const { classes } = useClasses();
  const [f, setF] = useState<FormState>(student ? fromStudent(student) : empty);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  const [clientErr, setClientErr] = useState<Record<string, boolean>>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const bad = (k: string) => (fields.includes(k) || clientErr[k] ? t("d_err_validation") : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ce: Record<string, boolean> = {};
    if (!f.last_name.trim()) ce.last_name = true;
    if (!f.first_name.trim()) ce.first_name = true;
    setClientErr(ce);
    if (Object.keys(ce).length) return;
    setBusy(true);
    setFields([]);
    const body: Record<string, unknown> = {
      last_name: f.last_name, first_name: f.first_name, middle_name: f.middle_name, birth_date: f.birth_date, gender: f.gender || null,
      class_id: f.class_id, phone: f.phone, address: f.address, photo_url: f.photo_url, notes: f.notes, enrolled_at: f.enrolled_at,
    };
    if (f.student_code.trim()) body.student_code = f.student_code.trim();
    try {
      const res = student
        ? await spatch<{ student: Student }>(`/students/${student.id}`, body)
        : await spost<{ student: Student }>("/students", body);
      if (!student && f.g_name.trim()) {
        try {
          await spost("/guardians", { full_name: f.g_name, phone: f.g_phone, relation: f.g_relation, student_id: res.student.id, is_primary: true });
        } catch (ge) {
          toast("err", errText(ge));
        }
      }
      toast("ok", t("d_saved"));
      onSaved(res.student);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      toast("err", errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title={student ? t("d_edit_student") : t("d_new_student")}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button variant="primary" type="submit" form="student-form" loading={busy}>{t("save")}</Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label={t("d_last_name")} required error={bad("last_name")}><Input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} autoComplete="off" /></Field>
        <Field label={t("d_first_name")} required error={bad("first_name")}><Input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} autoComplete="off" /></Field>
        <Field label={t("d_middle_name")}><Input value={f.middle_name} onChange={(e) => set("middle_name", e.target.value)} /></Field>
        <Field label={t("d_birth_date")} error={bad("birth_date")}><Input type="date" value={f.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></Field>
        <Field label={t("d_gender")}>
          <Select value={f.gender} onChange={(e) => set("gender", e.target.value as FormState["gender"])}>
            <option value="">-</option><option value="m">{t("d_male")}</option><option value="f">{t("d_female")}</option>
          </Select>
        </Field>
        <Field label={t("class")}>
          <Select value={f.class_id} onChange={(e) => set("class_id", e.target.value)}>
            <option value="">{t("d_none")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t("d_student_code")} hint={student ? undefined : t("d_code_auto")} error={bad("student_code")}><Input value={f.student_code} onChange={(e) => set("student_code", e.target.value)} placeholder="ST-2025-0001" /></Field>
        <Field label={t("d_enrolled_at")}><Input type="date" value={f.enrolled_at} onChange={(e) => set("enrolled_at", e.target.value)} /></Field>
        <Field label={t("d_phone")}><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" /></Field>
        <Field label={t("d_photo_url")} error={bad("photo_url")}><Input value={f.photo_url} onChange={(e) => set("photo_url", e.target.value)} placeholder="https://" /></Field>
        <Field label={t("d_address")} className="sm:col-span-2"><Input value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label={t("d_notes")} className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        {!student && (
          <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:col-span-2 sm:grid-cols-3">
            <legend className="px-1 text-xs font-bold text-slate-500 dark:text-slate-400">{t("d_first_guardian")}</legend>
            <Field label={t("d_full_name")}><Input value={f.g_name} onChange={(e) => set("g_name", e.target.value)} /></Field>
            <Field label={t("d_phone")}><Input value={f.g_phone} onChange={(e) => set("g_phone", e.target.value)} inputMode="tel" /></Field>
            <Field label={t("d_relation")}>
              <Select value={f.g_relation} onChange={(e) => set("g_relation", e.target.value)}>
                {["mother", "father", "guardian", "parent", "other"].map((r) => <option key={r} value={r}>{t(`d_rel_${r}` as "d_rel_mother")}</option>)}
              </Select>
            </Field>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
