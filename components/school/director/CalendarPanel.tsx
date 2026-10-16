"use client";

import { Fragment, useMemo, useState } from "react";
import { Lock, Pencil, Plus, Unlock } from "lucide-react";
import { spatch, spost } from "@/lib/school/client";
import type { SchoolYear, Term } from "@/lib/school/types";
import { Badge, Button, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, ConfirmDialog, DirPage, EmptyState, Field, Input, Modal, SectionCard, Select, TableWrap, fmtDate, tableCls, tdCls, thCls, useApi, useErrText, useSubjects, useSubjectName, useToast,
} from "./common";

interface YT { years: SchoolYear[]; terms: Term[]; current_year_id: string | null }
interface StatusRow { class_id: string; class_name: string; subject_id: string; teacher_id: string; teacher_name: string; total: number; confirmed: number }

export function CalendarPanel() {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const res = useApi<YT>("/years-terms");
  const [yearId, setYearId] = useState("");
  const [yearForm, setYearForm] = useState<SchoolYear | "new" | null>(null);
  const [termForm, setTermForm] = useState<Term | "new" | null>(null);
  const [lock, setLock] = useState<Term | null>(null);
  const year = res.data?.years.find((y) => y.id === (yearId || res.data?.current_year_id)) ?? res.data?.years[0];
  const terms = (res.data?.terms ?? []).filter((x) => x.year_id === year?.id).sort((a, b) => a.number - b.number);

  return (
    <DirPage title={t("d_calendar")} actions={<Button variant="primary" onClick={() => setYearForm("new")}><Plus className="size-4" /> {t("d_new_year")}</Button>}>
      <Async state={res}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium" htmlFor="yr">{t("d_year")}</label>
          <Select id="yr" value={year?.id ?? ""} onChange={(e) => setYearId(e.target.value)} className="w-auto">
            {res.data?.years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " ★" : ""}</option>)}
          </Select>
          {year && <Button onClick={() => setYearForm(year)}><Pencil className="size-4" /> {t("edit")}</Button>}
          {year && <span className="text-sm text-slate-500 dark:text-slate-400">{fmtDate(year.start_date)} - {fmtDate(year.end_date)} {year.is_current && <Badge tone="navy">{t("d_is_current")}</Badge>}</span>}
        </div>
        <SectionCard title={t("d_terms")} actions={year && terms.length < 4 ? <Button size="sm" onClick={() => setTermForm("new")}><Plus className="size-3.5" /> {t("d_new_term")}</Button> : undefined}>
          {terms.length === 0 ? <EmptyState /> : (
            <TableWrap>
              <table className={tableCls}>
                <thead><tr><th className={thCls}>#</th><th className={thCls}>{t("d_name")}</th><th className={thCls}>{t("d_from")}</th><th className={thCls}>{t("d_to")}</th><th className={thCls}>{t("d_status")}</th><th className={thCls}><span className="sr-only">{t("d_actions")}</span></th></tr></thead>
                <tbody>
                  {terms.map((x) => (
                    <tr key={x.id}>
                      <td className={tdCls}>{x.number}</td><td className={`${tdCls} font-semibold`}>{x.name}</td><td className={tdCls}>{fmtDate(x.start_date)}</td><td className={tdCls}>{fmtDate(x.end_date)}</td>
                      <td className={tdCls}><Badge tone={x.is_locked ? "red" : "green"}>{x.is_locked ? t("d_locked") : t("d_open")}</Badge></td>
                      <td className={`${tdCls} whitespace-nowrap text-right`}>
                        <Button size="sm" onClick={() => setLock(x)}>{x.is_locked ? <><Unlock className="size-3.5" /> {t("d_unlock")}</> : <><Lock className="size-3.5" /> {t("d_lock")}</>}</Button>
                        <Button size="icon" variant="ghost" aria-label={t("edit")} onClick={() => setTermForm(x)}><Pencil className="size-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </SectionCard>
        {terms.length > 0 && <Confirmation terms={terms} />}
      </Async>
      {yearForm && <YearForm year={yearForm === "new" ? null : yearForm} onClose={() => setYearForm(null)} onSaved={res.reload} />}
      {termForm && year && <TermForm term={termForm === "new" ? null : termForm} year={year} taken={terms.map((x) => x.number)} onClose={() => setTermForm(null)} onSaved={res.reload} />}
      <ConfirmDialog
        open={!!lock} danger={!lock?.is_locked} title={lock?.is_locked ? t("d_unlock") : t("d_lock")} text={lock?.is_locked ? t("d_unlock_confirm") : t("d_lock_confirm")} onClose={() => setLock(null)}
        onConfirm={async () => {
          try { await spost("/years-terms/lock", { term_id: lock!.id, locked: !lock!.is_locked }); toast("ok", t("d_saved")); res.reload(); } catch (e) { toast("err", errText(e)); }
          setLock(null);
        }}
      />
    </DirPage>
  );
}

function Confirmation({ terms }: { terms: Term[] }) {
  const { t } = useSchool();
  const sn = useSubjectName();
  const { subjects } = useSubjects();
  const [termId, setTermId] = useState(terms.find((x) => x.is_locked)?.id ?? terms[0].id);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const res = useApi<{ rows: StatusRow[] }>(`/director/term-status?term_id=${termId}`);
  const rows = useMemo(() => (res.data?.rows ?? []).filter((r) => !onlyOpen || r.confirmed < r.total), [res.data, onlyOpen]);
  const byTeacher = useMemo(() => {
    const m = new Map<string, { name: string; open: number; all: number }>();
    for (const r of res.data?.rows ?? []) {
      const e = m.get(r.teacher_id) ?? m.set(r.teacher_id, { name: r.teacher_name, open: 0, all: 0 }).get(r.teacher_id)!;
      e.all++;
      if (r.confirmed < r.total) e.open++;
    }
    return [...m.values()].filter((x) => x.open > 0).sort((a, b) => b.open - a.open);
  }, [res.data]);
  return (
    <SectionCard
      title={t("d_term_confirm")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label={t("term")} value={termId} onChange={(e) => setTermId(e.target.value)} className="w-auto">{terms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> {t("d_only_unconfirmed")}</label>
        </div>
      }
    >
      <Async state={res} rows={4}>
        {byTeacher.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {byTeacher.slice(0, 10).map((x) => <Badge key={x.name} tone="amber">{x.name}: {x.open}/{x.all}</Badge>)}
          </div>
        )}
        {rows.length === 0 ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("d_all_confirmed")}</p> : (
          <TableWrap className="max-h-[28rem] overflow-y-auto">
            <table className={tableCls}>
              <thead><tr><th className={thCls}>{t("class")}</th><th className={thCls}>{t("subject")}</th><th className={thCls}>{t("d_teacher")}</th><th className={thCls}>{t("d_confirmed")}</th><th className={`${thCls} relative`}><span className="sr-only">{t("a_term_override_title")}</span></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={`${r.class_id}${r.subject_id}`}>
                  <tr>
                    <td className={tdCls}>{r.class_name}</td><td className={tdCls}>{sn(subjects.find((s) => s.id === r.subject_id))}</td><td className={tdCls}>{r.teacher_name}</td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-700"><div className={cn("h-2 rounded-full", r.confirmed >= r.total ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${r.total ? (r.confirmed / r.total) * 100 : 0}%` }} /></div>
                        <span className="text-xs tabular-nums">{r.confirmed}/{r.total}</span>
                      </div>
                    </td>
                    <td className={tdCls}>
                      <Button size="sm" className="min-h-11 sm:min-h-0" aria-expanded={open === `${r.class_id}${r.subject_id}`} onClick={() => setOpen(open === `${r.class_id}${r.subject_id}` ? null : `${r.class_id}${r.subject_id}`)}>
                        {t("a_term_override_badge")}
                      </Button>
                    </td>
                  </tr>
                  {open === `${r.class_id}${r.subject_id}` && <OverrideRows termId={termId} classId={r.class_id} subjectId={r.subject_id} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
    </SectionCard>
  );
}

/** Overridden term grades of one class + subject (GET /grades/term): value vs suggestion and the teacher's reason. */
function OverrideRows({ termId, classId, subjectId }: { termId: string; classId: string; subjectId: string }) {
  const { t } = useSchool();
  const res = useApi<{ table: { rows: { student_id: string; last_name: string; first_name: string; suggested: number | null; value: number | null; override_reason: string | null }[] } }>(
    `/grades/term?class_id=${classId}&subject_id=${subjectId}&term_id=${termId}`,
  );
  const over = (res.data?.table.rows ?? []).filter((x) => x.value !== null && x.suggested !== null && x.value !== x.suggested);
  return (
    <tr>
      <td colSpan={5} className="border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
        {!res.data ? <p className="text-xs text-slate-600 dark:text-slate-400">{t("loading")}</p> : over.length === 0 ? <p className="text-xs text-slate-600 dark:text-slate-400">{t("a_term_override_none")}</p> : (
          <ul className="space-y-1 text-sm" data-testid="override-list">
            {over.map((x) => (
              <li key={x.student_id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{x.last_name} {x.first_name}</span>
                <Badge tone="amber">{x.suggested} → {x.value}</Badge>
                <span className="text-xs text-slate-700 dark:text-slate-300">{x.override_reason ? `${t("a_term_override_tip").replace("{reason}", x.override_reason)}` : t("a_term_override_missing")}</span>
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function YearForm({ year, onClose, onSaved }: { year: SchoolYear | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const [f, setF] = useState({ name: year?.name ?? "", start_date: year?.start_date ?? "", end_date: year?.end_date ?? "", is_current: year?.is_current ?? false });
  const [busy, setBusy] = useState(false);
  const bad = !f.name.trim() || !f.start_date || !f.end_date || f.end_date <= f.start_date;
  async function save() {
    setBusy(true);
    try {
      if (year) await spatch(`/years-terms/${year.id}`, { kind: "year", ...f, grading_rules: year.grading_rules });
      else await spost("/years-terms", { kind: "year", ...f });
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
    <Modal open onClose={onClose} size="sm" title={year ? t("edit") : t("d_new_year")} footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={bad} onClick={save}>{t("save")}</Button></>}>
      <div className="space-y-3">
        <Field label={t("d_name")} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="2026-2027" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("d_from")} required><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label={t("d_to")} required error={f.start_date && f.end_date <= f.start_date ? t("d_err_date") : null}><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_current} onChange={(e) => setF({ ...f, is_current: e.target.checked })} /> {t("d_is_current")}</label>
      </div>
    </Modal>
  );
}

function TermForm({ term, year, taken, onClose, onSaved }: { term: Term | null; year: SchoolYear; taken: number[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const free = [1, 2, 3, 4].find((n) => !taken.includes(n)) ?? 1;
  const [f, setF] = useState({ number: term?.number ?? free, name: term?.name ?? `${free}-chorak`, start_date: term?.start_date ?? year.start_date, end_date: term?.end_date ?? year.end_date });
  const [busy, setBusy] = useState(false);
  const bad = !f.name.trim() || f.end_date <= f.start_date || f.start_date < year.start_date || f.end_date > year.end_date;
  async function save() {
    setBusy(true);
    try {
      const body = { kind: "term", year_id: year.id, ...f };
      if (term) await spatch(`/years-terms/${term.id}`, body);
      else await spost("/years-terms", body);
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
    <Modal open onClose={onClose} size="sm" title={term ? t("edit") : t("d_new_term")} footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={bad} onClick={save}>{t("save")}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="#"><Select value={f.number} disabled={!!term} onChange={(e) => setF({ ...f, number: Number(e.target.value) as 1 })}>{[1, 2, 3, 4].filter((n) => term || !taken.includes(n)).map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
          <Field label={t("d_name")} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t("d_from")}><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label={t("d_to")} error={bad && f.end_date <= f.start_date ? t("d_err_date") : null}><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(year.start_date)} - {fmtDate(year.end_date)}</p>
      </div>
    </Modal>
  );
}
