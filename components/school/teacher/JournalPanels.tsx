"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Lock, Save } from "lucide-react";
import { Badge, Button, Card, cn, gradeTone, inputCls } from "@/components/school/ui/kit";
import { sget, spost } from "@/lib/school/client";
import { addDays, yearGrade } from "@/lib/school/grading";
import { needsReason } from "@/lib/school/teacher-logic";
import type { Lesson } from "@/lib/school/types";
import { EmptyState, ErrorState, Field, Skeleton, selectCls, fmtDate, type Base, type useToasts } from "./common";
import { useTT } from "./use-tt";

interface TermRow {
  student_id: string;
  last_name: string;
  first_name: string;
  average: number | null;
  entry_count: number;
  suggested: number | null;
  value: number | null;
  is_confirmed: boolean;
  /** why the confirmed value differs from the suggestion (term_grades.override_reason) */
  override_reason?: string | null;
}
interface TermTable {
  term_locked: boolean;
  can_edit: boolean;
  rows: TermRow[];
}

export function TermPanel({ b, classId, subjectId, termId, toasts }: { b: Base; classId: string; subjectId: string; termId: string; toasts: ReturnType<typeof useToasts> }) {
  const { tt, t, errText } = useTT();
  const [all, setAll] = useState<Record<string, TermTable> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [ver, setVer] = useState(0);
  const [vals, setVals] = useState<Record<string, number | null>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all(b.me.terms.map((t) => sget<{ table: TermTable }>(`/grades/term?class_id=${classId}&subject_id=${subjectId}&term_id=${t.id}`).then((r) => [t.id, r.table] as const)))
      .then((e) => {
        if (live) {
          setAll(Object.fromEntries(e));
          setError(null);
        }
      })
      .catch((e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [b.me.terms, classId, subjectId, ver]);

  if (error) return <ErrorState message={errText(error)} onRetry={() => setVer((v) => v + 1)} />;
  const cur = all?.[termId];
  if (!all || !cur) return <Skeleton className="h-64 w-full" />;
  const editable = cur.can_edit && !cur.term_locked;
  const eff = (r: TermRow) => (r.student_id in vals ? vals[r.student_id] : r.value);
  const confirmed = cur.rows.filter((r) => eff(r) !== null).length;
  const changed = cur.rows.filter((r) => r.student_id in vals && vals[r.student_id] !== r.value);

  const yearPreview = (sid: string) =>
    yearGrade(
      b.me.terms.map((t) => {
        const row = all[t.id]?.rows.find((x) => x.student_id === sid);
        if (!row) return null;
        return t.id === termId ? eff(row) ?? row.suggested : row.value ?? row.suggested;
      }),
    );

  const acceptAll = () => setVals((v) => ({ ...v, ...Object.fromEntries(cur.rows.filter((r) => r.suggested !== null && r.value === null).map((r) => [r.student_id, r.suggested])) }));

  const save = async () => {
    const missing = changed.find((r) => needsReason(vals[r.student_id], r.suggested) && vals[r.student_id] !== null && !(reasons[r.student_id] ?? "").trim());
    if (missing) {
      toasts.push("error", tt("term_reasonRequired"));
      return;
    }
    if (!changed.length) return;
    setSaving(true);
    try {
      await spost("/teacher/term-grades", {
        class_id: classId, subject_id: subjectId, term_id: termId,
        rows: changed.map((r) => ({
          student_id: r.student_id,
          value: vals[r.student_id],
          ...(needsReason(vals[r.student_id], r.suggested) && vals[r.student_id] !== null ? { override_reason: (reasons[r.student_id] ?? "").trim().slice(0, 300) } : {}),
        })),
      });
      toasts.push("ok", tt("term_saved", { n: changed.length }));
      setVals({});
      setReasons({});
      setVer((v) => v + 1);
      b.reloadOverview();
    } catch (e) {
      toasts.push("error", errText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {cur.term_locked && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="size-4" />
          {tt("term_locked")}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{tt("term_progress", { a: confirmed, b: cur.rows.length })}</p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={confirmed} aria-valuemax={cur.rows.length}>
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${cur.rows.length ? (confirmed / cur.rows.length) * 100 : 0}%` }} />
          </div>
        </div>
        <Button disabled={!editable} onClick={acceptAll}>
          <CheckCircle2 className="size-4" />
          {tt("term_acceptAll")}
        </Button>
        <Button variant="primary" disabled={!editable || !changed.length} loading={saving} onClick={() => void save()}>
          <Save className="size-4" />
          {tt("term_confirm")} {changed.length ? `(${changed.length})` : ""}
        </Button>
      </div>
      {cur.rows.length === 0 ? (
        <EmptyState text={tt("att_noStudents")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:text-slate-400 dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2">{tt("student")}</th>
                <th className="px-2 py-2 text-center">{tt("jr_avg")}</th>
                <th className="px-2 py-2 text-center">{tt("term_suggested")}</th>
                <th className="px-2 py-2 text-center">{tt("term_final")}</th>
                <th className="px-2 py-2 text-center">{tt("term_year")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cur.rows.map((r) => {
                const v = eff(r);
                const reasonNeeded = r.student_id in vals && needsReason(vals[r.student_id], r.suggested);
                const yg = yearPreview(r.student_id);
                return (
                  <tr key={r.student_id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.last_name} {r.first_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{tt("term_entries", { n: r.entry_count })}</p>
                      {r.override_reason && !(r.student_id in vals) && (
                        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs" title={t("a_term_override_tip").replace("{reason}", r.override_reason)}>
                          <Badge tone="amber">{t("a_term_override_badge")}</Badge>
                          <span className="text-slate-700 dark:text-slate-300">{r.override_reason}</span>
                        </p>
                      )}
                      {reasonNeeded && (
                        <input aria-label={`${r.last_name} ${r.first_name}: ${tt("term_reason")}`} maxLength={300} className={cn(inputCls, "mt-1 min-h-11 py-1 text-xs")} placeholder={tt("term_reason")} value={reasons[r.student_id] ?? ""} onChange={(e) => setReasons((x) => ({ ...x, [r.student_id]: e.target.value }))} />
                      )}
                    </td>
                    <td className="px-2 text-center tabular-nums">{r.average?.toFixed(2) ?? "–"}</td>
                    <td className="px-2 text-center">
                      {r.suggested !== null ? (
                        <button disabled={!editable} onClick={() => setVals((x) => ({ ...x, [r.student_id]: r.suggested }))} className="rounded-lg px-2 py-1 hover:bg-slate-100 disabled:hover:bg-transparent dark:hover:bg-slate-800">
                          <Badge tone={gradeTone(r.suggested)}>{r.suggested}</Badge>
                        </button>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400" title={tt("term_notEnough")}>–</span>
                      )}
                    </td>
                    <td className="px-2 text-center">
                      <select aria-label={`${r.last_name} ${tt("term_final")}`} disabled={!editable} className={cn(selectCls, "min-h-11 w-20", r.student_id in vals && "ring-2 ring-amber-400")} value={v ?? ""} onChange={(e) => setVals((x) => ({ ...x, [r.student_id]: e.target.value === "" ? null : Number(e.target.value) }))}>
                        <option value="">–</option>
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 text-center">{yg !== null ? <Badge tone={gradeTone(yg)}>{yg}</Badge> : <span className="text-slate-500 dark:text-slate-400">–</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LessonsPanel({ b, classId, subjectId, toasts }: { b: Base; classId: string; subjectId: string; toasts: ReturnType<typeof useToasts> }) {
  const { tt, errText } = useTT();
  const today = b.me.today;
  const [date, setDate] = useState(today);
  const [no, setNo] = useState(1);
  const [topic, setTopic] = useState("");
  const [hw, setHw] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [ver, setVer] = useState(0);
  const [saving, setSaving] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const grade = b.ov.assignments.find((a) => a.class_id === classId)?.grade;
  const others = useMemo(() => b.ov.assignments.filter((a) => a.subject_id === subjectId && a.class_id !== classId && a.grade === grade), [b.ov.assignments, subjectId, classId, grade]);

  useEffect(() => {
    let live = true;
    sget<{ lessons: Lesson[] }>(`/lessons?class_id=${classId}&from=${addDays(today, -45)}&to=${today}`)
      .then((r) => live && setLessons(r.lessons.filter((l) => l.subject_id === subjectId).reverse()))
      .catch(() => live && setLessons([]));
    return () => {
      live = false;
    };
  }, [classId, subjectId, today, ver]);

  const load = (l: Lesson) => {
    setDate(l.date);
    setNo(l.lesson_no);
    setTopic(l.topic ?? "");
    setHw(l.homework ?? "");
  };
  const change = (d: string, n: number) => {
    setDate(d);
    setNo(n);
    const ex = lessons.find((l) => l.date === d && l.lesson_no === n);
    setTopic(ex?.topic ?? "");
    setHw(ex?.homework ?? "");
  };

  const save = async () => {
    setSaving(true);
    try {
      await spost("/lessons", { class_id: classId, subject_id: subjectId, date, lesson_no: no, topic, homework: hw });
      let copied = 0;
      for (const cid of targets) {
        try {
          await spost("/lessons", { class_id: cid, subject_id: subjectId, date, lesson_no: no, topic, homework: hw });
          copied++;
        } catch (e) {
          toasts.push("error", `${b.ov.assignments.find((a) => a.class_id === cid)?.class_name}: ${errText(e)}`);
        }
      }
      toasts.push("ok", copied ? tt("les_savedCopied", { n: copied }) : tt("les_saved"));
      setTargets([]);
      setVer((v) => v + 1);
      b.reloadOverview();
    } catch (e) {
      toasts.push("error", errText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={tt("date")}>
            <input type="date" max={today} className={cn(inputCls, "min-h-11")} value={date} onChange={(e) => e.target.value && change(e.target.value > today ? today : e.target.value, no)} />
          </Field>
          <Field label={tt("lesson")}>
            <select className={selectCls} value={no} onChange={(e) => change(date, Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
        <Field label={tt("les_topic")}>
          <input maxLength={300} className={cn(inputCls, "min-h-11")} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <Field label={tt("les_homework")}>
          <textarea maxLength={1000} rows={3} className={inputCls} value={hw} onChange={(e) => setHw(e.target.value)} />
        </Field>
        {others.length > 0 && (
          <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <legend className="flex items-center gap-1 px-1 text-xs font-medium text-slate-500 dark:text-slate-400"><Copy className="size-3" />{tt("les_copyTo")}</legend>
            <div className="flex flex-wrap gap-2">
              {others.map((a) => (
                <label key={a.class_id} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700">
                  <input type="checkbox" checked={targets.includes(a.class_id)} onChange={(e) => setTargets((t) => (e.target.checked ? [...t, a.class_id] : t.filter((x) => x !== a.class_id)))} />
                  {a.class_name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          <Save className="size-4" />
          {tt("save")}
        </Button>
      </Card>
      <Card className="max-h-96 overflow-y-auto">
        <h3 className="mb-2 text-sm font-bold">{tt("les_recent")}</h3>
        {lessons.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{tt("noData")}</p> : (
          <ul className="space-y-1">
            {lessons.map((l) => (
              <li key={l.id}>
                <button onClick={() => load(l)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(l.date)} · #{l.lesson_no}</span>
                  <span className="block truncate">{l.topic || "–"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
