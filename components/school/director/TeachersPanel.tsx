"use client";

import { useState } from "react";
import { KeyRound, Pencil, Plus, Trash2, UserX } from "lucide-react";
import { sdelete, spatch, spost } from "@/lib/school/client";
import type { Teacher, TeachingAssignment } from "@/lib/school/types";
import { Badge, Button, cn } from "@/components/school/ui/kit";
import { TempPasswordBox, TempPasswordModal } from "./TempPassword";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, ConfirmDialog, DirPage, EmptyState, Field, FilterSelect, Input, Modal, Select, TableWrap, Tabs, fmtDate, tableCls, tdCls, thCls,
  useApi, useClasses, useDebounced, useErrText, useSubjectName, useSubjects, useToast,
} from "./common";

export type TeacherRow = Teacher & { classes: string[]; homeroom_of: string[]; hours_per_week: number };
const MAX_HOURS = 24;

/* ---------- account provisioning dialog (also used for guardians) ---------- */
export function AccountDialog({ target, onClose, onDone }: { target: { kind: "teacher" | "guardian" | "student"; id: string; name: string; email?: string | null } | null; onClose: () => void; onDone: () => void }) {
  if (!target) return null;
  return <AccountDialogInner key={target.id} target={target} onClose={onClose} onDone={onDone} />;
}
function AccountDialogInner({ target, onClose, onDone }: { target: NonNullable<Parameters<typeof AccountDialog>[0]["target"]>; onClose: () => void; onDone: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const [email, setEmail] = useState(target.email ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ email: string; temp_password: string | null; demo: boolean } | null>(null);
  async function create() {
    setBusy(true);
    try {
      const r = await spost<{ account: { email: string; temp_password: string | null; demo: boolean } }>("/accounts", { kind: target.kind, id: target.id, email });
      setResult(r.account);
      onDone();
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open onClose={onClose} size="sm" title={`${t("d_create_login")}: ${target.name}`}
      footer={result ? <Button variant="primary" onClick={onClose}>{t("close")}</Button> : <><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={!email.includes("@")} onClick={create}>{t("d_create_login")}</Button></>}
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="text-emerald-600 dark:text-emerald-400">{t("d_login_created")}</p>
          <TempPasswordBox email={result.email} password={result.temp_password} demo={result.demo} name={target.name} />
        </div>
      ) : (
        <Field label={t("email")} required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      )}
    </Modal>
  );
}

