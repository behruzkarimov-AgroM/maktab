"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, KeyRound, Pencil, Plus, Trash2, UserCog, UserPlus, UserX } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";
import { sdelete, spost } from "@/lib/school/client";
import type { AuditRow } from "@/lib/school/db";
import { isoWeekday, shiftRange } from "@/lib/school/director-logic";
import { ATTENDANCE_LABEL, RISK_LABEL } from "@/lib/school/i18n";
import type { AttendanceRecord, AttendanceStatus, BehaviorNote, Guardian, StudentDetail, StudentPerformance } from "@/lib/school/types";
import { Badge, Button, STATUS_TONE, cn, gradeTone } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, ConfirmDialog, DirPage, EmptyState, Field, Input, Kpi, Modal, PctBadge, SectionCard, Select, Tabs, TableWrap, Textarea, fmtDate, fmtDateTime, fmtNum, studentName,
  tableCls, tdCls, thCls, useApi, useErrText, useMe, useToast,
} from "./common";
import { STATUS_TONE_S } from "./StudentsList";
import { StudentForm } from "./StudentForm";
import { TempPasswordModal } from "./TempPassword";
import { InviteGuardianDialog } from "./InviteGuardian";

type Tab = "overview" | "attendance" | "grades" | "guardians" | "notes" | "audit";
const CAL_COLOR: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500/80 text-white", late: "bg-amber-400 text-slate-900", absent: "bg-red-500 text-white", excused: "bg-sky-400 text-slate-900", sick: "bg-indigo-400 text-white",
};

export function StudentProfile({ id }: { id: string }) {
  const { t } = useSchool();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const st = useApi<{ student: StudentDetail }>(`/students/${id}`);
  const perf = useApi<{ performance: StudentPerformance }>(`/reports/student-performance?student_id=${id}`);
  const s = st.data?.student;

  return (
    <DirPage
      title={s ? studentName(s) : t("navStudents")}
      subtitle={s ? `${s.class_name ?? "-"} · ${s.student_code}` : undefined}
      actions={
        <>
          <Link href="/school/director/students" className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-sm font-medium text-slate-700 hover:underline dark:text-slate-300">{t("d_back")}</Link>
          {s && <Button onClick={() => setEditing(true)}><Pencil className="size-4" /> {t("edit")}</Button>}
          {s && <Button onClick={() => setStatusOpen(true)}><UserCog className="size-4" /> {t("d_change_status")}</Button>}
          {s && <Link href={`/school/director/reports?student_id=${id}`} className="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500">{t("d_report_card")}</Link>}
        </>
      }
    >
      <Async state={st} rows={4}>
        {s && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE_S[s.status]}>{t(`d_st_${s.status}` as "d_st_active")}</Badge>
              {s.risk?.map((r) => <Badge key={r} tone="red">{t(RISK_LABEL[r])}</Badge>)}
            </div>
            <Tabs
              value={tab} onChange={setTab}
              tabs={(["overview", "attendance", "grades", "guardians", "notes", "audit"] as Tab[]).map((k) => ({ key: k, label: t(`d_tab_${k}` as "d_tab_overview") }))}
            />
            {tab === "overview" && <Overview s={s} perf={perf.data?.performance} />}
            {tab === "attendance" && <AttendanceTab id={id} />}
            {tab === "grades" && <GradesTab perf={perf} />}
            {tab === "guardians" && <GuardiansTab s={s} reload={st.reload} />}
            {tab === "notes" && <NotesTab id={id} />}
            {tab === "audit" && <AuditTab id={id} />}
          </div>
        )}
      </Async>
      <StudentForm open={editing} student={s} onClose={() => setEditing(false)} onSaved={() => st.reload()} />
      {s && <StatusDialog open={statusOpen} s={s} onClose={() => setStatusOpen(false)} onDone={() => { st.reload(); }} />}
    </DirPage>
  );
}