/* ---------- teacher form ---------- */
function TeacherForm({ teacher, onClose, onSaved }: { teacher: TeacherRow | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const sn = useSubjectName();
  const { subjects } = useSubjects();
  const [f, setF] = useState({
    full_name: teacher?.full_name ?? "", phone: teacher?.phone ?? "", email: teacher?.email ?? "", hired_at: teacher?.hired_at ?? "",
    status: teacher?.status ?? "active", subjects: teacher?.subjects ?? ([] as string[]),
  });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  async function save() {
    setTried(true);
    if (f.full_name.trim().length < 2) return;
    setBusy(true);
    try {
      if (teacher) await spatch(`/teachers/${teacher.id}`, f);
      else await spost("/teachers", f);
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
    <Modal open onClose={onClose} size="lg" title={teacher ? t("d_edit_teacher") : t("d_new_teacher")} footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("save")}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("d_full_name")} required error={tried && f.full_name.trim().length < 2 ? t("d_err_validation") : null} className="sm:col-span-2"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label={t("d_phone")}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label={t("email")}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={t("d_hired_at")}><Input type="date" value={f.hired_at} onChange={(e) => setF({ ...f, hired_at: e.target.value })} /></Field>
        <Field label={t("d_status")}>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "active" | "inactive" })}>
            <option value="active">{t("d_active")}</option><option value="inactive">{t("d_inactive")}</option>
          </Select>
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("navSubjects")}</legend>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const on = f.subjects.includes(s.id);
              return (
                <label key={s.id} className={cn("inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium max-sm:min-h-11", on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 dark:border-slate-700")}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setF({ ...f, subjects: on ? f.subjects.filter((x) => x !== s.id) : [...f.subjects, s.id] })} />
                  {sn(s)}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

/* ---------- teacher detail: assignments + account ---------- */
function TeacherDetail({ teacher, onClose, onChanged }: { teacher: TeacherRow; onClose: () => void; onChanged: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const sn = useSubjectName();
  const { classes } = useClasses();
  const { subjects } = useSubjects();
  const [tab, setTab] = useState<"assign" | "account">("assign");
  const asg = useApi<{ assignments: TeachingAssignment[] }>(`/assignments?teacher_id=${teacher.id}`);
  const [add, setAdd] = useState({ class_id: "", subject_id: "", hours: 2 });
  const [acct, setAcct] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "deactivate" | "activate" | null>(null);
  const [newPw, setNewPw] = useState<{ password: string | null; demo: boolean } | null>(null);
  const hours = (asg.data?.assignments ?? []).reduce((n, a) => n + a.hours_per_week, 0);

  async function addAssignment() {
    try {
      await spost("/assignments", { class_id: add.class_id, subject_id: add.subject_id, teacher_id: teacher.id, hours_per_week: add.hours });
      toast("ok", t("d_saved"));
      asg.reload();
      onChanged();
    } catch (e) {
      toast("err", errText(e));
    }
  }
  async function removeAssignment(id: string) {
    try {
      await sdelete(`/assignments/${id}`);
      asg.reload();
      onChanged();
    } catch (e) {
      toast("err", errText(e));
    }
  }
  return (
    <Modal open onClose={onClose} size="lg" title={teacher.full_name}>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "assign", label: t("d_assignments") }, { key: "account", label: t("d_account") }]} />
      <div className="pt-4">
        {tab === "assign" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("d_workload")}: <b className="text-slate-900 dark:text-slate-100">{hours}</b> {t("d_hours_week")}</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_auto]">
              <Select aria-label={t("class")} value={add.class_id} onChange={(e) => setAdd({ ...add, class_id: e.target.value })}><option value="">{t("class")}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Select aria-label={t("subject")} value={add.subject_id} onChange={(e) => setAdd({ ...add, subject_id: e.target.value })}><option value="">{t("subject")}</option>{subjects.map((s) => <option key={s.id} value={s.id}>{sn(s)}</option>)}</Select>
              <Input aria-label={t("d_hours_week")} type="number" min={1} max={12} value={add.hours} onChange={(e) => setAdd({ ...add, hours: Number(e.target.value) || 1 })} />
              <Button variant="primary" disabled={!add.class_id || !add.subject_id} onClick={addAssignment}><Plus className="size-4" /> {t("add")}</Button>
            </div>
            <Async state={asg} rows={3} empty={!!asg.data && asg.data.assignments.length === 0}>
              <TableWrap>
                <table className={tableCls}>
                  <thead><tr><th className={thCls}>{t("class")}</th><th className={thCls}>{t("subject")}</th><th className={thCls}>{t("d_hours_week")}</th><th className={`${thCls} relative`}><span className="sr-only">{t("d_actions")}</span></th></tr></thead>
                  <tbody>
                    {asg.data?.assignments.map((a) => (
                      <tr key={a.id}>
                        <td className={tdCls}>{classes.find((c) => c.id === a.class_id)?.name}</td>
                        <td className={tdCls}>{sn(subjects.find((s) => s.id === a.subject_id))}</td>
                        <td className={tdCls}>{a.hours_per_week}</td>
                        <td className={`${tdCls} text-right`}><Button size="icon" variant="ghost" aria-label={t("delete")} onClick={() => removeAssignment(a.id)}><Trash2 className="size-4 text-red-500" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Async>
          </div>
        )}
        {tab === "account" && (
          <div className="space-y-3 text-sm">
            <p>{teacher.user_id ? <Badge tone="green">{t("d_has_login")}</Badge> : <Badge tone="gray">{t("d_no_login")}</Badge>} <span className="ml-2 text-slate-500 dark:text-slate-400">{teacher.email}</span></p>
            <div className="flex flex-wrap gap-2">
              {!teacher.user_id && <Button variant="primary" onClick={() => setAcct(true)}><KeyRound className="size-4" /> {t("d_create_login")}</Button>}
              {teacher.user_id && <Button onClick={() => setConfirm("reset")}><KeyRound className="size-4" /> {t("d_reset_password")}</Button>}
              {teacher.user_id && <Button variant="danger" onClick={() => setConfirm("deactivate")}><UserX className="size-4" /> {t("d_deactivate")}</Button>}
              {teacher.user_id && <Button onClick={() => setConfirm("activate")}>{t("d_activate")}</Button>}
            </div>

          </div>
        )}
      </div>
      <TempPasswordModal open={!!newPw} title={t("a_reset_pw_title")} onClose={() => setNewPw(null)} email={teacher.email ?? ""} password={newPw?.password ?? null} demo={!!newPw?.demo} name={teacher.full_name} />
      <AccountDialog target={acct ? { kind: "teacher", id: teacher.id, name: teacher.full_name, email: teacher.email } : null} onClose={() => setAcct(false)} onDone={onChanged} />
      <ConfirmDialog
        open={!!confirm} danger={confirm === "deactivate"} title={confirm ? t(`d_${confirm}` as "d_deactivate") : ""} text={teacher.full_name} onClose={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            if (confirm === "reset") {
              const r = await spost<{ reset: { temp_password: string | null; demo: boolean } }>("/accounts/reset-password", { user_id: teacher.user_id });
              setNewPw({ password: r.reset.temp_password, demo: r.reset.demo });
            } else {
              await spost("/director/accounts-active", { user_id: teacher.user_id, active: confirm === "activate" });
              toast("ok", t(confirm === "deactivate" ? "a_deactivated" : "d_saved"));
            }
          } catch (e) {
            toast("err", errText(e));
          }
          setConfirm(null);
        }}
      />
    </Modal>
  );
}

export function TeachersPanel() {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const sn = useSubjectName();
  const { subjects } = useSubjects();
  const res = useApi<{ teachers: TeacherRow[] }>("/teachers");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<TeacherRow | null | "new">(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [del, setDel] = useState<TeacherRow | null>(null);
  const dq = useDebounced(q).toLowerCase();
  const rows = (res.data?.teachers ?? []).filter((x) => (!status || x.status === status) && x.full_name.toLowerCase().includes(dq));
  const detailRow = res.data?.teachers.find((x) => x.id === detail);
  const total = rows.reduce((n, x) => n + x.hours_per_week, 0);

  return (
    <DirPage
      title={t("navTeachers")} subtitle={res.data ? `${rows.length} · ${total} ${t("d_hours_week")}` : undefined}
      actions={<Button variant="primary" onClick={() => setForm("new")}><Plus className="size-4" /> {t("d_new_teacher")}</Button>}
    >
      <div className="flex flex-wrap gap-2">
        <Input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <FilterSelect label={t("d_status")} value={status} onChange={setStatus}><option value="">{t("d_status")}: {t("d_all")}</option><option value="active">{t("d_active")}</option><option value="inactive">{t("d_inactive")}</option></FilterSelect>
      </div>
      <Async state={res} empty={!!res.data && rows.length === 0}>
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>{t("d_full_name")}</th><th className={`${thCls} hidden md:table-cell`}>{t("navSubjects")}</th><th className={thCls}>{t("navClasses")}</th><th className={thCls}>{t("d_workload")}</th><th className={thCls}>{t("d_status")}</th><th className={`${thCls} relative`}><span className="sr-only">{t("d_actions")}</span></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className={tdCls}>
                    <button className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center font-semibold text-indigo-700 hover:underline dark:text-fuchsia-300" onClick={() => setDetail(x.id)}>{x.full_name}</button>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{x.phone ?? ""} {x.hired_at ? `· ${fmtDate(x.hired_at)}` : ""}</p>
                  </td>
                  <td className={`${tdCls} hidden md:table-cell`}><div className="flex flex-wrap gap-1">{x.subjects.map((id) => <Badge key={id}>{subjects.find((s) => s.id === id)?.short || sn(subjects.find((s) => s.id === id))}</Badge>)}</div></td>
                  <td className={tdCls}><span className="text-xs">{x.classes.join(", ") || "-"}</span>{x.homeroom_of.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{t("d_homeroom")}: {x.homeroom_of.join(", ")}</p>}</td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2"><span className="w-8 tabular-nums">{x.hours_per_week}</span><div className="hidden h-2 w-20 rounded-full bg-slate-200 sm:block dark:bg-slate-700"><div className={cn("h-2 rounded-full", x.hours_per_week > 20 ? "bg-amber-500" : "bg-indigo-600")} style={{ width: `${Math.min(100, (x.hours_per_week / MAX_HOURS) * 100)}%` }} /></div></div>
                  </td>
                  <td className={tdCls}><Badge tone={x.status === "active" ? "green" : "gray"}>{x.status === "active" ? t("d_active") : t("d_inactive")}</Badge></td>
                  <td className={`${tdCls} text-right`}>
                    <Button size="icon" variant="ghost" aria-label={t("edit")} onClick={() => setForm(x)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={t("delete")} onClick={() => setDel(x)}><Trash2 className="size-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {rows.length === 0 && <EmptyState />}
      </Async>
      {form && <TeacherForm teacher={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={res.reload} />}
      {detailRow && <TeacherDetail teacher={detailRow} onClose={() => setDetail(null)} onChanged={res.reload} />}
      <ConfirmDialog
        open={!!del} danger title={t("delete")} text={<>{del?.full_name}<br />{t("d_delete_teacher_hint")}</>} onClose={() => setDel(null)}
        onConfirm={async () => {
          try { await sdelete(`/teachers/${del!.id}`); toast("ok", t("d_deleted")); res.reload(); } catch (e) { toast("err", errText(e)); }
          setDel(null);
        }}
      />
    </DirPage>
  );
}