function Overview({ s, perf }: { s: StudentDetail; perf?: StudentPerformance }) {
  const { t } = useSchool();
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800"><dt className="text-slate-500 dark:text-slate-400">{k}</dt><dd className="text-right font-medium">{v || "-"}</dd></div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard title={t("d_tab_overview")} className="lg:col-span-2">
        <div className="flex gap-4">
          {s.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.photo_url} alt="" className="size-24 rounded-xl object-cover" />
          )}
          <dl className="min-w-0 flex-1">
            {row(t("d_full_name"), studentName(s))}
            {row(t("d_birth_date"), fmtDate(s.birth_date))}
            {row(t("d_gender"), s.gender ? t(s.gender === "m" ? "d_male" : "d_female") : "")}
            {row(t("class"), s.class_name)}
            {row(t("d_student_code"), s.student_code)}
            {row(t("d_phone"), s.phone)}
            {row(t("d_address"), s.address)}
            {row(t("d_enrolled_at"), fmtDate(s.enrolled_at))}
            {row(t("d_notes"), s.notes)}
          </dl>
        </div>
      </SectionCard>
      <div className="grid grid-cols-2 content-start gap-3 lg:grid-cols-1">
        <Kpi label={t("d_att_pct")} value={<PctBadge v={perf?.attendance.percent ?? s.attendance_percent} />} hint={perf ? `${t("stAbsent")}: ${perf.attendance.absent}` : undefined} />
        <Kpi label={t("average")} value={fmtNum(perf?.overall_average ?? s.average)} hint={perf ? `GPA ${fmtNum(perf.gpa)}` : undefined} />
        <Kpi label={t("d_rank")} value={perf?.rank_in_class ? `${perf.rank_in_class} / ${perf.class_size}` : "-"} />
        <Kpi label={t("d_streak")} value={perf?.attendance.streak ?? 0} tone={(perf?.attendance.streak ?? 0) >= 3 ? "bad" : "default"} />
      </div>
    </div>
  );
}

/* ---------- attendance: month calendar + history ---------- */
function AttendanceTab({ id }: { id: string }) {
  const { t } = useSchool();
  const me = useMe();
  const today = me.data?.today ?? new Date().toISOString().slice(0, 10);
  const [anchor, setAnchor] = useState<string | null>(null);
  const month = (anchor ?? today).slice(0, 7);
  const res = useApi<{ history: { rows: AttendanceRecord[]; summary: { percent: number | null; present: number; absent: number; late: number; excused: number; sick: number; streak: number }; days: { date: string; status: AttendanceStatus }[] } }>(`/attendance?student_id=${id}`);
  const h = res.data?.history;
  const byDate = useMemo(() => new Map((h?.days ?? []).map((d) => [d.date, d.status])), [h]);
  const first = `${month}-01`;
  const lead = isoWeekday(first) - 1;
  const dim = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const wd = [1, 2, 3, 4, 5, 6, 7].map((n) => t(`d_wd${n}` as "d_wd1"));
  return (
    <Async state={res} rows={4}>
      {h && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title={t("d_att_calendar")}
            actions={
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" aria-label={t("d_page_prev")} onClick={() => setAnchor(shiftRange("month", first, -1))}><ChevronLeft className="size-4" /></Button>
                <span className="w-20 text-center text-sm font-semibold tabular-nums">{month}</span>
                <Button size="icon" variant="ghost" aria-label={t("d_page_next")} onClick={() => setAnchor(shiftRange("month", first, 1))}><ChevronRight className="size-4" /></Button>
              </div>
            }
          >
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {wd.map((w) => <div key={w} className="py-1 font-semibold text-slate-500 dark:text-slate-400">{w}</div>)}
              {cells.map((c, i) => {
                if (!c) return <div key={`e${i}`} />;
                const stt = byDate.get(c);
                return (
                  <div key={c} title={stt ? t(ATTENDANCE_LABEL[stt]) : undefined} className={cn("flex aspect-square items-center justify-center rounded-md text-xs font-medium", stt ? CAL_COLOR[stt] : "bg-slate-100 text-slate-500 dark:text-slate-400 dark:bg-slate-800", isoWeekday(c) === 7 && !stt && "opacity-40")}>
                    {+c.slice(8)}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {(["present", "late", "absent", "excused", "sick"] as AttendanceStatus[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1"><span className={cn("size-3 rounded", CAL_COLOR[k].split(" ")[0])} />{t(ATTENDANCE_LABEL[k])}: {h.summary[k]}</span>
              ))}
            </div>
          </SectionCard>
          <SectionCard title={t("d_att_history")}>
            {h.rows.filter((r) => r.status !== "present").length === 0 ? <EmptyState /> : (
              <TableWrap className="max-h-96 overflow-y-auto">
                <table className={tableCls}>
                  <thead><tr><th className={thCls}>{t("date")}</th><th className={thCls}>{t("d_status")}</th><th className={thCls}>{t("d_reason")}</th></tr></thead>
                  <tbody>
                    {h.rows.filter((r) => r.status !== "present").slice(0, 100).map((r) => (
                      <tr key={r.id}>
                        <td className={tdCls}>{fmtDate(r.date)}</td>
                        <td className={tdCls}><Badge tone={STATUS_TONE[r.status]}>{t(ATTENDANCE_LABEL[r.status])}{r.status === "late" && r.minutes_late ? ` ${r.minutes_late}'` : ""}</Badge></td>
                        <td className={tdCls}>{r.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </SectionCard>
        </div>
      )}
    </Async>
  );
}

/* ---------- grades ---------- */
function GradesTab({ perf }: { perf: ReturnType<typeof useApi<{ performance: StudentPerformance }>> }) {
  const { t, L } = useSchool();
  const p = perf.data?.performance;
  return (
    <Async state={perf} rows={4}>
      {p && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={t("d_trend_terms")}>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={p.trend.map((x) => ({ name: x.name, v: x.average }))}>
                  <CartesianGrid stroke="rgba(148,163,184,.25)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[1, 5]} tick={{ fontSize: 11 }} width={28} /><Tooltip />
                  <Line dataKey="v" stroke="#1d3557" strokeWidth={2.5} connectNulls name={t("average")} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
          <SectionCard title={t("d_subject_avgs")}>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={p.subjects.map((x) => ({ name: L(x.subject).slice(0, 8), v: x.average }))}>
                  <CartesianGrid stroke="rgba(148,163,184,.25)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} /><YAxis domain={[1, 5]} tick={{ fontSize: 11 }} width={28} /><Tooltip />
                  <Bar dataKey="v" fill="#4a78a8" radius={[3, 3, 0, 0]} name={t("average")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
          <SectionCard title={t("d_grades_by_subject")} className="lg:col-span-2">
            <TableWrap>
              <table className={tableCls}>
                <thead><tr><th className={thCls}>{t("subject")}</th><th className={thCls}>{t("average")}</th>{[1, 2, 3, 4].map((n) => <th key={n} className={thCls}>{t("term")} {n}</th>)}<th className={thCls}>{t("d_year_grade")}</th></tr></thead>
                <tbody>
                  {p.subjects.map((x) => (
                    <tr key={x.subject_id}>
                      <td className={tdCls}>{L(x.subject)}</td>
                      <td className={tdCls}><Badge tone={gradeTone(x.average)}>{fmtNum(x.average)}</Badge></td>
                      {x.term_values.map((v, i) => <td key={i} className={tdCls}>{v ?? "-"}</td>)}
                      <td className={`${tdCls} font-bold`}>{x.year_value ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </SectionCard>
        </div>
      )}
    </Async>
  );
}

/* ---------- guardians ---------- */
function GuardiansTab({ s, reload }: { s: StudentDetail; reload: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const all = useApi<{ guardians: (Guardian & { student_ids: string[] })[] }>("/guardians");
  const [adding, setAdding] = useState<"new" | "link" | null>(null);
  const [edit, setEdit] = useState<(Guardian & { is_primary?: boolean }) | null>(null);
  const [unlink, setUnlink] = useState<Guardian | null>(null);
  const [acctAction, setAcctAction] = useState<{ kind: "reset" | "deactivate"; g: Guardian } | null>(null);
  const [tmp, setTmp] = useState<{ email: string; password: string | null; demo: boolean; name: string } | null>(null);
  const [invite, setInvite] = useState<{ guardian: Guardian | null } | null>(null);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", relation: "mother", telegram_chat_id: "", is_primary: false });
  const [pick, setPick] = useState("");
  const [search, setSearch] = useState("");

  function openForm(g?: Guardian) {
    setForm(g ? { full_name: g.full_name, phone: g.phone ?? "", email: g.email ?? "", relation: g.relation, telegram_chat_id: g.telegram_chat_id ?? "", is_primary: false } : { full_name: "", phone: "", email: "", relation: "mother", telegram_chat_id: "", is_primary: s.guardians.length === 0 });
    setEdit(g ?? null);
    setAdding("new");
  }
  async function saveGuardian() {
    try {
      const { is_primary, ...rest } = form;
      if (edit) await spostPatch(`/guardians/${edit.id}`, rest);
      else await spost("/guardians", { ...rest, student_id: s.id, is_primary });
      toast("ok", t("d_saved"));
      setAdding(null);
      reload();
      all.reload();
    } catch (e) {
      toast("err", errText(e));
    }
  }
  async function link() {
    try {
      await spost("/guardians/link", { student_id: s.id, guardian_id: pick, is_primary: s.guardians.length === 0 });
      toast("ok", t("d_saved"));
      setAdding(null);
      reload();
    } catch (e) {
      toast("err", errText(e));
    }
  }
  const candidates = (all.data?.guardians ?? []).filter((g) => !s.guardians.some((x) => x.id === g.id) && g.full_name.toLowerCase().includes(search.toLowerCase())).slice(0, 50);

  return (
    <SectionCard
      title={t("d_tab_guardians")}
      actions={<div className="flex flex-wrap gap-2"><Button size="sm" variant="gold" className="min-h-11 sm:min-h-0" onClick={() => setInvite({ guardian: null })}><UserPlus className="size-3.5" aria-hidden /> {t("a_inv_btn")}</Button><Button size="sm" className="min-h-11 sm:min-h-0" onClick={() => { setPick(""); setSearch(""); setAdding("link"); }}>{t("d_link_existing")}</Button><Button size="sm" variant="primary" onClick={() => openForm()}><Plus className="size-3.5" /> {t("add")}</Button></div>}
    >
      {s.guardians.length === 0 ? <EmptyState /> : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {s.guardians.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{g.full_name} {g.is_primary && <Badge tone="navy">{t("d_primary")}</Badge>}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t(`d_rel_${g.relation}` as "d_rel_mother")} · {g.phone ?? "-"} · {g.email ?? "-"} {g.user_id && <Badge tone="green">{t("d_has_login")}</Badge>}</p>
              </div>
              <div className="flex gap-1">
                {!g.user_id && <Button size="sm" className="min-h-11 sm:min-h-0" onClick={() => setInvite({ guardian: g })}>{t("d_create_login")}</Button>}
                {g.user_id && <Button size="sm" className="min-h-11 sm:min-h-0" onClick={() => setAcctAction({ kind: "reset", g })}><KeyRound className="size-3.5" aria-hidden /> {t("d_reset_password")}</Button>}
                {g.user_id && <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-0" onClick={() => setAcctAction({ kind: "deactivate", g })}><UserX className="size-3.5 text-red-600" aria-hidden /> {t("d_deactivate")}</Button>}
                <Button size="icon" variant="ghost" aria-label={t("edit")} onClick={() => openForm(g)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={t("d_unlink")} onClick={() => setUnlink(g)}><Trash2 className="size-4 text-red-500" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={adding === "new"} onClose={() => setAdding(null)} title={edit ? t("edit") : t("d_new_guardian")}
        footer={<><Button onClick={() => setAdding(null)}>{t("cancel")}</Button><Button variant="primary" disabled={form.full_name.trim().length < 2} onClick={saveGuardian}>{t("save")}</Button></>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("d_full_name")} required className="sm:col-span-2"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label={t("d_relation")}>
            <Select value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
              {["mother", "father", "guardian", "parent", "other"].map((r) => <option key={r} value={r}>{t(`d_rel_${r}` as "d_rel_mother")}</option>)}
            </Select>
          </Field>
          <Field label={t("d_phone")}><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={t("email")}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Telegram chat id"><Input value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal
        open={adding === "link"} onClose={() => setAdding(null)} title={t("d_link_existing")}
        footer={<><Button onClick={() => setAdding(null)}>{t("cancel")}</Button><Button variant="primary" disabled={!pick} onClick={link}>{t("d_link")}</Button></>}
      >
        <Field label={t("search")}><Input value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto" role="listbox">
          {candidates.map((g) => (
            <li key={g.id}>
              <button role="option" aria-selected={pick === g.id} onClick={() => setPick(g.id)} className={cn("w-full rounded-lg px-3 py-1.5 text-left text-sm max-sm:min-h-11", pick === g.id ? "bg-indigo-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800")}>
                {g.full_name} <span className="opacity-70">{g.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      <ConfirmDialog
        open={!!unlink} danger title={t("d_unlink")} text={unlink?.full_name} onClose={() => setUnlink(null)}
        onConfirm={async () => {
          try { await sdelete("/guardians/link", { student_id: s.id, guardian_id: unlink!.id }); toast("ok", t("d_saved")); reload(); } catch (e) { toast("err", errText(e)); }
          setUnlink(null);
        }}
      />
      <InviteGuardianDialog student={s} guardian={invite?.guardian ?? null} open={!!invite} onClose={() => setInvite(null)} onDone={() => { reload(); all.reload(); }} />
      <ConfirmDialog
        open={!!acctAction} danger={acctAction?.kind === "deactivate"} title={acctAction ? t(acctAction.kind === "reset" ? "d_reset_password" : "d_deactivate") : ""} text={acctAction?.g.full_name} onClose={() => setAcctAction(null)}
        onConfirm={async () => {
          const a = acctAction!;
          try {
            if (a.kind === "reset") {
              const r = await spost<{ reset: { temp_password: string | null; demo: boolean } }>("/accounts/reset-password", { user_id: a.g.user_id });
              setTmp({ email: a.g.email ?? "", password: r.reset.temp_password, demo: r.reset.demo, name: a.g.full_name });
            } else {
              await spost("/director/accounts-active", { user_id: a.g.user_id, active: false });
              toast("ok", t("a_deactivated"));
            }
          } catch (e) { toast("err", errText(e)); }
          setAcctAction(null);
        }}
      />
      <TempPasswordModal open={!!tmp} title={t("a_reset_pw_title")} onClose={() => setTmp(null)} email={tmp?.email ?? ""} password={tmp?.password ?? null} demo={!!tmp?.demo} name={tmp?.name} />
    </SectionCard>
  );
}
async function spostPatch(path: string, body: unknown) {
  const { spatch } = await import("@/lib/school/client");
  return spatch(path, body);
}

/* ---------- notes ---------- */
function NotesTab({ id }: { id: string }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const res = useApi<{ notes: BehaviorNote[] }>(`/director/notes?student_id=${id}`);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("neutral");
  const [del, setDel] = useState<BehaviorNote | null>(null);
  async function add() {
    try {
      await spost("/director/notes", { student_id: id, kind, text });
      setText("");
      res.reload();
      toast("ok", t("d_saved"));
    } catch (e) {
      toast("err", errText(e));
    }
  }
  return (
    <SectionCard title={t("d_tab_notes")}>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Textarea aria-label={t("d_notes")} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("d_note_ph")} />
        <select aria-label={t("d_kind")} value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          {["positive", "neutral", "negative"].map((k) => <option key={k} value={k}>{t(`d_note_${k}` as "d_note_positive")}</option>)}
        </select>
        <Button variant="primary" disabled={!text.trim()} onClick={add}>{t("add")}</Button>
      </div>
      <Async state={res} rows={3} empty={!!res.data && res.data.notes.length === 0}>
        <ul className="space-y-2">
          {res.data?.notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div><Badge tone={n.kind === "positive" ? "green" : n.kind === "negative" ? "red" : "gray"}>{t(`d_note_${n.kind}` as "d_note_positive")}</Badge> <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(n.date)}</span><p className="mt-1 whitespace-pre-wrap">{n.text}</p></div>
              <Button size="icon" variant="ghost" aria-label={t("delete")} onClick={() => setDel(n)}><Trash2 className="size-4 text-red-500" /></Button>
            </li>
          ))}
        </ul>
      </Async>
      <ConfirmDialog
        open={!!del} danger title={t("delete")} onClose={() => setDel(null)}
        onConfirm={async () => { try { await sdelete(`/director/notes?id=${del!.id}`); res.reload(); } catch (e) { toast("err", errText(e)); } setDel(null); }}
      />
    </SectionCard>
  );
}

/* ---------- audit ---------- */
function AuditTab({ id }: { id: string }) {
  const { t } = useSchool();
  const res = useApi<{ rows: AuditRow[] }>(`/director/audit?resource=students&record_id=${id}&limit=100`);
  return (
    <SectionCard title={t("d_tab_audit")}>
      <Async state={res} rows={3} empty={!!res.data && res.data.rows.length === 0}>
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>{t("date")}</th><th className={thCls}>{t("d_user")}</th><th className={thCls}>{t("d_action")}</th><th className={thCls}>{t("d_details")}</th></tr></thead>
            <tbody>
              {res.data?.rows.map((r, i) => (
                <tr key={i}>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(r.created_at)}</td><td className={tdCls}>{r.user_email ?? "-"}</td><td className={tdCls}><Badge>{r.action}</Badge></td>
                  <td className={`${tdCls} max-w-xs truncate font-mono text-xs`}>{r.diff ? JSON.stringify(r.diff) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Async>
    </SectionCard>
  );
}

/* ---------- status change ---------- */
function StatusDialog({ open, s, onClose, onDone }: { open: boolean; s: StudentDetail; onClose: () => void; onDone: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const [status, setStatus] = useState<string>("transferred");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await spost("/director/student-status", { student_id: s.id, status, reason });
      toast("ok", t("d_saved"));
      setReason("");
      onClose();
      onDone();
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open} onClose={onClose} title={t("d_change_status")} size="sm"
      footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant={status === "expelled" ? "danger" : "primary"} loading={busy} disabled={!reason.trim() || status === s.status} onClick={go}>{t("d_confirm")}</Button></>}
    >
      <div className="space-y-3">
        <Field label={t("d_status")}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["active", "transferred", "graduated", "expelled"].map((k) => <option key={k} value={k}>{t(`d_st_${k}` as "d_st_active")}</option>)}
          </Select>
        </Field>
        <Field label={t("d_reason")} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("d_status_hint")}</p>
      </div>
    </Modal>
  );
}
